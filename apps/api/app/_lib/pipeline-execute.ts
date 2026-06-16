/**
 * @tryit/api/_lib/pipeline-execute — the cache/route/store tail of the try-on pipeline (steps 6-8).
 *
 * Split out of `pipeline.ts` (which owns the security/policy gates, steps 1-5) to keep each file
 * within the single-responsibility + file-size bounds. Two seams are exported back to the gate
 * pipeline: {@link lookupIdempotentJob} (the pre-provider replay check) and
 * {@link executeAndRecord} (cache lookup -> provider route on miss -> cache-put + allow audit ->
 * store the terminal job). Every fabricated-success path is still fail-closed: a provider failure
 * throws a typed {@link PipelineError} after writing an error audit event, never a fake job.
 */

import { randomUUID } from 'node:crypto';
import { hashImageBytes, type JsonValue } from '@tryit/cache';
import {
  safeParseProviderId,
  type TryOnRequest,
  type TryOnResult,
  type TryOnJob,
  type ImageRef,
  type ProviderId,
} from '@tryit/contracts';
import { idempotencyIndexKey, type Runtime } from './runtime';
import { type StoredTenant } from './tenant-store';
import { PipelineError } from './pipeline-errors';
import { buildTryOnAuditEvent } from './audit-events';

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

/**
 * Return a previously-stored job for (tenantId, idempotencyKey), or `undefined` on a miss/absent
 * key. Fail-open ONLY on an absent key (the normal, non-idempotent path). A present key consults
 * the tenant-scoped index; a dangling index entry (job since evicted) is treated as a miss so the
 * request re-runs rather than failing.
 */
export function lookupIdempotentJob(
  runtime: Runtime,
  tenantId: string,
  idempotencyKey: string | undefined,
): TryOnJob | undefined {
  if (idempotencyKey === undefined) {
    return undefined; // normal path: no idempotency requested.
  }
  const indexKey = idempotencyIndexKey(tenantId, idempotencyKey);
  const priorJobId = runtime.jobsByIdempotencyKey.get(indexKey);
  if (priorJobId === undefined) {
    return undefined;
  }
  return runtime.jobs.get(priorJobId);
}

/**
 * Run the cache/route/audit tail of the pipeline (steps 6-8) and build the terminal job.
 */
export async function executeAndRecord(
  runtime: Runtime,
  request: TryOnRequest,
  requestId: string,
  actor: string,
  storedTenant: StoredTenant,
  idempotencyKey: string | undefined,
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

  return storeSucceededJob(runtime, request, result, idempotencyKey);
}

/**
 * Wrap a result in a `succeeded` {@link TryOnJob}, store it by id, and return it. When an
 * `idempotencyKey` is present it is recorded on the job and a tenant-scoped index entry is added
 * so a later replay of the same (tenant, key) returns this job without a second provider call.
 */
function storeSucceededJob(
  runtime: Runtime,
  request: TryOnRequest,
  result: TryOnResult,
  idempotencyKey: string | undefined,
): TryOnJob {
  const now = new Date().toISOString();
  const job: TryOnJob = {
    jobId: randomUUID(),
    status: 'succeeded',
    request,
    result,
    createdAt: now,
    updatedAt: now,
    // Only set the optional field when present — exactOptionalPropertyTypes forbids `undefined`.
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  };
  runtime.jobs.set(job.jobId, job);
  if (idempotencyKey !== undefined) {
    // Index by (tenant, key) so the next identical request replays this job (cost control).
    runtime.jobsByIdempotencyKey.set(idempotencyIndexKey(request.tenantId, idempotencyKey), job.jobId);
  }
  return job;
}
