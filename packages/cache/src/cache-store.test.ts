/**
 * Adversarial tests for InMemoryCacheStore — LRU eviction and TTL expiry.
 *
 * Time is driven by an injected fake clock so expiry is exercised at the EXACT
 * boundary (live at == expiresAt, dead just after) with zero real time.
 */

import { describe, it, expect } from 'vitest';
import { InMemoryCacheStore, type Clock } from './cache-store.js';

/** A controllable fake clock for deterministic TTL tests — never reads wall time. */
function fakeClock(start = 1_000): { clock: Clock; advance: (ms: number) => void; set: (t: number) => void } {
  let now = start;
  return {
    clock: () => now,
    advance: (ms) => {
      now += ms;
    },
    set: (t) => {
      now = t;
    },
  };
}

describe('InMemoryCacheStore — construction', () => {
  it('rejects non-positive or non-integer maxEntries (fail-closed)', () => {
    expect(() => new InMemoryCacheStore({ maxEntries: 0 })).toThrow(RangeError);
    expect(() => new InMemoryCacheStore({ maxEntries: -1 })).toThrow(RangeError);
    expect(() => new InMemoryCacheStore({ maxEntries: 1.5 })).toThrow(RangeError);
  });

  it('defaults the clock to Date.now when none is injected', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 2 });
    store.put('a', 1);
    expect(store.get('a')).toBe(1); // no-TTL entry, clock irrelevant
  });
});

describe('InMemoryCacheStore — basic semantics', () => {
  it('get/has/delete on an absent key', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 2 });
    expect(store.get('x')).toBeUndefined();
    expect(store.has('x')).toBe(false);
    expect(store.delete('x')).toBe(false);
  });

  it('stores and retrieves; delete returns true for a live entry then false', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 2 });
    store.put('a', 42);
    expect(store.has('a')).toBe(true);
    expect(store.get('a')).toBe(42);
    expect(store.delete('a')).toBe(true);
    expect(store.delete('a')).toBe(false);
    expect(store.has('a')).toBe(false);
  });

  it('overwrites an existing key in place', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 2 });
    store.put('a', 1);
    store.put('a', 2);
    expect(store.get('a')).toBe(2);
  });
});

describe('InMemoryCacheStore — TTL expiry at the exact boundary', () => {
  it('rejects negative or NaN ttlMs (fail-closed)', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 2, clock: () => 0 });
    expect(() => store.put('a', 1, -1)).toThrow(RangeError);
    expect(() => store.put('a', 1, Number.NaN)).toThrow(RangeError);
  });

  it('is live at exactly expiresAt and dead one tick after', () => {
    const t = fakeClock(1_000);
    const store = new InMemoryCacheStore<string>({ maxEntries: 4, clock: t.clock });
    store.put('k', 'v', 100); // expiresAt = 1100

    t.set(1_100); // == expiresAt -> still live (boundary inclusive)
    expect(store.has('k')).toBe(true);
    expect(store.get('k')).toBe('v');

    t.set(1_101); // strictly after -> dead
    expect(store.has('k')).toBe(false);
    expect(store.get('k')).toBeUndefined();
  });

  it('ttlMs of 0 means live only at the instant of insertion', () => {
    const t = fakeClock(500);
    const store = new InMemoryCacheStore<number>({ maxEntries: 2, clock: t.clock });
    store.put('k', 7, 0); // expiresAt = 500
    expect(store.get('k')).toBe(7); // at == expiresAt
    t.advance(1);
    expect(store.get('k')).toBeUndefined();
  });

  it('delete reports false for an expired-but-present entry, and purges it', () => {
    const t = fakeClock(0);
    const store = new InMemoryCacheStore<number>({ maxEntries: 2, clock: t.clock });
    store.put('k', 1, 10);
    t.set(11);
    expect(store.delete('k')).toBe(false);
    expect(store.has('k')).toBe(false);
  });

  it('expired entries free capacity (lazy purge on access)', () => {
    const t = fakeClock(0);
    const store = new InMemoryCacheStore<number>({ maxEntries: 1, clock: t.clock });
    store.put('a', 1, 10);
    t.set(11);
    expect(store.has('a')).toBe(false); // purges 'a'
    store.put('b', 2);
    expect(store.get('b')).toBe(2);
  });

  it('a no-TTL entry never expires regardless of clock advance', () => {
    const t = fakeClock(0);
    const store = new InMemoryCacheStore<number>({ maxEntries: 2, clock: t.clock });
    store.put('k', 9);
    t.set(Number.MAX_SAFE_INTEGER);
    expect(store.get('k')).toBe(9);
  });
});

describe('InMemoryCacheStore — LRU eviction at capacity', () => {
  it('evicts the least-recently-used entry when capacity is exceeded', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 2, clock: () => 0 });
    store.put('a', 1);
    store.put('b', 2);
    store.put('c', 3); // 'a' is LRU -> evicted
    expect(store.has('a')).toBe(false);
    expect(store.get('b')).toBe(2);
    expect(store.get('c')).toBe(3);
  });

  it('get() refreshes recency so the touched key survives eviction', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 2, clock: () => 0 });
    store.put('a', 1);
    store.put('b', 2);
    expect(store.get('a')).toBe(1); // 'a' now MRU, 'b' is LRU
    store.put('c', 3); // evicts 'b', not 'a'
    expect(store.has('a')).toBe(true);
    expect(store.has('b')).toBe(false);
    expect(store.has('c')).toBe(true);
  });

  it('overwriting a key refreshes its recency', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 2, clock: () => 0 });
    store.put('a', 1);
    store.put('b', 2);
    store.put('a', 11); // 'a' now MRU, 'b' is LRU
    store.put('c', 3); // evicts 'b'
    expect(store.get('a')).toBe(11);
    expect(store.has('b')).toBe(false);
    expect(store.get('c')).toBe(3);
  });

  it('never exceeds maxEntries under sustained inserts; keeps the most recent', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 3, clock: () => 0 });
    for (let i = 0; i < 100; i++) {
      store.put(`k${i}`, i);
    }
    let live = 0;
    for (let i = 0; i < 100; i++) {
      if (store.has(`k${i}`)) {
        live++;
      }
    }
    expect(live).toBe(3);
    expect(store.has('k97')).toBe(true);
    expect(store.has('k98')).toBe(true);
    expect(store.has('k99')).toBe(true);
  });

  it('capacity of 1 keeps only the newest', () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 1, clock: () => 0 });
    store.put('a', 1);
    store.put('b', 2);
    expect(store.has('a')).toBe(false);
    expect(store.get('b')).toBe(2);
  });
});
