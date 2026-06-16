/**
 * Mutation-hardening tests for the base64 alphabet guard in images.ts.
 *
 * Targets the `^` start-anchor in BASE64_PATTERN. Without the anchor, a hostile caller could
 * prepend arbitrary junk (whitespace, control bytes, injection payloads) and still match,
 * because the regex would only require the *suffix* to be valid base64. These boundary-exact
 * tests fail closed on a leading-junk payload, killing the anchor-removal mutant.
 */
import { describe, expect, it } from 'vitest';
import { safeParseImageRef } from './images.js';

describe('images base64 guard — start anchor (mutation-hardening)', () => {
  it('rejects a payload with a junk prefix followed by valid base64 (anchored ^)', () => {
    // 'AAAA' alone is valid base64; the leading junk must make the WHOLE string fail.
    // An un-anchored regex would match the trailing 'AAAA' and wrongly accept this.
    const result = safeParseImageRef({
      kind: 'base64',
      mimeType: 'image/png',
      data: '!!not-base64##AAAA',
    });
    expect(result.success).toBe(false);
  });

  it('rejects leading-whitespace + valid base64 (anchor must pin the start)', () => {
    const result = safeParseImageRef({
      kind: 'base64',
      mimeType: 'image/png',
      data: '   aGVsbG8=',
    });
    expect(result.success).toBe(false);
  });

  it('still accepts a clean base64 payload (no false positive from the anchor)', () => {
    expect(
      safeParseImageRef({ kind: 'base64', mimeType: 'image/png', data: 'aGVsbG8=' }).success,
    ).toBe(true);
  });
});
