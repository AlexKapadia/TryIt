/**
 * Tests for canReadJob — the tenant-scoped authorisation gate for reading a stored job.
 *
 * These prove the cross-tenant leak (threat I1) is closed at the unit level with REAL crypto:
 * two tenants each mint a real `tryon` key via `createApiKey`, and the gate is exercised across
 * every fail-closed branch — null/empty credential, unknown job-tenant, wrong secret, a VALID key
 * for the WRONG tenant (the headline I1 case), a key missing the `tryon` scope, and the single
 * allow path (the owning tenant's key). A minimal fake Runtime supplies just the two collaborators
 * the gate touches, so the test is hermetic and the authorisation logic is the only thing measured.
 */

import { describe, it, expect } from 'vitest';
import { createApiKey } from '@tryit/security';
import type { TryOnJob } from '@tryit/contracts';
import { canReadJob } from './job-access';
import type { Runtime } from './runtime';
import type { StoredTenant } from './tenant-store';
import { TRYON_SCOPE } from './tenant-store';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const keyA = createApiKey({ tenantId: TENANT_A, scopes: [TRYON_SCOPE] });
const keyB = createApiKey({ tenantId: TENANT_B, scopes: [TRYON_SCOPE] });
// A key for tenant A that lacks the tryon scope — verification must refuse it (least privilege).
const keyAWrongScope = createApiKey({ tenantId: TENANT_A, scopes: ['other'] });

/** Build a minimal Runtime exposing only the tenantStore the gate consults. */
function runtimeWith(tenants: Record<string, StoredTenant>): Runtime {
  const store = {
    getTenant: (id: string): StoredTenant | undefined => tenants[id],
    getDemoApiKeyPlaintext: (): string | undefined => undefined,
    getDemoTenantId: (): string => TENANT_A,
  };
  // Cast: the gate only reads `tenantStore`; the rest of the Runtime is irrelevant here.
  return { tenantStore: store } as unknown as Runtime;
}

/** A succeeded job belonging to `tenantId`. */
function jobFor(tenantId: string): TryOnJob {
  return {
    jobId: 'job-1',
    status: 'succeeded',
    request: {
      tenantId,
      shopperId: 'shopper-1',
      personImage: { kind: 'url', url: 'https://images.example/p.jpg' },
      productId: 'product-1',
      category: 'apparel',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const tenantA: StoredTenant = {
  config: {
    tenantId: TENANT_A,
    allowedProviders: ['deterministic'],
    rateLimit: { perShopperPerMinute: 30, perTenantPerMinute: 600 },
    monthlyBudgetUsd: 100,
    retentionSeconds: 0,
    killSwitch: false,
  },
  apiKeyRecords: [keyA.record, keyAWrongScope.record],
};
const tenantB: StoredTenant = {
  config: { ...tenantA.config, tenantId: TENANT_B },
  apiKeyRecords: [keyB.record],
};

describe('canReadJob — allow path', () => {
  it("authorises the OWNING tenant's valid tryon key", () => {
    const rt = runtimeWith({ [TENANT_A]: tenantA });
    expect(canReadJob(rt, keyA.plaintext, jobFor(TENANT_A))).toBe(true);
  });
});

describe('canReadJob — fail-closed denials', () => {
  it('refuses a null credential', () => {
    const rt = runtimeWith({ [TENANT_A]: tenantA });
    expect(canReadJob(rt, null, jobFor(TENANT_A))).toBe(false);
  });

  it('refuses an empty-string credential', () => {
    const rt = runtimeWith({ [TENANT_A]: tenantA });
    expect(canReadJob(rt, '', jobFor(TENANT_A))).toBe(false);
  });

  it("refuses when the job's tenant is unknown to the store", () => {
    const rt = runtimeWith({}); // no tenants registered
    expect(canReadJob(rt, keyA.plaintext, jobFor(TENANT_A))).toBe(false);
  });

  it('refuses a wrong secret for the right tenant', () => {
    const rt = runtimeWith({ [TENANT_A]: tenantA });
    expect(canReadJob(rt, 'totally-wrong-secret', jobFor(TENANT_A))).toBe(false);
  });

  it("refuses a VALID key for the WRONG tenant — the I1 cross-tenant leak case", () => {
    // tenant B's genuine key, presented to read tenant A's job, must be refused.
    const rt = runtimeWith({ [TENANT_A]: tenantA, [TENANT_B]: tenantB });
    expect(canReadJob(rt, keyB.plaintext, jobFor(TENANT_A))).toBe(false);
  });

  it("refuses tenant A's own key that lacks the tryon scope (least privilege)", () => {
    const rt = runtimeWith({ [TENANT_A]: tenantA });
    expect(canReadJob(rt, keyAWrongScope.plaintext, jobFor(TENANT_A))).toBe(false);
  });
});
