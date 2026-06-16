/**
 * Tests for the client-side file gate. Boundary-exact on the 8MiB limit and exhaustive over
 * allowed vs disallowed MIME types — the upload must be refused BEFORE any byte leaves the device.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateChosenFile } from './validate-file.js';
import { MAX_BASE64_DECODED_BYTES, ALLOWED_IMAGE_MIME_TYPES } from '@tryit/contracts';

describe('validateChosenFile — allowed types', () => {
  it.each(ALLOWED_IMAGE_MIME_TYPES)('accepts %s within size', (type) => {
    expect(validateChosenFile({ type, size: 1024 })).toEqual({ ok: true });
  });
});

describe('validateChosenFile — disallowed types -> INVALID_INPUT', () => {
  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/html', '', 'image/jpeg ' ])(
    'rejects %j',
    (type) => {
      expect(validateChosenFile({ type, size: 1024 })).toEqual({
        ok: false,
        code: 'INVALID_INPUT',
      });
    },
  );

  it('rejects a disallowed type even when it is also oversize (type checked first)', () => {
    const r = validateChosenFile({ type: 'image/gif', size: MAX_BASE64_DECODED_BYTES + 1 });
    expect(r).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });
});

describe('validateChosenFile — size boundary (exact)', () => {
  it('accepts exactly at the limit', () => {
    expect(validateChosenFile({ type: 'image/png', size: MAX_BASE64_DECODED_BYTES })).toEqual({
      ok: true,
    });
  });

  it('rejects one byte over the limit -> PAYLOAD_TOO_LARGE', () => {
    expect(
      validateChosenFile({ type: 'image/png', size: MAX_BASE64_DECODED_BYTES + 1 }),
    ).toEqual({ ok: false, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('accepts one byte under the limit', () => {
    expect(
      validateChosenFile({ type: 'image/webp', size: MAX_BASE64_DECODED_BYTES - 1 }),
    ).toEqual({ ok: true });
  });
});

describe('validateChosenFile — property: every allowed image ≤ limit passes; > limit fails', () => {
  it('holds across random sizes', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_IMAGE_MIME_TYPES),
        fc.integer({ min: 0, max: MAX_BASE64_DECODED_BYTES * 2 }),
        (type, size) => {
          const r = validateChosenFile({ type, size });
          if (size <= MAX_BASE64_DECODED_BYTES) {
            expect(r.ok).toBe(true);
          } else {
            expect(r).toEqual({ ok: false, code: 'PAYLOAD_TOO_LARGE' });
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
