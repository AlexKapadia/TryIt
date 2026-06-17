/**
 * Mutation-hardening tests for two subtle guards in images.ts:
 *
 *  1. decodedByteLength's `base64.endsWith('==')` padding check. The MethodExpression mutant
 *     rewrites it to `base64.startsWith('==')`. For a payload that ends in '==' (real base64
 *     padding) the mutant takes the `endsWith('=')` branch and counts only 1 padding byte
 *     instead of 2, INFLATING the estimated decoded length by one byte. We craft a payload
 *     whose true decoded length is EXACTLY the 8 MiB cap (accepted) but whose mutated estimate
 *     is cap+1 (rejected) — so the accept assertion fails iff the mutant is live.
 *
 *  2. The discriminatedUnion key `'kind'`. The StringLiteral mutant blanks it to "". With an
 *     empty discriminator key Zod can no longer route by `kind`, so BOTH the url and base64
 *     variants stop matching. Asserting that each concrete variant still parses kills it.
 */
import { describe, expect, it } from 'vitest';
import { MAX_BASE64_DECODED_BYTES, parseImageRef, safeParseImageRef } from './images.js';

describe('decodedByteLength padding uses endsWith, not startsWith (mutation-hardening)', () => {
  it('accepts a "=="-padded payload whose TRUE decoded size is exactly the cap', () => {
    // Length 11184814, body of 'A' + trailing '==' : floor(len*3/4) - 2 == 8388608 == cap.
    // The startsWith mutant would count padding as 1 -> estimate cap+1 -> wrongly REJECT.
    const data = 'A'.repeat(11184814 - 2) + '==';
    expect(data.endsWith('==')).toBe(true);
    const result = safeParseImageRef({ kind: 'base64', mimeType: 'image/jpeg', data });
    // Boundary-exact: real code accepts (size == cap); mutant rejects (size == cap+1).
    expect(result.success).toBe(true);
  });

  it('the cap constant is unchanged so the boundary above is meaningful', () => {
    expect(MAX_BASE64_DECODED_BYTES).toBe(8388608);
  });
});

describe('ImageRef discriminator key is "kind" (kills "" mutant)', () => {
  it('routes a url variant by its kind discriminator', () => {
    // If the discriminator key were "" the union could not match this on `kind` -> would fail.
    const ref = parseImageRef({ kind: 'url', url: 'https://cdn.example.com/me.jpg' });
    expect(ref.kind).toBe('url');
  });

  it('routes a base64 variant by its kind discriminator', () => {
    const ref = parseImageRef({ kind: 'base64', mimeType: 'image/png', data: 'aGVsbG8=' });
    expect(ref.kind).toBe('base64');
  });

  it('rejects an object whose kind does not match any variant', () => {
    expect(safeParseImageRef({ kind: 'ipfs', url: 'https://x.example.com/a.png' }).success).toBe(
      false,
    );
  });
});
