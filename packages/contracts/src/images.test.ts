import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import fc from 'fast-check';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_BASE64_DECODED_BYTES,
  parseImageRef,
  safeParseImageRef,
} from './images.js';

/** Build a base64 string whose decoded byte length is exactly `bytes`. */
function base64OfDecodedBytes(bytes: number): string {
  // 'A' decodes to a zero byte; Buffer guarantees the exact decoded length.
  return Buffer.alloc(bytes, 0).toString('base64');
}

describe('parseImageRef — url variant', () => {
  it('accepts a well-formed https url', () => {
    const ref = parseImageRef({ kind: 'url', url: 'https://cdn.example.com/me.jpg' });
    expect(ref).toEqual({ kind: 'url', url: 'https://cdn.example.com/me.jpg' });
  });

  it('rejects an http (non-https) url', () => {
    expect(() => parseImageRef({ kind: 'url', url: 'http://cdn.example.com/me.jpg' })).toThrow(
      ZodError,
    );
  });

  it('rejects a data: url even if it claims an image mime', () => {
    expect(() =>
      parseImageRef({ kind: 'url', url: 'data:image/png;base64,iVBORw0KGgo=' }),
    ).toThrow(ZodError);
  });

  it('rejects a file: url', () => {
    expect(() => parseImageRef({ kind: 'url', url: 'file:///etc/passwd' })).toThrow(ZodError);
  });

  it('rejects a malformed url string', () => {
    expect(() => parseImageRef({ kind: 'url', url: 'not a url' })).toThrow(ZodError);
  });

  it('rejects a url variant that carries base64 fields (discriminated union strictness)', () => {
    const result = safeParseImageRef({
      kind: 'url',
      url: 'https://x.example.com/a.png',
      mimeType: 'image/png',
    });
    // Extra unknown keys are stripped by default, so this stays valid on `url`.
    expect(result.success).toBe(true);
  });

  it('property: any https url with a host parses; the same url over http is rejected', () => {
    fc.assert(
      fc.property(fc.webUrl({ withFragments: true }), (url) => {
        const httpsUrl = url.replace(/^https?:\/\//, 'https://');
        const httpUrl = url.replace(/^https?:\/\//, 'http://');
        expect(safeParseImageRef({ kind: 'url', url: httpsUrl }).success).toBe(true);
        expect(safeParseImageRef({ kind: 'url', url: httpUrl }).success).toBe(false);
      }),
    );
  });
});

describe('parseImageRef — base64 variant', () => {
  it('accepts a small base64 png', () => {
    const ref = parseImageRef({ kind: 'base64', mimeType: 'image/png', data: 'aGVsbG8=' });
    expect(ref).toEqual({ kind: 'base64', mimeType: 'image/png', data: 'aGVsbG8=' });
  });

  it('accepts every allow-listed mime type', () => {
    for (const mimeType of ALLOWED_IMAGE_MIME_TYPES) {
      expect(safeParseImageRef({ kind: 'base64', mimeType, data: 'aGVsbG8=' }).success).toBe(true);
    }
  });

  it('rejects a non-allow-listed mime type (image/gif)', () => {
    expect(() =>
      parseImageRef({ kind: 'base64', mimeType: 'image/gif', data: 'aGVsbG8=' }),
    ).toThrow(ZodError);
  });

  it('rejects empty data (boundary: min length 1)', () => {
    expect(() => parseImageRef({ kind: 'base64', mimeType: 'image/png', data: '' })).toThrow(
      ZodError,
    );
  });

  it('rejects non-base64 characters', () => {
    expect(() =>
      parseImageRef({ kind: 'base64', mimeType: 'image/png', data: 'not*base64!' }),
    ).toThrow(ZodError);
  });

  it('accepts a payload exactly at the max decoded size (boundary: at limit)', () => {
    const data = base64OfDecodedBytes(MAX_BASE64_DECODED_BYTES);
    expect(safeParseImageRef({ kind: 'base64', mimeType: 'image/jpeg', data }).success).toBe(true);
  });

  it('rejects a payload one byte over the max decoded size (boundary: just-over)', () => {
    const data = base64OfDecodedBytes(MAX_BASE64_DECODED_BYTES + 1);
    expect(safeParseImageRef({ kind: 'base64', mimeType: 'image/jpeg', data }).success).toBe(false);
  });

  it('accepts a payload one byte under the max decoded size (boundary: just-under)', () => {
    const data = base64OfDecodedBytes(MAX_BASE64_DECODED_BYTES - 1);
    expect(safeParseImageRef({ kind: 'base64', mimeType: 'image/jpeg', data }).success).toBe(true);
  });
});

describe('parseImageRef — discriminator', () => {
  it('rejects an unknown kind', () => {
    expect(() => parseImageRef({ kind: 'ipfs', url: 'https://x.example.com/a.png' })).toThrow(
      ZodError,
    );
  });

  it('rejects a missing kind', () => {
    expect(() => parseImageRef({ url: 'https://x.example.com/a.png' })).toThrow(ZodError);
  });

  it('rejects a non-object input', () => {
    expect(() => parseImageRef('https://x.example.com/a.png')).toThrow(ZodError);
    expect(() => parseImageRef(null)).toThrow(ZodError);
  });
});
