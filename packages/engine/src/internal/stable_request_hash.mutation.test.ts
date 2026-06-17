/**
 * Mutation-hardening tests for the stable request hash. Survivors the happy-path suite missed:
 *  - L21 the `?? 'null'` fallback — canonicalising a value JSON.stringify drops (undefined).
 *  - L24 the array element join `','` — separators must be present so [1,2] != [12].
 *  - L29 the object entry join `','` — multi-key separators must be present.
 *  - L62 the reverse pass `canonical.split('').reverse().join('')` — proven via a KNOWN-ANSWER
 *    digest whose canonical form is NOT a palindrome, so removing/altering the reverse changes it.
 *  - L65 the `padStart(8, '0')` width + pad char — the known answer has a leading-zero low half,
 *    so dropping the pad char shortens the digest below 16 chars.
 */
import { describe, expect, it } from 'vitest';
import { canonicalize, stableRequestHash } from './stable_request_hash.js';
import { makeRequest } from '../test_support/fixtures.js';

describe('canonicalize (mutation-hardening)', () => {
  it("falls back to 'null' when JSON.stringify yields undefined (kills the fallback-blank mutant)", () => {
    // JSON.stringify(undefined) === undefined, so the `?? 'null'` fallback fires. A '' mutant
    // would return the empty string instead of the literal 'null'.
    expect(canonicalize(undefined)).toBe('null');
  });

  it('separates array elements with commas (kills the array-join string-blank mutant)', () => {
    // Without the ',' separator, [1,2] would serialise to '[12]' — colliding with [12].
    expect(canonicalize([1, 2])).toBe('[1,2]');
    expect(canonicalize([1, 2])).not.toBe(canonicalize([12]));
  });

  it('separates object entries with commas (kills the object-join string-blank mutant)', () => {
    // A blanked ',' would merge entries; {a:1,b:2} must serialise with the separator present.
    expect(canonicalize({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ a: 1, b: 2 })).not.toBe(canonicalize({ a: 1, b: 2, extra: undefined }));
  });
});

describe('stableRequestHash (mutation-hardening)', () => {
  it('matches a fixed known-answer digest (kills reverse-pass + padStart mutants)', () => {
    // Pinned reference value for this exact request. The canonical form is NOT a palindrome, so
    // any mutation to `.split('').reverse().join('')` changes the low half away from '09b8ed63'.
    // The low half has a leading zero, so dropping padStart's '0' pad char shortens the digest.
    const req = makeRequest({ productId: 'p1' });
    expect(stableRequestHash(req)).toBe('3515680b09b8ed63');
    expect(stableRequestHash(req)).toHaveLength(16);
  });

  it('left-pads BOTH halves to 8 hex chars (kills both padStart pad-char mutants)', () => {
    // 'p3' digest has a leading-zero HIGH half ('0c4ef4a5') AND the same request exercises the
    // low-half pad. Dropping either padStart's '0' pad char would shorten the 16-char digest.
    const req = makeRequest({ productId: 'p3' });
    const digest = stableRequestHash(req);
    expect(digest).toBe('0c4ef4a53619a9f5');
    expect(digest).toHaveLength(16);
    expect(digest.slice(0, 8)).toBe('0c4ef4a5'); // high half retains its leading zero.
  });

  it('the high and low halves differ (proves the reverse pass actually runs)', () => {
    // If the reverse pass were stripped, both halves would hash the same canonical string and the
    // digest would be a doubled 8-char value (high === low). They must differ here.
    const digest = stableRequestHash(makeRequest({ productId: 'p1' }));
    expect(digest.slice(0, 8)).not.toBe(digest.slice(8, 16));
  });
});
