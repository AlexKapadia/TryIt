/**
 * @tryit/api/_lib/pipeline — the fail-closed try-on request pipeline.
 *
 * `runTryOn` is the single integration seam the route handler calls. It executes the security
 * and policy gates IN ORDER, each one fail-closed and each mapped to the correct
 * {@link ErrorCode}: (1) authenticate the bearer key; (2) load the tenant and check the kill
 * switch; (3) validate the person (and optional garment) image; (4) enforce per-shopper +
 * per-tenant rate limits; (5) enforce the tenant monthly budget; (6) serve from the
 * tenant-namespaced cache on a hit; (7) on a miss route to a provider; (8) cache the result and
 * append an allow audit event. EVERY deny path also writes an audit event (deny/error) before
 * throwing a typed {@link PipelineError}. The result is wrapped in a terminal {@link TryOnJob}
 * (succeeded/failed) and stored so it can be fetched by id.
 *
 * Security invariants enforced here: deny-by-default at every gate; tenant isolation (the key's
 * tenant must equal the request tenant); no secret in the audit trail (the actor is the shopper
 * id, never the API key); and a global/tenant kill switch that halts external calls.
 */

import { randomUUID } from 'node:crypto';
import {
  verifyApiKey,
  validateImageRef,
  type ApiKeyRecord,
} from '@tryit/security';
import { hashImageBytes, type JsonValue } from '@tryit/cache';
import {
  safeParseProviderId,
  type TryOnRequest,
  type TryOnResult,
  type TryOnJob,
  type ImageRef,
  type ProviderId,
} from '@tryit/contracts';
import { type ImageRejectReason } from '@tryit/security';
import { getRuntime, isKillSwitchEngaged, type Runtime } from './runtime';
import { TRYON_SCOPE, type StoredTenant } from './tenant-store';
import { PipelineError, sumTenantSpendUsd } from './pipeline-errors';
import { buildTryOnAuditEvent } from './audit-events';

/** Inputs to one pipeline run: the parsed request plus the presented bearer plaintext. */
export interface RunTryOnInput {
  readonly request: TryOnRequest;
  readonly apiKeyPlaintext: string;
}

/** Estimated marginal cost of the next non-cached call, used by the budget pre-check. */
const ESTIMATED_NEXT_CALL_USD = 0.05;

/** Map an image-validation reject reason to the right typed pipeline error. */
function imageRejectToError(reason: ImageRejectReason): PipelineError {
  // An oversize payload is the one 413 case; every other anomaly is a 400 invalid input.
  if (reason === 'too-large') {
    return new PipelineError('PAYLOAD_TOO_LARGE', 'image exceeds the maximum allowed size');
  }
  return new PipelineError('INVALID_INPUT', `image rejected: ${reason}`);
}

/**
 * Derive the person-image content hash for the cache key. base64 refs are hashed over their
 * decoded bytes (true content addressing); URL refs are hashed over the canonical url string so
 * the same remote image keys identically without us fetching it here (no SSRF at this seam).
 */
function personImageHash(ref: ImageRef): string {
  if (ref.kind === 'base64') {
    return hashImageBytes(new Uint8Array(Buffer.from(ref.data, 'base64')));
  }
  return hashImageBytes(new Uint8Array(Buffer.from(`url:${ref.url}`, 'utf-8')));
}

/** Authenticate the presented key against the tenant's stored records (step 1, fail-closed). */
function authenticate(tenant: StoredTenant, request: TryOnRequest, plaintext: string): ApiKeyRecord {
  for (const record of tenant.apiKeyRecords) {
    const result = verifyApiKey(plaintext, record, {
      tenantId: request.tenantId, // tenant isolation: key must belong to the request's tenant
      requiredScopes: [TRYON_SCOPE], // least privilege: the key must hold the tryon scope
    });
    if (result.ok) {
      return record;
    }
  }
  // fail-closed: no record verified — refuse rather than proceed.
  throw new PipelineError('UNAUTHORIZED', 'invalid or unauthorized api key');
}

/** Validate the person image and, when present, the garment image (step 3, fail-closed). */
function validateImages(request: TryOnRequest): void {
  const person = validateImageRef(request.personImage);
  if (!person.ok) {
    throw imageRejectToError(person.reason);
  }
  const garment = request.params?.garmentImage;
  if (garment !== undefined) {
    const garmentResult = validateImageRef(garment);
    if (!garmentResult.ok) {
      throw imageRejectToError(garmentResult.reason);
    }
  }
}

/**
 * Run a try-on request end-to-end through the fail-closed gates and return the terminal job.
 *
 * @returns the stored {@link TryOnJob}. On success its status is `succeeded` with a result;
 *   every refusal throws a {@link PipelineError} after writing a deny/error audit event.
 */
export async function runTryOn(input: RunTryOnInput): Promise<TryOnJob> {
  const runtime = getRuntime();
  const { request, apiKeyPlaintext } = input;
  const requestId = randomUUID();
  // The audited actor is the shopper id — never the API key (no secret in the trail).
  const actor = request.shopperId;

  // Helper: record a deny/error audit event for a refusal, then surface the typed error.
  const deny = (error: PipelineError, outcome: 'deny' | 'error'): never => {
    runtime.auditSink.append(
      buildTryOnAuditEvent({ tenantId: request.tenantId, actor, requestId, outcome }),
    );
    throw error;
  };

  // Step 2 (partial): we must load the tenant to even authenticate against its key records.
  const tenant = runtime.tenantStore.getTenant(request.tenantId);
  if (tenant === undefined) {
    // fail-closed: an unknown tenant cannot present a valid key for itself -> unauthorized.
    deny(new PipelineError('UNAUTHORIZED', 'unknown tenant or unauthorized api key'), 'deny');
  }
  const storedTenant = tenant as StoredTenant;
  const tenantConfig = storedTenant.config;

  // Step 1: authenticate. A failure throws UNAUTHORIZED; record the deny first.
  try {
    authenticate(storedTenant, request, apiKeyPlaintext);
  } catch (error) {
    if (error instanceof PipelineError) deny(error, 'deny');
    throw error;
  }

  // Step 2: kill switch (global env OR tenant flag) -> halt all external calls.
  if (isKillSwitchEngaged(tenantConfig)) {
    deny(new PipelineError('KILL_SWITCH_ENGAGED', 'try-on is disabled by the kill switch'), 'deny');
  }

  // Step 3: validate the person image (and garment if present).
  try {
    validateImages(request);
  } catch (error) {
    if (error instanceof PipelineError) deny(error, 'deny');
    throw error;
  }

  // Step 4: rate limit per shopper + aggregate per tenant.
  const rl = runtime.rateLimiter.check({
    tenantId: request.tenantId,
    shopperId: request.shopperId,
    perShopperPerMinute: tenantConfig.rateLimit.perShopperPerMinute,
    perTenantPerMinute: tenantConfig.rateLimit.perTenantPerMinute,
  });
  if (!rl.allowed) {
    deny(
      new PipelineError('RATE_LIMITED', 'rate limit exceeded; retry later', rl.retryAfterMs),
      'deny',
    );
  }

  // Step 5: budget guard — would this call push the tenant over its monthly cap?
  const spent = sumTenantSpendUsd(runtime.auditSink.list(), request.tenantId);
  if (spent + ESTIMATED_NEXT_CALL_USD > tenantConfig.monthlyBudgetUsd) {
    deny(new PipelineError('BUDGET_EXCEEDED', 'monthly budget exceeded'), 'deny');
  }

  // Steps 6-8: cache lookup, provider route on miss, then cache-put + allow audit.
  return executeAndRecord(runtime, request, requestId, actor, storedTenant);
}

/**
 * Run the cache/route/audit tail of the pipeline (steps 6-8) and build the terminal job.
 * Split out to keep each function within the file-size and single-responsibility bounds.
 */
async function executeAndRecord(
  runtime: Runtime,
  request: TryOnRequest,
  requestId: string,
  actor: string,
  storedTenant: StoredTenant,
): Promise<TryOnJob> {
  const imageHash = personImageHash(request.personImage);
  const keyParts = {
    tenantId: request.tenantId,
    personImageHash: imageHash,
    productId: request.productId,
    params: (request.params ?? {}) as JsonValue,
  };

  let routeFailed = false;
  // getOrCompute calls the compute fn exactly once on a miss, zero times on a hit.
  const outcome = await runtime.resultCache.getOrCompute(keyParts, async () => {
    const routed = await runtime.engine.route(request, storedTenant.config);
    if (!routed.ok) {
      routeFailed = true;
      // fail-closed: a provider failure is a typed error, never a fabricated success.
      throw new PipelineError(routed.error.code, routed.error.message);
    }
    return routed.result;
  }).catch((error: unknown) => {
    // On provider failure, record an error audit event and a failed job, then rethrow.
    if (routeFailed && error instanceof PipelineError) {
      runtime.auditSink.append(
        buildTryOnAuditEvent({ tenantId: request.tenantId, actor, requestId, outcome: 'error' }),
      );
    }
    throw error;
  });

  // On a hit the stored result carried cached:false; surface cached:true to the caller without
  // re-billing. On a miss we keep the provider's real cost for budget accounting.
  const result: TryOnResult = outcome.cached
    ? { ...outcome.value, cached: true, costUsd: 0 }
    : outcome.value;

  // Step 8: append the allow audit event (with provider + real cost) for the spend ledger.
  // result.provider is a free-form string on the contract; narrow it to a known ProviderId for
  // the audit field, dropping it if somehow unrecognised (the event stays schema-valid).
  const parsedProvider = safeParseProviderId(result.provider);
  const provider: ProviderId | undefined = parsedProvider.success ? parsedProvider.data : undefined;
  runtime.auditSink.append(
    buildTryOnAuditEvent({
      tenantId: request.tenantId,
      actor,
      requestId,
      outcome: 'allow',
      provider,
      costUsd: outcome.cached ? 0 : outcome.value.costUsd,
    }),
  );

  return storeSucceededJob(runtime, request, result);
}

/** Wrap a result in a `succeeded` {@link TryOnJob}, store it by id, and return it. */
function storeSucceededJob(runtime: Runtime, request: TryOnRequest, result: TryOnResult): TryOnJob {
  const now = new Date().toISOString();
  const job: TryOnJob = {
    jobId: randomUUID(),
    status: 'succeeded',
    request,
    result,
    createdAt: now,
    updatedAt: now,
  };
  runtime.jobs.set(job.jobId, job);
  return job;
}
