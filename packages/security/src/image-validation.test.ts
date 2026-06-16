/**
 * Tests for untrusted-image validation. Adversarial: MIME/extension spoofing, byte-size and
 * dimension boundaries (cap vs cap+1), truncated headers, base64 vs raw, and the sanitizer seam.
 */
import { describe, expect, it } from 'vitest';
import type { ImageRef } from '@tryit/contracts';
import {
  DEFAULT_IMAGE_LIMITS,
  PassthroughImageSanitizer,
  validateImageBytes,
  validateImageRef,
  type ImageSanitizer,
  type ImageValidationLimits,
} from './image-validation.js';
import { makeJpeg, makePng, makeWebpVp8 } from './image-fixtures.test-helper.js';
import { type SniffedFormat } from './image-dimensions.js';

const smallLimits: ImageValidationLimits = { maxBytes: 1000, maxWidth: 100, maxHeight: 100 };

describe('valid samples accepted', () => {
  it('accepts a valid PNG/JPEG/WebP and reports the sniffed format + dimensions', () => {
    const png = validateImageBytes(makePng(50, 40), 'image/png', smallLimits);
    expect(png).toMatchObject({ ok: true, format: 'image/png', width: 50, height: 40 });
    const jpg = validateImageBytes(makeJpeg(60, 30), 'image/jpeg', smallLimits);
    expect(jpg).toMatchObject({ ok: true, format: 'image/jpeg', width: 60, height: 30 });
    const webp = validateImageBytes(makeWebpVp8(80, 80), 'image/webp', smallLimits);
    expect(webp).toMatchObject({ ok: true, format: 'image/webp', width: 80, height: 80 });
  });

  it('accepts when no MIME is declared (sniff-only path)', () => {
    expect(validateImageBytes(makePng(10, 10), undefined, smallLimits).ok).toBe(true);
  });
});

describe('MIME / extension spoofing rejected', () => {
  it('rejects PNG-declared bytes that are actually JPEG', () => {
    // Caller claims image/png (the "extension") but the bytes are a JPEG.
    const res = validateImageBytes(makeJpeg(10, 10), 'image/png', smallLimits);
    expect(res).toEqual({ ok: false, reason: 'mime-mismatch' });
  });

  it('rejects JPEG-declared bytes that are actually PNG', () => {
    expect(validateImageBytes(makePng(10, 10), 'image/jpeg', smallLimits)).toEqual({
      ok: false,
      reason: 'mime-mismatch',
    });
  });
});

describe('byte-size boundary', () => {
  it('accepts a payload exactly at maxBytes', () => {
    // Pad a valid PNG up to exactly maxBytes with trailing bytes (header still parses).
    const png = makePng(10, 10);
    const padded = new Uint8Array(smallLimits.maxBytes);
    padded.set(png, 0);
    const res = validateImageBytes(padded, 'image/png', smallLimits);
    expect(res.ok).toBe(true);
  });

  it('rejects a payload one byte over maxBytes (fail-closed before parse)', () => {
    const over = new Uint8Array(smallLimits.maxBytes + 1);
    over.set(makePng(10, 10), 0);
    expect(validateImageBytes(over, 'image/png', smallLimits)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });
});

describe('dimension boundary (dimension-bomb defence)', () => {
  it('accepts dimensions exactly at the cap', () => {
    const res = validateImageBytes(makePng(100, 100), 'image/png', smallLimits);
    expect(res.ok).toBe(true);
  });

  it('rejects width one over the cap', () => {
    expect(validateImageBytes(makePng(101, 100), 'image/png', smallLimits)).toEqual({
      ok: false,
      reason: 'dimensions-too-large',
    });
  });

  it('rejects height one over the cap', () => {
    expect(validateImageBytes(makePng(100, 101), 'image/png', smallLimits)).toEqual({
      ok: false,
      reason: 'dimensions-too-large',
    });
  });
});

describe('malformed / truncated input', () => {
  it('rejects unrecognised bytes', () => {
    expect(validateImageBytes(new Uint8Array([1, 2, 3, 4]), undefined, smallLimits)).toEqual({
      ok: false,
      reason: 'unrecognised-format',
    });
  });

  it('rejects a truncated PNG header that sniffs but will not parse', () => {
    const png = makePng(10, 10).slice(0, 16); // valid sig, IHDR cut off
    expect(validateImageBytes(png, 'image/png', smallLimits)).toEqual({
      ok: false,
      reason: 'malformed-header',
    });
  });
});

describe('validateImageRef (base64 path)', () => {
  it('accepts a valid base64 PNG whose bytes match the declared mimeType', () => {
    const ref: ImageRef = {
      kind: 'base64',
      mimeType: 'image/png',
      data: Buffer.from(makePng(20, 20)).toString('base64'),
    };
    expect(validateImageRef(ref, smallLimits)).toMatchObject({ ok: true, format: 'image/png' });
  });

  it('rejects a base64 ref whose declared mimeType disagrees with the bytes', () => {
    const ref: ImageRef = {
      kind: 'base64',
      mimeType: 'image/png',
      data: Buffer.from(makeJpeg(20, 20)).toString('base64'),
    };
    expect(validateImageRef(ref, smallLimits)).toEqual({ ok: false, reason: 'mime-mismatch' });
  });

  it('rejects a URL ref at this boundary (no inline bytes to inspect)', () => {
    const ref: ImageRef = { kind: 'url', url: 'https://example.com/a.png' };
    expect(validateImageRef(ref, smallLimits)).toEqual({
      ok: false,
      reason: 'unrecognised-format',
    });
  });

  it('produces the same verdict for base64 and the equivalent raw bytes', () => {
    const raw = makeWebpVp8(64, 64);
    const fromRaw = validateImageBytes(raw, 'image/webp', smallLimits);
    const fromB64 = validateImageRef(
      { kind: 'base64', mimeType: 'image/webp', data: Buffer.from(raw).toString('base64') },
      smallLimits,
    );
    expect(fromB64).toEqual(fromRaw);
  });
});

describe('sanitizer seam', () => {
  it('passes validated bytes through the injected sanitizer', () => {
    const replacement = new Uint8Array([0xaa, 0xbb]);
    const spy: ImageSanitizer = {
      sanitize(_bytes: Uint8Array, _format: SniffedFormat) {
        return replacement; // production decode+re-encode would return clean bytes
      },
    };
    const res = validateImageBytes(makePng(10, 10), 'image/png', smallLimits, spy);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bytes).toEqual(replacement);
  });

  it('default passthrough returns the original validated bytes', () => {
    const bytes = makePng(10, 10);
    const res = validateImageBytes(bytes, 'image/png', smallLimits, new PassthroughImageSanitizer());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bytes).toEqual(bytes);
  });
});

describe('defaults', () => {
  it('DEFAULT_IMAGE_LIMITS are sane and used when omitted', () => {
    expect(DEFAULT_IMAGE_LIMITS.maxBytes).toBe(8 * 1024 * 1024);
    // A 10x10 PNG passes under default limits with no explicit limits arg.
    expect(validateImageBytes(makePng(10, 10), 'image/png').ok).toBe(true);
  });
});
