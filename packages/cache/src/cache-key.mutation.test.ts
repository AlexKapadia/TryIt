/**
 * Mutation-hardening tests for the tenant-isolation guards in cache-key.ts (threat T1).
 *
 * These target two security-critical mutants that the existing suite left alive because it
 * only ever compared FULL keys (prefix + digest), letting a differing prefix mask a digest
 * collision, and never compared digests in isolation:
 *
 *  - hashField's length-prefix (`${bytes.length}:`): without it, the field boundary can shift
 *    ("ab"|"c" vs "a"|"bc") and the DIGESTS collide. We assert on the digest alone.
 *  - prefixSafe's percent-encoding of ':' / '%': without it, a tenant id containing ':'
 *    (e.g. "a:b") yields a literal prefix segment "a", colliding with tenant "a"'s namespace.
 */
import { describe, it, expect } from 'vitest';
import { deriveCacheKey, hashImageBytes, type CacheKeyParts } from './cache-key.js';

const IMG = hashImageBytes(new Uint8Array([9, 9, 9]));

function base(overrides: Partial<CacheKeyParts> = {}): CacheKeyParts {
  return { tenantId: 't', personImageHash: IMG, productId: 'p', params: { a: 1 }, ...overrides };
}

/** Everything after the first ':' — the SHA-256 digest, independent of the literal prefix. */
function digest(key: string): string {
  return key.slice(key.indexOf(':') + 1);
}

/** The literal prefix namespace — everything before the first ':'. */
function prefixSegment(key: string): string {
  return key.slice(0, key.indexOf(':'));
}

describe('deriveCacheKey — hashField length-prefix (mutation-hardening)', () => {
  it('boundary-shifted adjacent fields produce DIFFERENT digests, not just different prefixes', () => {
    // The hashed material is ordered tenantId, then personImageHash (adjacent). Shifting the
    // boundary between them — tenant "ab" + imageHash "cZ" vs tenant "a" + imageHash "bcZ" —
    // yields the SAME concatenated bytes without the length prefix, so the digests collide
    // unless `${bytes.length}:` makes the encoding injective. We compare DIGESTS only, because
    // the literal prefixes ("ab"/"a") differ and would mask the collision in a full-key compare.
    const a = deriveCacheKey(base({ tenantId: 'ab', personImageHash: 'cZ' }));
    const b = deriveCacheKey(base({ tenantId: 'a', personImageHash: 'bcZ' }));
    expect(digest(a)).not.toBe(digest(b));
  });

  it('boundary shift between personImageHash and productId also diverges in the digest', () => {
    // personImageHash then productId are adjacent: imgHash "xy" + product "z" vs "x" + "yz".
    const a = deriveCacheKey(base({ personImageHash: 'xy', productId: 'z' }));
    const b = deriveCacheKey(base({ personImageHash: 'x', productId: 'yz' }));
    expect(digest(a)).not.toBe(digest(b));
  });
});

describe('deriveCacheKey — prefixSafe delimiter encoding (mutation-hardening)', () => {
  it('a tenant id containing ":" cannot forge another tenant\'s prefix namespace', () => {
    // Without percent-encoding, "a:b" -> literal key "a:b:<digest>" whose first segment is "a",
    // colliding with tenant "a"'s namespace. Encoding makes it "a%3Ab", a disjoint namespace.
    const withColon = deriveCacheKey(base({ tenantId: 'a:b' }));
    const plain = deriveCacheKey(base({ tenantId: 'a' }));
    expect(prefixSegment(withColon)).not.toBe(prefixSegment(plain));
    expect(prefixSegment(withColon)).toBe('a%3Ab');
  });

  it('percent-encodes "%" so the escape itself cannot be spoofed', () => {
    // "a%3Ab" (a literal percent sequence) must NOT collapse to the same prefix as "a:b".
    const literalPercent = deriveCacheKey(base({ tenantId: 'a%3Ab' }));
    const colon = deriveCacheKey(base({ tenantId: 'a:b' }));
    expect(prefixSegment(literalPercent)).toBe('a%253Ab');
    expect(prefixSegment(literalPercent)).not.toBe(prefixSegment(colon));
  });
});
