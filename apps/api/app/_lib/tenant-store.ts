/**
 * @tryit/api/_lib/tenant-store — tenant policy + API-key lookup behind a pluggable seam.
 *
 * The API needs two tenant-scoped facts on every request: the tenant's {@link TenantConfig}
 * policy (rate limits, budget, allowed providers, kill switch) and the stored
 * {@link ApiKeyRecord}(s) used to authenticate a presented bearer key. This module defines a
 * {@link TenantStore} interface so production can swap an in-memory map for a database without
 * touching the pipeline, plus an {@link InMemoryTenantStore} seeded with a single demo tenant
 * for offline development and the e2e/demo-shop flow.
 *
 * Security note: the store keeps only a salted hash of each API key (never the plaintext) for
 * verification. The single exception is the demo tenant, whose generated plaintext is retained
 * in memory ONLY so the dev-credentials endpoint can hand a working key to local clients; that
 * endpoint is itself gated to non-production (fail-closed) so the plaintext never escapes a dev
 * process. No real tenant key is ever stored in plaintext.
 */

import { createApiKey, type ApiKeyRecord } from '@tryit/security';
import { type TenantConfig } from '@tryit/contracts';

/** The fixed tenant id used by the seeded demo tenant in development. */
export const DEMO_TENANT_ID = 'demo-tenant';

/** The scope the try-on endpoint requires a key to hold (least privilege). */
export const TRYON_SCOPE = 'tryon';

/**
 * A tenant record as the store holds it: the policy config plus the verification records for
 * every API key minted under the tenant. Plaintext is deliberately absent here — it lives only
 * in the dev-only demo accessor below.
 */
export interface StoredTenant {
  readonly config: TenantConfig;
  readonly apiKeyRecords: readonly ApiKeyRecord[];
}

/**
 * Pluggable tenant lookup. Production swaps the in-memory implementation for a DB-backed one
 * behind this same interface; the pipeline depends only on these methods.
 */
export interface TenantStore {
  /** Return the tenant by id, or `undefined` when no such tenant exists (fail-closed). */
  getTenant(tenantId: string): StoredTenant | undefined;
  /** The plaintext API key for the seeded demo tenant, when one is retained (dev only). */
  getDemoApiKeyPlaintext(): string | undefined;
  /** The demo tenant id, for the dev-credentials endpoint. */
  getDemoTenantId(): string;
}

/** Build the demo tenant's policy. Conservative, offline-friendly defaults. */
function buildDemoTenantConfig(): TenantConfig {
  return {
    tenantId: DEMO_TENANT_ID,
    // deterministic is always permitted so the API works fully offline (no external keys).
    allowedProviders: ['deterministic', 'fal', 'self-hosted'],
    rateLimit: {
      perShopperPerMinute: 30,
      perTenantPerMinute: 600,
    },
    monthlyBudgetUsd: 100,
    // retentionSeconds 0: results are not retained beyond the request (privacy by default).
    retentionSeconds: 0,
    killSwitch: false,
  };
}

/**
 * In-memory tenant store seeded with one demo tenant.
 *
 * At construction it mints a `tryon`-scoped API key for the demo tenant via
 * {@link createApiKey}, stores only the salted-hash record for verification, and retains the
 * one-time plaintext in a private field so the dev-credentials endpoint can surface it. Not
 * durable across restarts — production wires a real store behind {@link TenantStore}.
 */
export class InMemoryTenantStore implements TenantStore {
  readonly #tenants = new Map<string, StoredTenant>();
  // dev-only: retained so a local client can obtain a working key; never exposed in prod.
  readonly #demoApiKeyPlaintext: string;

  constructor() {
    const created = createApiKey({ tenantId: DEMO_TENANT_ID, scopes: [TRYON_SCOPE] });
    this.#demoApiKeyPlaintext = created.plaintext; // kept in memory for the dev endpoint only
    this.#tenants.set(DEMO_TENANT_ID, {
      config: buildDemoTenantConfig(),
      apiKeyRecords: [created.record], // only the salted hash is persisted for verification
    });
  }

  getTenant(tenantId: string): StoredTenant | undefined {
    // fail-closed: an unknown tenant returns undefined; callers reject rather than assume.
    return this.#tenants.get(tenantId);
  }

  getDemoApiKeyPlaintext(): string | undefined {
    return this.#demoApiKeyPlaintext;
  }

  getDemoTenantId(): string {
    return DEMO_TENANT_ID;
  }
}
