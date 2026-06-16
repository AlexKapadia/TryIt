/**
 * @tryit/security/rate-limit — token-bucket sliding-window rate limiter.
 *
 * Bounds how many try-on requests a shopper and a tenant may make per minute. Two caps apply
 * together: a per-shopper cap and an aggregate per-tenant cap. The tenant cap counts every
 * shopper and every key under that tenant, so rotating keys or spreading load across shopper
 * ids cannot exceed it (threat D2: cost-amplification / key-rotation abuse). The clock is
 * injected so behaviour is deterministic and testable with no reliance on wall time. Fail-closed
 * sizing: a non-positive cap denies all traffic rather than allowing it through.
 */

/** A monotonic-enough source of the current epoch time in ms. Injected for testability. */
export interface Clock {
  now(): number;
}

/** Storage for per-key request timestamps. Pluggable so a Redis-backed store can drop in. */
export interface RateLimitStore {
  /** Return the recorded request timestamps (ms) for a bucket key. */
  get(key: string): number[];
  /** Replace the recorded timestamps for a bucket key. */
  set(key: string, timestamps: number[]): void;
}

/** Default in-process store. Not durable across restarts — production wires a shared store. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, number[]>();

  get(key: string): number[] {
    return this.buckets.get(key) ?? [];
  }

  set(key: string, timestamps: number[]): void {
    this.buckets.set(key, timestamps);
  }
}

/** The sliding window length in milliseconds (one minute). */
const WINDOW_MS = 60_000;

/** Inputs to a single rate-limit decision. */
export interface RateLimitCheckInput {
  readonly tenantId: string;
  readonly shopperId: string;
  /** Max requests per shopper per 60s window. */
  readonly perShopperPerMinute: number;
  /** Max aggregate requests per tenant per 60s window (across all shoppers/keys). */
  readonly perTenantPerMinute: number;
}

/** The decision: whether to allow, and if denied how long until the window frees a slot. */
export interface RateLimitResult {
  readonly allowed: boolean;
  /** Milliseconds until the caller may retry. 0 when allowed. */
  readonly retryAfterMs: number;
}

/** Construct a limiter over an injected clock and store (in-memory by default). */
export class RateLimiter {
  constructor(
    private readonly clock: Clock,
    private readonly store: RateLimitStore = new InMemoryRateLimitStore(),
  ) {}

  /**
   * Decide whether a request is allowed. A request consumes one slot from BOTH the shopper
   * bucket and the tenant bucket; it is allowed only if both have headroom. On allow, the
   * timestamp is recorded in both buckets so the count is exact. On deny, nothing is recorded
   * (the request did not happen) and `retryAfterMs` reports when the oldest in-window request
   * for the limiting bucket falls out of the window.
   */
  check(input: RateLimitCheckInput): RateLimitResult {
    const now = this.clock.now();
    const cutoff = now - WINDOW_MS;

    // fail-closed: a non-positive cap means "no requests permitted".
    if (input.perShopperPerMinute <= 0 || input.perTenantPerMinute <= 0) {
      return { allowed: false, retryAfterMs: WINDOW_MS };
    }

    const shopperKey = `s:${input.tenantId}:${input.shopperId}`;
    const tenantKey = `t:${input.tenantId}`;

    const shopperHits = prune(this.store.get(shopperKey), cutoff);
    const tenantHits = prune(this.store.get(tenantKey), cutoff);

    const shopperFull = shopperHits.length >= input.perShopperPerMinute;
    const tenantFull = tenantHits.length >= input.perTenantPerMinute;

    if (shopperFull || tenantFull) {
      // Persist the pruned windows so stale timestamps do not accumulate.
      this.store.set(shopperKey, shopperHits);
      this.store.set(tenantKey, tenantHits);
      const retryAfterMs = computeRetryAfterMs(
        now,
        shopperFull ? shopperHits : [],
        tenantFull ? tenantHits : [],
      );
      return { allowed: false, retryAfterMs };
    }

    // Allowed: record the request in both buckets so the aggregate stays exact.
    shopperHits.push(now);
    tenantHits.push(now);
    this.store.set(shopperKey, shopperHits);
    this.store.set(tenantKey, tenantHits);
    return { allowed: true, retryAfterMs: 0 };
  }
}

/** Drop timestamps at or before the window cutoff, returning a fresh in-window array. */
function prune(timestamps: readonly number[], cutoff: number): number[] {
  return timestamps.filter((t) => t > cutoff);
}

/**
 * Time until the limiting bucket frees a slot: the oldest in-window hit across the full
 * bucket(s) leaves the window at `oldest + WINDOW_MS`. Takes the max across full buckets so the
 * caller waits long enough for whichever cap is binding. Always at least 1ms.
 */
function computeRetryAfterMs(
  now: number,
  fullShopperHits: readonly number[],
  fullTenantHits: readonly number[],
): number {
  let retry = 0;
  for (const hits of [fullShopperHits, fullTenantHits]) {
    if (hits.length === 0) continue;
    const oldest = Math.min(...hits);
    const wait = oldest + WINDOW_MS - now;
    if (wait > retry) retry = wait;
  }
  return Math.max(retry, 1);
}
