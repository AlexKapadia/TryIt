/**
 * Mutation-hardening tests for the sliding-window rate limiter.
 *
 * The existing suite proves allow/deny counts; these pin the EXACT `retryAfterMs` arithmetic and
 * the fail-closed sizing boundary so that mutating `> -> >=`, `Math.max -> Math.min`,
 * `oldest + WINDOW_MS - now` operators, or `<= 0 -> < 0` changes an asserted value and the test
 * fails. Boundary-exact, non-tautological — claude.md S3.6 teeth.
 */
import { describe, expect, it } from 'vitest';
import { RateLimiter, type Clock } from './rate-limit.js';

class FakeClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const input = (perShopper: number, perTenant: number) =>
  ({
    tenantId: 't1',
    shopperId: 's1',
    perShopperPerMinute: perShopper,
    perTenantPerMinute: perTenant,
  }) as const;

describe('fail-closed sizing returns the full-window retry (kills <= 0 -> < 0)', () => {
  it('a zero per-shopper cap denies with retryAfterMs exactly WINDOW_MS', () => {
    // The fail-closed branch returns retryAfterMs = 60000. If `<= 0` were mutated to `< 0`, the
    // zero cap would fall through to the normal path and compute a DIFFERENT retry value (or 1),
    // so this exact-equality assertion fails the mutant.
    const rl = new RateLimiter(new FakeClock());
    const res = rl.check(input(0, 100));
    expect(res.allowed).toBe(false);
    expect(res.retryAfterMs).toBe(60_000);
  });

  it('a zero per-tenant cap denies with retryAfterMs exactly WINDOW_MS', () => {
    const rl = new RateLimiter(new FakeClock());
    const res = rl.check(input(100, 0));
    expect(res.allowed).toBe(false);
    expect(res.retryAfterMs).toBe(60_000);
  });
});

describe('retryAfterMs is the exact time until the oldest hit leaves the window', () => {
  it('after filling the shopper bucket at t=0, the N+1th denial waits the full window', () => {
    // Oldest in-window hit is at t=0; window is 60000. At now=0 the slot frees at 0+60000-0.
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    expect(rl.check(input(1, 100)).allowed).toBe(true); // hit at t=0
    const denied = rl.check(input(1, 100)); // still t=0
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(60_000); // exact: oldest(0) + 60000 - now(0)
  });

  it('the retry shrinks by exactly the elapsed time (kills the +/- arithmetic mutant)', () => {
    // Hit at t=0, then probe at t=25000: oldest(0) + 60000 - 25000 = 35000 exactly. A mutated
    // `oldest + WINDOW_MS + now` or `oldest - WINDOW_MS` produces a different number.
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    expect(rl.check(input(1, 100)).allowed).toBe(true); // t=0
    clock.advance(25_000);
    const denied = rl.check(input(1, 100));
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(35_000);
  });

  it('uses the OLDEST in-window hit, not the newest (kills Math.min/Math.max swap)', () => {
    // Two hits at t=0 and t=10000 with shopper cap 2. Deny at t=10000: the limiting wait is from
    // the OLDEST hit (0): 0 + 60000 - 10000 = 50000. If computeRetryAfterMs used the newest hit
    // it would yield 10000 + 60000 - 10000 = 60000, failing this assertion.
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    expect(rl.check(input(2, 100)).allowed).toBe(true); // t=0
    clock.advance(10_000);
    expect(rl.check(input(2, 100)).allowed).toBe(true); // t=10000
    const denied = rl.check(input(2, 100)); // still t=10000, bucket full
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(50_000);
  });

  it('takes the MAX wait across the two binding buckets (kills wait > retry boundary)', () => {
    // Both shopper and tenant caps are 1. Shopper hit at t=0, tenant also has a hit at t=0 from a
    // different shopper recorded earlier at t=5000. We make the tenant bucket the binding one with
    // an older hit so the loop must keep the larger wait.
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    // tenant bucket: shopper sX hits at t=0 (oldest tenant hit)
    expect(
      rl.check({
        tenantId: 't1',
        shopperId: 'sX',
        perShopperPerMinute: 5,
        perTenantPerMinute: 2,
      }).allowed,
    ).toBe(true);
    clock.advance(20_000); // t=20000
    // shopper s1 hits at t=20000 (oldest shopper hit), tenant now has 2 hits, cap reached
    expect(
      rl.check({
        tenantId: 't1',
        shopperId: 's1',
        perShopperPerMinute: 1,
        perTenantPerMinute: 2,
      }).allowed,
    ).toBe(true);
    // Next s1 request: shopper bucket full (oldest 20000) AND tenant full (oldest 0).
    const denied = rl.check({
      tenantId: 't1',
      shopperId: 's1',
      perShopperPerMinute: 1,
      perTenantPerMinute: 2,
    });
    expect(denied.allowed).toBe(false);
    // shopper wait = 20000+60000-20000 = 60000; tenant wait = 0+60000-20000 = 40000. Max = 60000.
    expect(denied.retryAfterMs).toBe(60_000);
  });

  it('a brand-new key allows its first request (kills a non-empty get() default)', () => {
    // An empty bucket must read as length 0. If the store default were a non-empty array, the very
    // first request at cap 1 would already be "full" and denied. (Note: a string-sentinel default
    // is pruned away by the numeric window filter, so that specific mutant is equivalent.)
    const rl = new RateLimiter(new FakeClock());
    expect(rl.check(input(1, 100)).allowed).toBe(true);
  });

  it('computes the exact retry when only the shopper bucket is the binding cap', () => {
    // Shopper cap 1, tenant cap large. Hit at t=0, deny at t=15000: only the shopper bucket is
    // full, so the tenant arg to computeRetryAfterMs is empty. Exact retry = 0+60000-15000.
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    expect(rl.check(input(1, 1000)).allowed).toBe(true); // t=0
    clock.advance(15_000);
    const denied = rl.check(input(1, 1000));
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(45_000);
  });

  it('never returns a non-positive retry — floored at 1 (kills Math.max -> Math.min)', () => {
    // Probe at the exact instant the oldest hit leaves the window: oldest(0) + 60000 - 60000 = 0.
    // The bucket still counts it as in-window at the >= boundary, so it is denied, and the floor
    // forces retryAfterMs to 1 rather than 0. Math.min(retry,1) would yield 0 here.
    const clock = new FakeClock();
    const rl = new RateLimiter(clock);
    // cap 1; hit at t=0
    expect(rl.check(input(1, 100)).allowed).toBe(true);
    // advance to exactly 59999 so the t=0 hit is still in-window (cutoff = -1) and binding.
    clock.advance(59_999);
    const denied = rl.check(input(1, 100));
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1); // 0 + 60000 - 59999 = 1 exactly
  });
});
