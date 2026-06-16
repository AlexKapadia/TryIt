/**
 * Mutation-hardening tests for the result-image data-URL guard in tryon.ts.
 *
 * Targets the `^` start-anchor in RESULT_IMAGE_DATA_URL_PATTERN. Without the anchor, a hostile
 * provider could prefix a dangerous scheme (e.g. `javascript:`) and still match because the
 * regex would only require the *tail* to look like a safe data-url. These tests assert the
 * whole string must start with the safe `data:image/...` shape, killing the anchor-removal mutant.
 */
import { describe, expect, it } from 'vitest';
import { isAcceptableResultImageUrl } from './tryon.js';

describe('isAcceptableResultImageUrl — start anchor (mutation-hardening)', () => {
  it('rejects a javascript-scheme prefix in front of a valid data-url tail (anchored ^)', () => {
    // The trailing `data:image/png;base64,AAAA` is well-formed; the leading scheme must
    // make the whole string fail. An un-anchored regex would wrongly accept this.
    expect(
      isAcceptableResultImageUrl('javascript:alert(1)//data:image/png;base64,AAAA'),
    ).toBe(false);
  });

  it('rejects arbitrary leading text before a valid data-url tail', () => {
    expect(isAcceptableResultImageUrl('XXXdata:image/png;base64,AAAA')).toBe(false);
  });

  it('still accepts a clean data:image url (no false positive from the anchor)', () => {
    expect(isAcceptableResultImageUrl('data:image/png;base64,aGVsbG8=')).toBe(true);
  });
});
