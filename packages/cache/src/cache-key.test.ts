/**
 * Adversarial + property tests for tenant-namespaced cache key derivation.
 *
 * Load-bearing invariants under test:
 *  - determinism: same input -> identical key across many runs;
 *  - tenant isolation (T1): differing only by tenantId -> different key, never equal,
 *    including adversarial boundary-shifting inputs;
 *  - param-order invariance: param key ordering must not change the key.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { deriveCacheKey, hashImageBytes, type CacheKeyParts } from './cache-key.js';
import type { JsonValue } from './canonical-json.js';

const HEX64 = /^[0-9a-f]{64}$/;

function base(overrides: Partial<CacheKeyParts> = {}): CacheKeyParts {
  return {
    tenantId: 't-1',
    personImageHash: hashImageBytes(new Uint8Array([1, 2, 3])),
    productId: 'p-1',
    params: { category: 'top', size: 'M' },
    ...overrides,
  };
}

describe('hashImageBytes', () => {
  it('returns a 64-char lowercase hex digest', () => {
    expect(hashImageBytes(new Uint8Array([0]))).toMatch(HEX64);
  });

  it('is content-addressed: identical bytes hash identically, different bytes differ', () => {
    expect(hashImageBytes(new Uint8Array([1, 2, 3]))).toBe(hashImageBytes(new Uint8Array([1, 2, 3])));
    expect(hashImageBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashImageBytes(new Uint8Array([1, 2, 4])));
  });

  it('matches the known SHA-256 of an empty input', () => {
    // Boundary-exact: SHA-256("") is a fixed, well-known constant.
    expect(hashImageBytes(new Uint8Array([]))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('deriveCacheKey — shape', () => {
  it('produces <tenantId>:<sha256hex>', () => {
    const key = deriveCacheKey(base());
    expect(key).toMatch(/^t-1:[0-9a-f]{64}$/);
  });
});

describe('deriveCacheKey — determinism', () => {
  it('property: same input yields identical key across many runs', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.dictionary(fc.string(), fc.string(), { maxKeys: 6 }),
        (tenantId, productId, params) => {
          const parts = base({ tenantId, productId, params: params as JsonValue });
          const first = deriveCacheKey(parts);
          for (let i = 0; i < 8; i++) {
            if (deriveCacheKey(parts) !== first) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('deriveCacheKey — tenant isolation (threat T1)', () => {
  it('property: keys differing only by tenantId are never equal', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (tenantA, tenantB) => {
          fc.pre(tenantA !== tenantB);
          const ka = deriveCacheKey(base({ tenantId: tenantA }));
          const kb = deriveCacheKey(base({ tenantId: tenantB }));
          return ka !== kb;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('resists boundary-shifting collisions across tenant/product split', () => {
    // "ab"+"c" must not collide with "a"+"bc" — length-prefixing guarantees this.
    const k1 = deriveCacheKey(base({ tenantId: 'ab', productId: 'c' }));
    const k2 = deriveCacheKey(base({ tenantId: 'a', productId: 'bc' }));
    expect(k1).not.toBe(k2);
  });

  it('keeps adversarial tenantIds containing ":" and "%" in disjoint prefixes', () => {
    // A tenant cannot forge another tenant's prefix via delimiter injection.
    const k1 = deriveCacheKey(base({ tenantId: 'a:b' }));
    const k2 = deriveCacheKey(base({ tenantId: 'a%3Ab' }));
    const k3 = deriveCacheKey(base({ tenantId: 'a' }));
    expect(new Set([k1, k2, k3]).size).toBe(3);
    expect(k1.split(':')[0]).not.toBe(k2.split(':')[0]);
  });

  it('the digest itself (not just the prefix) differs by tenant', () => {
    const digest = (k: string): string => k.slice(k.indexOf(':') + 1);
    expect(digest(deriveCacheKey(base({ tenantId: 'x' })))).not.toBe(
      digest(deriveCacheKey(base({ tenantId: 'y' }))),
    );
  });
});

describe('deriveCacheKey — param normalization', () => {
  it('is invariant to param key ordering', () => {
    const k1 = deriveCacheKey(base({ params: { a: 1, b: 2, nested: { x: 1, y: 2 } } }));
    const k2 = deriveCacheKey(base({ params: { b: 2, nested: { y: 2, x: 1 }, a: 1 } }));
    expect(k1).toBe(k2);
  });

  it('property: reordering param keys never changes the key', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.integer(), { minKeys: 1, maxKeys: 8 }),
        (params) => {
          const reversed: Record<string, number> = {};
          for (const k of Object.keys(params).reverse()) {
            // defineProperty so "__proto__" becomes a real own property.
            Object.defineProperty(reversed, k, {
              value: params[k],
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }
          return (
            deriveCacheKey(base({ params: params as JsonValue })) ===
            deriveCacheKey(base({ params: reversed as JsonValue }))
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('distinguishes different params, image hashes, and products', () => {
    const k0 = deriveCacheKey(base());
    expect(deriveCacheKey(base({ params: { category: 'top', size: 'L' } }))).not.toBe(k0);
    expect(deriveCacheKey(base({ productId: 'p-2' }))).not.toBe(k0);
    expect(deriveCacheKey(base({ personImageHash: 'deadbeef' }))).not.toBe(k0);
  });

  it('propagates fail-closed errors from canonical serialization', () => {
    expect(() => deriveCacheKey(base({ params: { x: Number.NaN } as unknown as JsonValue }))).toThrow(
      TypeError,
    );
  });
});
