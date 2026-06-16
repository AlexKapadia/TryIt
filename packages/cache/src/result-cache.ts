/**
 * @tryit/cache — tenant-namespaced get-or-compute result cache.
 *
 * What this does: wraps a {@link CacheStore} with the read-through pattern. Given
 * the content of a request ({@link CacheKeyParts}) and a compute function, it
 * returns the cached value on a hit (without calling compute) or runs compute,
 * stores the result, and returns it on a miss — reporting which happened via a
 * `cached` boolean.
 *
 * Why it exists: callers should never construct cache keys or branch on hit/miss
 * themselves; they describe the request and supply how to compute the answer.
 *
 * Security invariant (threat T1): keys come from {@link deriveCacheKey}, which is
 * tenant-namespaced, so a compute result for one tenant can never be served to
 * another. compute is invoked EXACTLY ONCE per miss and ZERO times per hit.
 */

import { deriveCacheKey, type CacheKeyParts } from './cache-key.js';
import type { CacheStore } from './cache-store.js';

/** Configuration for {@link ResultCache}. */
export interface ResultCacheOptions {
  /** Optional default TTL (ms) applied to stored values. Omit for no expiry. */
  readonly defaultTtlMs?: number;
}

/** The outcome of {@link ResultCache.getOrCompute}. */
export interface CacheOutcome<V> {
  /** The cached or freshly-computed value. */
  readonly value: V;
  /** True iff the value came from the cache (compute was not called). */
  readonly cached: boolean;
}

/**
 * Read-through cache keyed by tenant-namespaced request content.
 *
 * Programs against the {@link CacheStore} interface so the backing storage is
 * pluggable. The value type V is whatever the compute function produces.
 */
export class ResultCache<V> {
  readonly #store: CacheStore<V>;
  readonly #defaultTtlMs: number | undefined;

  constructor(store: CacheStore<V>, options: ResultCacheOptions = {}) {
    this.#store = store;
    this.#defaultTtlMs = options.defaultTtlMs;
  }

  /**
   * Return the cached value for `keyParts`, or compute, store, and return it.
   *
   * Inputs: the request content (`keyParts`) and `computeFn` producing the value
   * on a miss. Output: `{ value, cached }` — `cached: true` means the stored value
   * was returned and `computeFn` was NOT invoked; `cached: false` means a miss,
   * `computeFn` ran exactly once, and its result was stored under the derived key.
   * Failure modes: a throwing `computeFn` propagates and stores nothing (so a
   * failed computation is never cached); key-derivation failures propagate too.
   */
  async getOrCompute(keyParts: CacheKeyParts, computeFn: () => V | Promise<V>): Promise<CacheOutcome<V>> {
    const key = deriveCacheKey(keyParts);

    const hit = this.#store.get(key);
    if (hit !== undefined) {
      return { value: hit, cached: true };
    }

    // Miss: compute exactly once. If computeFn throws, nothing is stored.
    const value = await computeFn();
    this.#store.put(key, value, this.#defaultTtlMs);
    return { value, cached: false };
  }
}
