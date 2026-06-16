/**
 * Second-round mutation hardening for image-dimensions: kills the survivors that round-tripping
 * could not — whole-branch `condition -> true` mutants in sniffFormat (caught with cross-format
 * buffers that must NOT be accepted), the bounds-check arithmetic in the big-endian/little-endian
 * readers (caught with byte-exact truncations that drive an out-of-range read), the JPEG
 * standalone-marker range boundaries, and the WebP fourcc bytes that distinguish the sub-formats.
 * Every assertion fails under the targeted mutation. No tautologies.
 */
import { describe, expect, it } from 'vitest';
import { parseDimensions, sniffFormat } from './image-dimensions.js';
import { makeJpeg } from './image-fixtures.test-helper.js';

/** A JPEG with one leading standalone marker before the SOF0 frame. */
function jpegWithLeadingMarker(lead: number): Uint8Array {
  const buf = new Uint8Array(22);
  buf.set([0xff, 0xd8], 0); // SOI
  buf.set([0xff, lead], 2); // leading standalone marker under test
  buf.set([0xff, 0xc0], 4); // SOF0
  const dv = new DataView(buf.buffer);
  dv.setUint16(6, 0x0011, false);
  buf[8] = 8;
  dv.setUint16(9, 55, false); // height
  dv.setUint16(11, 77, false); // width
  return buf;
}

/** A full, valid VP8X extended WebP header with the given canvas size. */
function makeWebpVp8x(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(30);
  buf.set([0x52, 0x49, 0x46, 0x46], 0);
  buf.set([0x57, 0x45, 0x42, 0x50], 8);
  buf.set([0x56, 0x50, 0x38, 0x58], 12);
  const wm1 = width - 1, hm1 = height - 1;
  buf[24] = wm1 & 0xff;
  buf[25] = (wm1 >> 8) & 0xff;
  buf[26] = (wm1 >> 16) & 0xff;
  buf[27] = hm1 & 0xff;
  buf[28] = (hm1 >> 8) & 0xff;
  buf[29] = (hm1 >> 16) & 0xff;
  return buf;
}

describe('sniffFormat rejects buffers that match no format (kills whole-condition -> true)', () => {
  it('a 12-byte all-zero buffer is not any image format', () => {
    // If the PNG/JPEG/WebP branch condition were forced `true`, this non-image buffer would be
    // misidentified. It must sniff as null for all three branches to stay honest.
    expect(sniffFormat(new Uint8Array(12))).toBeNull();
  });

  it('a JPEG-magic buffer is not mistaken for PNG or WebP, and vice-versa', () => {
    const jpegMagic = new Uint8Array(12);
    jpegMagic.set([0xff, 0xd8, 0xff], 0);
    expect(sniffFormat(jpegMagic)).toBe('image/jpeg'); // not png/webp-true

    const pngMagic = new Uint8Array(12);
    pngMagic.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    expect(sniffFormat(pngMagic)).toBe('image/png');
  });
});

describe('JPEG reader bounds and null-arms (kills readU16BE off+N and width/height===null)', () => {
  it('returns null when the width uint16 read runs one byte past the buffer', () => {
    // makeJpeg lays out: SOI@0, SOF0@2, len@4, precision@6, height@7-8, width@9-10. The width is
    // read via readU16BE(buf, off+7) = offset 9; truncating to 10 bytes makes buf[10] OOB so the
    // width read returns null and L113's `width === null` arm fires. Kills the readU16BE bounds
    // mutant and the width-null arm.
    const truncated = makeJpeg(100, 80).slice(0, 10);
    expect(parseDimensions('image/jpeg', truncated)).toBeNull();
  });

  it('returns null when the height uint16 read runs one byte past the buffer', () => {
    // Height is read at offset 7; truncating to 8 bytes makes buf[8] OOB -> height null arm fires.
    const truncated = makeJpeg(100, 80).slice(0, 8);
    expect(parseDimensions('image/jpeg', truncated)).toBeNull();
  });

  it('returns null when the segment-length read itself is out of bounds', () => {
    // SOI + a marker that needs a length, but only the marker bytes are present.
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xc0]); // SOF0 with no length bytes
    expect(parseDimensions('image/jpeg', buf)).toBeNull();
  });

  it('treats 0x01 (TEM) and 0xD0 (RST0, bottom of range) as standalone markers', () => {
    // Pins the `=== 0x01` arm and the lower bound of `marker >= 0xd0`. If either were neutralised
    // the parser would mis-read these as length-bearing segments and not reach the real SOF.
    expect(parseDimensions('image/jpeg', jpegWithLeadingMarker(0x01))).toEqual({
      width: 77,
      height: 55,
    });
    expect(parseDimensions('image/jpeg', jpegWithLeadingMarker(0xd0))).toEqual({
      width: 77,
      height: 55,
    });
  });

  it('rejects a JPEG whose declared segment length is exactly 2 minus one (boundary of < 2)', () => {
    const jpg = makeJpeg(10, 10);
    jpg[4] = 0x00;
    jpg[5] = 0x01; // segLen = 1, strictly below 2 -> rejected
    expect(parseDimensions('image/jpeg', jpg)).toBeNull();
  });
});

describe('WebP VP8X reader bounds and fourcc disambiguation', () => {
  it('parses a full VP8X header', () => {
    expect(parseDimensions('image/webp', makeWebpVp8x(100, 200))).toEqual({
      width: 100,
      height: 200,
    });
  });

  it('returns null when the VP8X height uint24 read runs past the buffer', () => {
    // Height occupies bytes 27,28,29; truncating to 29 makes readU24LE(buf,27) out of bounds.
    expect(parseDimensions('image/webp', makeWebpVp8x(100, 200).slice(0, 29))).toBeNull();
  });

  it('returns null when the VP8X width uint24 read runs past the buffer', () => {
    // Width occupies bytes 24,25,26; truncating to 26 makes readU24LE(buf,24) out of bounds.
    expect(parseDimensions('image/webp', makeWebpVp8x(100, 200).slice(0, 26))).toBeNull();
  });

  it('the 15th fourcc byte alone distinguishes VP8X (0x58) from VP8L (0x4c)', () => {
    // Flip only byte 15 of a VP8X header to the VP8L tag. The parser then takes the VP8L path,
    // which needs the 0x2f signature at byte 20 (absent here) -> null. Proves byte 15 is decisive.
    const x = makeWebpVp8x(100, 200);
    x[15] = 0x4c; // now "VP8L"
    expect(parseDimensions('image/webp', x)).toBeNull();
  });
});
