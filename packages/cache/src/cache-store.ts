/**
 * @tryit/cache — key/value cache store abstraction + an in-memory LRU+TTL store.
 *
 * What this does: defines the {@link CacheStore} interface that the result cache
 * depends on, and provides {@link InMemoryCacheStore} — a bounded, least-recently-
 * used store with per-entry time-to-live expiry.
 *
 * Why it exists: the result cache should not care whether storage is in-memory,
 * Redis, etc. — it programs against the interface. The in-memory implementation
 * is the default for single-process use and for deterministic tests.
 *
 * Determinism / testability invariant: time is supplied by an INJECTABLE clock
 * (a `() => number` returning epoch-ms), never read from the real wall clock
 * inside this module. Tests drive expiry exactly by advancing a fake clock, so
 * behaviour is fully reproducible and never flaky.
 */

/** Monotonic-ish source of current epoch milliseconds. Injected for testability. */
export type Clock = () => number;

/** Generic key/value cache with optional per-entry TTL. */
export interface CacheStore<V> {
  /** Return the live value for `key`, or `undefined` if absent or expired. */
  get(key: string): V | undefined;
  /** Store `value` under `key`, optionally expiring after `ttlMs` from now. */
  put(key: string, value: V, ttlMs?: number): void;
  /** True iff a live (non-expired) entry exists for `key`. */
  has(key: string): boolean;
  /** Remove `key`. Returns true iff a live entry was present and removed. */
  delete(key: string): boolean;
}

/** Options for {@link InMemoryCacheStore}. */
export interface InMemoryCacheStoreOptions {
  /** Maximum number of live entries; exceeding it evicts the LRU entry. Must be >= 1. */
  readonly maxEntries: number;
  /** Injected clock returning epoch-ms. Defaults to `Date.now` for production use. */
  readonly clock?: Clock;
}

interface Entry<V> {
  readonly value: V;
  /** Absolute epoch-ms after which the entry is dead, or null for no expiry. */
  readonly expiresAt: number | null;
}

/**
 * In-memory cache with LRU eviction and TTL expiry.
 *
 * Recency is tracked by Map insertion order: a `Map` iterates in insertion order,
 * so re-inserting a key on access moves it to the most-recently-used position and
 * the first key in iteration order is always the least-recently-used eviction
 * candidate. TTL is checked lazily on access against the injected clock; expired
 * entries are removed on read so they neither serve stale data nor occupy capacity.
 */
export class InMemoryCacheStore<V> implements CacheStore<V> {
  readonly #entries = new Map<string, Entry<V>>();
  readonly #maxEntries: number;
  readonly #clock: Clock;

  constructor(options: InMemoryCacheStoreOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
      // fail-closed: a non-positive capacity is a programming error, not a no-op.
      throw new RangeError(`InMemoryCacheStore: maxEntries must be an integer >= 1, got ${options.maxEntries}`);
    }
    this.#maxEntries = options.maxEntries;
    this.#clock = options.clock ?? Date.now;
  }

  get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (this.#isExpired(entry)) {
      this.#entries.delete(key);
      return undefined;
    }
    // Mark most-recently-used: delete + re-insert moves it to the tail.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  put(key: string, value: V, ttlMs?: number): void {
    const expiresAt = this.#computeExpiry(ttlMs);
    // Re-inserting overwrites and refreshes recency in one step.
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt });
    this.#evictIfNeeded();
  }

  has(key: string): boolean {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return false;
    }
    if (this.#isExpired(entry)) {
      this.#entries.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return false;
    }
    // An expired-but-present entry is already logically gone — report false.
    const live = !this.#isExpired(entry);
    this.#entries.delete(key);
    return live;
  }

  #computeExpiry(ttlMs?: number): number | null {
    if (ttlMs === undefined) {
      return null;
    }
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      // fail-closed: a negative/NaN TTL is a programming error.
      throw new RangeError(`InMemoryCacheStore: ttlMs must be a finite number >= 0, got ${ttlMs}`);
    }
    return this.#clock() + ttlMs;
  }

  #isExpired(entry: Entry<V>): boolean {
    if (entry.expiresAt === null) {
      return false;
    }
    // Boundary: the entry is live up to and including expiresAt, dead strictly after.
    return this.#clock() > entry.expiresAt;
  }

  #evictIfNeeded(): void {
    // size > maxEntries (>= 1) guarantees at least one entry, so the iterator
    // always yields a key here — no done-guard needed.
    while (this.#entries.size > this.#maxEntries) {
      // First key in iteration order is the least-recently-used.
      const oldest = this.#entries.keys().next().value as string;
      this.#entries.delete(oldest);
    }
  }
}
