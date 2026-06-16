/**
 * Integration tests for the try-on pipeline policy gates: rate limiting, budget, and cache.
 *
 * These call `runTryOn` directly (the same seam the route handler uses) with the parsed request,
 * so they assert the ordered, fail-closed gates without the HTTP layer. The deterministic
 * provider is the offline default. Singletons reset before each test. Assertions are boundary-
 * exact (exactly-at vs just-over the cap) and verify the provider is invoked the right number of
 * times via the audit ledger — they would fail if a gate fail-opened or double-counted.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseTryOnRequest } from '@tryit/contracts';
import { runTryOn } from './pipeline';
import { isPipelineError } from './pipeline-errors';
import { getRuntime } from './runtime';
import { buildTryOnAuditEvent } from './audit-events';
import { resetRuntime, demoApiKey, buildTryOnBody, DEMO_TENANT } from './test-helpers';

beforeEach(() => {
  resetRuntime();
  delete process.env.TRYIT_KILL_SWITCH;
});
afterEach(() => {
  delete process.env.TRYIT_KILL_SWITCH;
});

/** Run one try-on for a given shopper with valid creds, returning the typed error code or null. */
async function attempt(shopperId: string, productId = 'product-1'): Promise<string | null> {
  const request = parseTryOnRequest(buildTryOnBody({ shopperId, productId }));
  try {
    await runTryOn({ request, apiKeyPlaintext: demoApiKey() });
    return null;
  } catch (error) {
    if (isPipelineError(error)) return error.apiError.code;
    throw error;
  }
}

/**
 * Pre-consume `count` rate-limit slots for a (tenant, shopper) pair via the runtime limiter
 * directly. This fills the buckets WITHOUT paying the scrypt auth cost a full `runTryOn` would,
 * so the boundary tests run fast while still exercising the real shared limiter the pipeline uses.
 */
function consumeSlots(shopperId: string, count: number): void {
  const limiter = getRuntime().rateLimiter;
  for (let i = 0; i < count; i += 1) {
    const r = limiter.check({
      tenantId: DEMO_TENANT,
      shopperId,
      perShopperPerMinute: 30,
      perTenantPerMinute: 600,
    });
    if (!r.allowed) {
      throw new Error(`consumeSlots: limiter denied at slot ${i} (cap too low for fixture)`);
    }
  }
}

describe('rate limiting (429)', () => {
  it('allows the 30th per-shopper slot then denies the 31st with RATE_LIMITED', async () => {
    // Pre-consume 29 of the 30 per-shopper slots; the next real call is slot 30 (allowed) and
    // the one after is slot 31 (denied) — boundary-exact at the per-shopper cap.
    consumeSlots('rl-shopper', 29);
    expect(await attempt('rl-shopper')).toBeNull(); // slot 30: allowed
    expect(await attempt('rl-shopper')).toBe('RATE_LIMITED'); // slot 31: denied
  });

  it('denies via the aggregate per-tenant cap even for a shopper with per-shopper headroom', async () => {
    // Fill the tenant bucket to its 600 cap using many distinct shoppers (each well under its own
    // 30 cap), so a brand-new shopper with full per-shopper headroom is still denied — proving the
    // aggregate tenant cap binds independently of any per-shopper cap.
    for (let s = 0; s < 60; s += 1) {
      consumeSlots(`filler-${s}`, 10); // 60 * 10 = 600 = the tenant cap, no per-shopper exhaustion
    }
    const code = await attempt('fresh-shopper'); // first-ever call for this shopper
    expect(code).toBe('RATE_LIMITED');
  });
});

describe('budget guard (402)', () => {
  it('denies with BUDGET_EXCEEDED once seeded spend is at the cap', async () => {
    // Seed the audit ledger with allow-spend at the tenant's $100 cap, so the next estimated
    // call ($0.05) pushes it over the monthly budget.
    const runtime = getRuntime();
    runtime.auditSink.append(
      buildTryOnAuditEvent({
        tenantId: DEMO_TENANT,
        actor: 'seed',
        requestId: 'seed-req',
        outcome: 'allow',
        provider: 'fal',
        costUsd: 100,
      }),
    );
    const code = await attempt('budget-shopper');
    expect(code).toBe('BUDGET_EXCEEDED');
  });

  it('allows when spend is below the cap with headroom for the next call', async () => {
    const runtime = getRuntime();
    runtime.auditSink.append(
      buildTryOnAuditEvent({
        tenantId: DEMO_TENANT,
        actor: 'seed',
        requestId: 'seed-req',
        outcome: 'allow',
        provider: 'fal',
        costUsd: 50,
      }),
    );
    expect(await attempt('budget-ok-shopper')).toBeNull();
  });
});

describe('cache (hit returns cached:true, provider invoked once)', () => {
  it('serves the second identical request from cache and routes exactly once', async () => {
    const request = parseTryOnRequest(buildTryOnBody({ shopperId: 'cache-shopper' }));
    const key = demoApiKey();

    // Count EngineRouter.route calls: a cache hit must not call it at all (compute runs zero
    // times on a hit), so two identical requests must route exactly once total.
    const runtime = getRuntime();
    const engine = runtime.engine as unknown as { route: (...args: unknown[]) => unknown };
    const original = engine.route.bind(engine);
    let routeCalls = 0;
    engine.route = (...args: unknown[]) => {
      routeCalls += 1;
      return original(...args);
    };

    const first = await runTryOn({ request, apiKeyPlaintext: key });
    expect(first.result?.cached).toBe(false);

    const second = await runTryOn({ request, apiKeyPlaintext: key });
    expect(second.result?.cached).toBe(true);

    expect(routeCalls).toBe(1); // boundary-exact: the second request did NOT re-route.
    expect(first.result?.resultImageUrl).toBe(second.result?.resultImageUrl);

    // Two allow audit events were written (one per request), proving both reached step 8.
    const allow = getRuntime().auditSink.list().filter((e) => e.outcome === 'allow');
    expect(allow).toHaveLength(2);
  });
});
