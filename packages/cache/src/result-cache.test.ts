/**
 * Adversarial tests for ResultCache.getOrCompute — hit/miss, the cached flag,
 * and the exactly-once compute contract, plus tenant isolation end-to-end.
 *
 * The compute function counts its own invocations so we can assert EXACTLY once
 * on a miss and ZERO times on a hit — a tautology-proof check of the contract.
 */

import { describe, it, expect } from 'vitest';
import { ResultCache } from './result-cache.js';
import { InMemoryCacheStore } from './cache-store.js';
import { hashImageBytes, type CacheKeyParts } from './cache-key.js';
import type { JsonValue } from './canonical-json.js';

function parts(overrides: Partial<CacheKeyParts> = {}): CacheKeyParts {
  return {
    tenantId: 't-1',
    personImageHash: hashImageBytes(new Uint8Array([9])),
    productId: 'p-1',
    params: { size: 'M' },
    ...overrides,
  };
}

/** A compute fn that records how many times it ran and returns a fixed value. */
function counter<V>(value: V): { fn: () => V; calls: () => number } {
  let calls = 0;
  return {
    fn: () => {
      calls++;
      return value;
    },
    calls: () => calls,
  };
}

describe('ResultCache.getOrCompute — miss then hit', () => {
  it('computes on miss (cached:false) and serves from cache on hit (cached:true)', async () => {
    const store = new InMemoryCacheStore<string>({ maxEntries: 4, clock: () => 0 });
    const cache = new ResultCache(store);
    const c = counter('result-A');

    const miss = await cache.getOrCompute(parts(), c.fn);
    expect(miss).toEqual({ value: 'result-A', cached: false });
    expect(c.calls()).toBe(1);

    const hit = await cache.getOrCompute(parts(), c.fn);
    expect(hit).toEqual({ value: 'result-A', cached: true });
    expect(c.calls()).toBe(1); // compute NOT called again
  });

  it('calls computeFn exactly once across repeated hits on the same key', async () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 4, clock: () => 0 });
    const cache = new ResultCache(store);
    const c = counter(123);

    await cache.getOrCompute(parts(), c.fn);
    for (let i = 0; i < 5; i++) {
      const out = await cache.getOrCompute(parts(), c.fn);
      expect(out.cached).toBe(true);
      expect(out.value).toBe(123);
    }
    expect(c.calls()).toBe(1);
  });

  it('supports async compute functions', async () => {
    const store = new InMemoryCacheStore<string>({ maxEntries: 4, clock: () => 0 });
    const cache = new ResultCache(store);
    let calls = 0;
    const compute = async (): Promise<string> => {
      calls++;
      return Promise.resolve('async-val');
    };

    expect(await cache.getOrCompute(parts(), compute)).toEqual({ value: 'async-val', cached: false });
    expect(await cache.getOrCompute(parts(), compute)).toEqual({ value: 'async-val', cached: true });
    expect(calls).toBe(1);
  });
});

describe('ResultCache.getOrCompute — distinct keys are independent', () => {
  it('different requests each miss once and never share results', async () => {
    const store = new InMemoryCacheStore<string>({ maxEntries: 8, clock: () => 0 });
    const cache = new ResultCache(store);
    const a = counter('A');
    const b = counter('B');

    const r1 = await cache.getOrCompute(parts({ productId: 'p-1' }), a.fn);
    const r2 = await cache.getOrCompute(parts({ productId: 'p-2' }), b.fn);
    expect(r1).toEqual({ value: 'A', cached: false });
    expect(r2).toEqual({ value: 'B', cached: false });
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(1);
  });

  it('param-order-equivalent requests hit the same cache entry', async () => {
    const store = new InMemoryCacheStore<string>({ maxEntries: 8, clock: () => 0 });
    const cache = new ResultCache(store);
    const c = counter('same');

    await cache.getOrCompute(parts({ params: { a: 1, b: 2 } as JsonValue }), c.fn);
    const out = await cache.getOrCompute(parts({ params: { b: 2, a: 1 } as JsonValue }), c.fn);
    expect(out.cached).toBe(true);
    expect(c.calls()).toBe(1);
  });
});

describe('ResultCache.getOrCompute — tenant isolation (threat T1)', () => {
  it('the same logical request for two tenants never shares a cached value', async () => {
    const store = new InMemoryCacheStore<string>({ maxEntries: 8, clock: () => 0 });
    const cache = new ResultCache(store);
    const a = counter('tenant-a-result');
    const b = counter('tenant-b-result');

    const ra = await cache.getOrCompute(parts({ tenantId: 'tenant-a' }), a.fn);
    const rb = await cache.getOrCompute(parts({ tenantId: 'tenant-b' }), b.fn);

    expect(ra).toEqual({ value: 'tenant-a-result', cached: false });
    expect(rb).toEqual({ value: 'tenant-b-result', cached: false }); // tenant B did NOT read tenant A's cache
    expect(b.calls()).toBe(1);
  });
});

describe('ResultCache.getOrCompute — error and TTL behaviour', () => {
  it('does not cache a result when computeFn throws', async () => {
    const store = new InMemoryCacheStore<number>({ maxEntries: 4, clock: () => 0 });
    const cache = new ResultCache(store);

    await expect(
      cache.getOrCompute(parts(), () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // A subsequent successful compute must run (nothing was stored).
    const c = counter(5);
    const out = await cache.getOrCompute(parts(), c.fn);
    expect(out).toEqual({ value: 5, cached: false });
    expect(c.calls()).toBe(1);
  });

  it('applies the default TTL so entries expire and recompute', async () => {
    let now = 0;
    const store = new InMemoryCacheStore<number>({ maxEntries: 4, clock: () => now });
    const cache = new ResultCache(store, { defaultTtlMs: 100 });
    const c = counter(1);

    expect((await cache.getOrCompute(parts(), c.fn)).cached).toBe(false);
    now = 100; // boundary: still live
    expect((await cache.getOrCompute(parts(), c.fn)).cached).toBe(true);
    now = 101; // expired
    expect((await cache.getOrCompute(parts(), c.fn)).cached).toBe(false);
    expect(c.calls()).toBe(2); // recomputed exactly once after expiry
  });

  it('with no default TTL, entries persist indefinitely', async () => {
    let now = 0;
    const store = new InMemoryCacheStore<number>({ maxEntries: 4, clock: () => now });
    const cache = new ResultCache(store);
    const c = counter(1);

    await cache.getOrCompute(parts(), c.fn);
    now = Number.MAX_SAFE_INTEGER;
    expect((await cache.getOrCompute(parts(), c.fn)).cached).toBe(true);
    expect(c.calls()).toBe(1);
  });
});
