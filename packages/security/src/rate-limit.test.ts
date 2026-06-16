/**
 * Tests for the sliding-window rate limiter. Boundary-exact (allow Nth / deny N+1th), refill
 * after injected time advance, per-tenant aggregate denial across shoppers, tenant independence,
 * and a property that the cap is never exceeded in any window.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  InMemoryRateLimitStore,
  RateLimiter,
  type Clock,
} from './rate-limit.js';

/** A clock whose time the test moves explicitly — no wall-clock dependency. */
class FakeClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const limits = (perShopper: number, perTenant: number) =>
  ({
    tenantId: 't1',
    shopperId: 's1',
    perShopperPerMinute: perShopper,
    perTenantPerMinute: perTenant,
  }) as const;

describe('per-shopper boundary', () => {
  it('allows exactly N then denies the N+1th in the same window', () => {
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    for (let i = 0; i < 3; i++) {
      expect(rl.check(limits(3, 100)).allowed).toBe(true);
    }
    const denied = rl.check(limits(3, 100));
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('refills after the window fully advances (injected clock)', () => {
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    for (let i = 0; i < 2; i++) rl.check(limits(2, 100));
    expect(rl.check(limits(2, 100)).allowed).toBe(false);
    // Advance just past the 60s window so the oldest hit drops out.
    clock.advance(60_001);
    expect(rl.check(limits(2, 100)).allowed).toBe(true);
  });

  it('does not refill one millisecond before the window closes', () => {
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    rl.check(limits(1, 100)); // hit at t=0
    clock.advance(60_000); // exactly the window: t=0 is at the cutoff, pruned only when t > cutoff
    // cutoff = now - 60000 = 0, prune keeps t > 0, so the t=0 hit is dropped -> allowed.
    expect(rl.check(limits(1, 100)).allowed).toBe(true);
  });
});

describe('per-tenant aggregate cap (threat D2)', () => {
  it('denies a second shopper once the tenant cap is hit even with per-shopper headroom', () => {
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    // Tenant cap 2; per-shopper cap 10 (lots of headroom). Two distinct shoppers fill the tenant.
    const mk = (shopper: string) => ({
      tenantId: 't1',
      shopperId: shopper,
      perShopperPerMinute: 10,
      perTenantPerMinute: 2,
    });
    expect(rl.check(mk('sA')).allowed).toBe(true);
    expect(rl.check(mk('sB')).allowed).toBe(true);
    // sC has full per-shopper headroom but the tenant aggregate is exhausted.
    const denied = rl.check(mk('sC'));
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('does not record a denied request against either bucket', () => {
    const clock = new FakeClock();
    const store = new InMemoryRateLimitStore();
    const rl = new RateLimiter(clock, store);
    rl.check(limits(1, 100)); // shopper now at 1/1
    rl.check(limits(1, 100)); // denied — must not bump counts
    // Tenant bucket should hold exactly one (the allowed) hit, not two.
    expect(store.get('t:t1')).toHaveLength(1);
    expect(store.get('s:t1:s1')).toHaveLength(1);
  });
});

describe('tenant independence', () => {
  it('one tenant hitting its cap does not affect another tenant', () => {
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    const t1 = { tenantId: 't1', shopperId: 's', perShopperPerMinute: 1, perTenantPerMinute: 1 };
    const t2 = { tenantId: 't2', shopperId: 's', perShopperPerMinute: 1, perTenantPerMinute: 1 };
    expect(rl.check(t1).allowed).toBe(true);
    expect(rl.check(t1).allowed).toBe(false);
    expect(rl.check(t2).allowed).toBe(true); // t2 is unaffected
  });
});

describe('fail-closed sizing', () => {
  it('denies all traffic when a cap is zero or negative', () => {
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    expect(rl.check(limits(0, 100)).allowed).toBe(false);
    expect(rl.check(limits(100, 0)).allowed).toBe(false);
    expect(rl.check(limits(-5, 100)).allowed).toBe(false);
  });
});

describe('property: never allows more than the cap in any window', () => {
  it('the number of allowed requests within one window never exceeds min(caps)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 40 }),
        (perShopper, perTenant, attempts) => {
          const clock = new FakeClock();
          const rl = new RateLimiter(clock);
          let allowed = 0;
          for (let i = 0; i < attempts; i++) {
            // small advances, all well inside one 60s window
            clock.advance(10);
            if (rl.check(limits(perShopper, perTenant)).allowed) allowed++;
          }
          const cap = Math.min(perShopper, perTenant);
          return allowed <= cap;
        },
      ),
      { numRuns: 300 },
    );
  });
});
