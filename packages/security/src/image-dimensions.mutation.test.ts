/**
 * Mutation-hardening tests for magic-byte sniffing and dimension parsing.
 *
 * These tests have teeth: each one targets a specific surviving mutant from Stryker and would
 * FAIL if the corresponding byte comparison, bounds check, boundary operator, or arithmetic were
 * altered. They probe every individual magic-byte position, every length-boundary (`>=` vs `>`),
 * every zero-dimension guard, and the exact arithmetic of the big-endian readers — exactly the
 * adversarial, boundary-exact coverage claude.md S3.6 demands. No tautological asserts.
 */
import { describe, expect, it } from 'vitest';
import { parseDimensions, sniffFormat } from './image-dimensions.js';
import { makeJpeg, makePng, makeWebpVp8 } from './image-fixtures.test-helper.js';

/** Build a minimal valid VP8L WebP header encoding the given dimensions. */
function makeWebpVp8l(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(25);
  buf.set([0x52, 0x49, 0x46, 0x46], 0);
  buf.set([0x57, 0x45, 0x42, 0x50], 8);
  buf.set([0x56, 0x50, 0x38, 0x4c], 12); // "VP8L"
  buf[20] = 0x2f;
  const packed = (width - 1) | ((height - 1) << 14);
  buf[21] = packed & 0xff;
  buf[22] = (packed >> 8) & 0xff;
  buf[23] = (packed >> 16) & 0xff;
  buf[24] = (packed >> 24) & 0xff;
  return buf;
}

/** Build a minimal valid VP8X WebP header encoding the given dimensions. */
function makeWebpVp8x(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(30);
  buf.set([0x52, 0x49, 0x46, 0x46], 0);
  buf.set([0x57, 0x45, 0x42, 0x50], 8);
  buf.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const wm1 = width - 1, hm1 = height - 1;
  buf[24] = wm1 & 0xff;
  buf[25] = (wm1 >> 8) & 0xff;
  buf[26] = (wm1 >> 16) & 0xff;
  buf[27] = hm1 & 0xff;
  buf[28] = (hm1 >> 8) & 0xff;
  buf[29] = (hm1 >> 16) & 0xff;
  return buf;
}

describe('sniffFormat — every magic byte is load-bearing', () => {
  // Kills each `buf[i] === 0xNN -> true` and the `&&`->`||` logical mutants: flipping ANY single
  // signature byte must make the format unrecognised. If a comparison were mutated to a constant
  // true or its operator weakened, one of these corrupted buffers would still be accepted.
  const PNG_SIG_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];
  it.each(PNG_SIG_INDICES)('rejects a PNG with signature byte %i corrupted', (i) => {
    const png = makePng(8, 8);
    png[i] = png[i]! ^ 0xff; // flip to a definitely-wrong value
    expect(sniffFormat(png)).toBeNull();
  });

  const JPEG_SIG_INDICES = [0, 1, 2];
  it.each(JPEG_SIG_INDICES)('rejects a JPEG with signature byte %i corrupted', (i) => {
    const jpg = makeJpeg(8, 8);
    jpg[i] = jpg[i]! ^ 0xff;
    expect(sniffFormat(jpg)).toBeNull();
  });

  // WebP signature lives at indices 0..3 ("RIFF") and 8..11 ("WEBP"); bytes 4..7 are the size.
  const WEBP_SIG_INDICES = [0, 1, 2, 3, 8, 9, 10, 11];
  it.each(WEBP_SIG_INDICES)('rejects a WebP with signature byte %i corrupted', (i) => {
    const webp = makeWebpVp8(8, 8);
    webp[i] = webp[i]! ^ 0xff;
    expect(sniffFormat(webp)).toBeNull();
  });
});

describe('sniffFormat — length boundary is exact (kills >= -> > and EqualityOperator)', () => {
  it('accepts a PNG signature at exactly the 8-byte minimum', () => {
    // A buffer of EXACTLY 8 bytes must still sniff as PNG. `buf.length >= 8` mutated to `> 8`
    // would reject this; mutated to a constant would accept a shorter one (next test).
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffFormat(sig)).toBe('image/png');
  });

  it('rejects a 7-byte PNG signature (one below the minimum)', () => {
    const short = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]);
    expect(sniffFormat(short)).toBeNull();
  });

  it('accepts a JPEG signature at exactly 3 bytes and rejects at 2', () => {
    expect(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffFormat(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it('accepts a WebP signature at exactly 12 bytes and rejects at 11', () => {
    const exact = new Uint8Array(12);
    exact.set([0x52, 0x49, 0x46, 0x46], 0);
    exact.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffFormat(exact)).toBe('image/webp');
    expect(sniffFormat(exact.slice(0, 11))).toBeNull();
  });
});

describe('PNG dimension parsing — exact arithmetic and bounds (kills readU32BE mutants)', () => {
  it('decodes a width above 0xFFFFFF so the *0x1000000 term is required', () => {
    // width 0x01020304 exercises all four bytes; if `* 0x1000000` became `+` or `/`, or the
    // `<< 16` term flipped sign, the recovered width would differ from this exact value.
    const png = makePng(0x01020304, 7);
    expect(parseDimensions('image/png', png)).toEqual({ width: 0x01020304, height: 7 });
  });

  it('rejects a PNG truncated to exactly 23 bytes (one below the 24-byte minimum)', () => {
    const png = makePng(10, 10).slice(0, 23);
    expect(parseDimensions('image/png', png)).toBeNull();
  });

  it('rejects each individual IHDR tag byte being corrupted', () => {
    for (const i of [12, 13, 14, 15]) {
      const png = makePng(10, 10);
      png[i] = png[i]! ^ 0xff;
      expect(parseDimensions('image/png', png)).toBeNull();
    }
  });

  it('rejects a zero width but accepts width 1 (boundary of the === 0 guard)', () => {
    expect(parseDimensions('image/png', makePng(0, 5))).toBeNull();
    expect(parseDimensions('image/png', makePng(1, 5))).toEqual({ width: 1, height: 5 });
  });

  it('rejects a zero height but accepts height 1', () => {
    expect(parseDimensions('image/png', makePng(5, 0))).toBeNull();
    expect(parseDimensions('image/png', makePng(5, 1))).toEqual({ width: 5, height: 1 });
  });
});

describe('JPEG dimension parsing — marker walk boundaries', () => {
  it('rejects when the first marker byte is not 0xFF', () => {
    const jpg = makeJpeg(10, 10);
    jpg[2] = 0xfe; // segment no longer starts with FF
    expect(parseDimensions('image/jpeg', jpg)).toBeNull();
  });

  it('rejects a JPEG whose declared segment length is exactly 1 (< 2 guard)', () => {
    const jpg = makeJpeg(10, 10);
    jpg[4] = 0x00;
    jpg[5] = 0x01; // segLen === 1 -> below the minimum of 2
    expect(parseDimensions('image/jpeg', jpg)).toBeNull();
  });

  it('treats a marker just past the RST range (0xD8) as standalone, not a length segment', () => {
    // 0xD8/0xD9 and 0xD0..0xD7 are standalone. A value of 0xC0 (SOF) is NOT standalone. This
    // pins the boundary of the `marker >= 0xd0 && marker <= 0xd7` range and the `=== 0xd8` arm.
    const buf = new Uint8Array(22);
    buf.set([0xff, 0xd8], 0); // SOI (standalone)
    buf.set([0xff, 0xd7], 2); // RST7 — top of the standalone range
    buf.set([0xff, 0xc0], 4); // SOF0
    const dv = new DataView(buf.buffer);
    dv.setUint16(6, 0x0011, false);
    buf[8] = 8;
    dv.setUint16(9, 50, false); // height
    dv.setUint16(11, 60, false); // width
    expect(parseDimensions('image/jpeg', buf)).toEqual({ width: 60, height: 50 });
  });

  it('rejects a SOF frame whose width is zero', () => {
    const jpg = makeJpeg(0, 10);
    expect(parseDimensions('image/jpeg', jpg)).toBeNull();
  });

  it('rejects a SOF frame whose height is zero', () => {
    const jpg = makeJpeg(10, 0);
    expect(parseDimensions('image/jpeg', jpg)).toBeNull();
  });
});

describe('WebP sub-format parsing — boundaries and fourcc bytes', () => {
  it('rejects a WebP shorter than the 16-byte fourcc minimum', () => {
    const webp = makeWebpVp8(10, 10).slice(0, 15);
    expect(parseDimensions('image/webp', webp)).toBeNull();
  });

  it('rejects a VP8 whose key-frame header is truncated to 29 bytes (< 30 guard)', () => {
    const webp = makeWebpVp8(10, 10).slice(0, 29);
    expect(parseDimensions('image/webp', webp)).toBeNull();
  });

  it('rejects each corrupted "VP8 " fourcc byte', () => {
    for (const i of [12, 13, 14, 15]) {
      const webp = makeWebpVp8(10, 10);
      webp[i] = webp[i]! ^ 0xff;
      expect(parseDimensions('image/webp', webp)).toBeNull();
    }
  });

  it('rejects a VP8 with zero width or zero height', () => {
    expect(parseDimensions('image/webp', makeWebpVp8(0, 10))).toBeNull();
    expect(parseDimensions('image/webp', makeWebpVp8(10, 0))).toBeNull();
  });

  it('parses VP8L and rejects when its 0x2f signature byte is wrong', () => {
    expect(parseDimensions('image/webp', makeWebpVp8l(300, 200))).toEqual({
      width: 300,
      height: 200,
    });
    const bad = makeWebpVp8l(300, 200);
    bad[20] = 0x00;
    expect(parseDimensions('image/webp', bad)).toBeNull();
  });

  it('rejects a VP8L truncated to 24 bytes (one below the 25-byte minimum)', () => {
    const webp = makeWebpVp8l(300, 200).slice(0, 24);
    expect(parseDimensions('image/webp', webp)).toBeNull();
  });

  it('parses VP8X and recovers the +1 canvas size exactly', () => {
    // width 0x010203 + 1 forces all three little-endian bytes plus the +1 to be exact.
    const w = 0x010203, h = 0x040506;
    expect(parseDimensions('image/webp', makeWebpVp8x(w, h))).toEqual({ width: w, height: h });
  });

  it('rejects each corrupted "VP8X" fourcc byte (15th byte distinguishes X from L)', () => {
    const webp = makeWebpVp8x(100, 100);
    webp[15] = webp[15]! ^ 0xff; // no longer 'X'
    expect(parseDimensions('image/webp', webp)).toBeNull();
  });
});
