/**
 * Tests for the stable request hash: determinism, key-order invariance of canonicalisation,
 * FNV-1a known-answer vectors, fixed digest width, and collision-resistance under field change.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonicalize, fnv1a32, stableRequestHash } from './stable_request_hash.js';
import { makeRequest } from '../test_support/fixtures.js';

describe('canonicalize', () => {
  it('is invariant to object key ordering', () => {
    const a = canonicalize({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalize({ a: 2, c: { x: 2, y: 1 }, b: 1 });
    expect(a).toBe(b);
  });

  it('distinguishes arrays from objects and preserves array order', () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
    expect(canonicalize([1, 2])).not.toBe(canonicalize({ 0: 1, 1: 2 }));
  });

  it('serialises null and primitives unambiguously', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize('x')).toBe('"x"');
    expect(canonicalize(42)).toBe('42');
  });
});

describe('fnv1a32', () => {
  it('matches the known FNV-1a 32-bit vector for the empty string and "a"', () => {
    // Published FNV-1a 32-bit reference values.
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
  });

  it('is an unsigned 32-bit integer for arbitrary input (property)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = fnv1a32(s);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0xffffffff);
      }),
    );
  });
});

describe('stableRequestHash', () => {
  it('is a fixed 16-char lowercase hex digest', () => {
    const digest = stableRequestHash(makeRequest());
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is identical across repeated calls on equal requests (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 16 }), (productId) => {
        const r = makeRequest({ productId });
        expect(stableRequestHash(r)).toBe(stableRequestHash({ ...r }));
      }),
    );
  });

  it('changes when a meaningful field changes', () => {
    const base = stableRequestHash(makeRequest({ productId: 'sku-1' }));
    const changed = stableRequestHash(makeRequest({ productId: 'sku-2' }));
    expect(changed).not.toBe(base);
  });
});
