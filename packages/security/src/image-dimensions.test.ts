/**
 * Tests for pure-TS magic-byte sniffing and dimension parsing. Round-trips synthetic headers for
 * each format, rejects truncated/garbled input fail-closed, and asserts sniff distinguishes the
 * three formats from look-alike bytes.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseDimensions, sniffFormat } from './image-dimensions.js';
import { makeJpeg, makePng, makeWebpVp8 } from './image-fixtures.test-helper.js';

describe('sniffFormat', () => {
  it('identifies each real format from its magic bytes', () => {
    expect(sniffFormat(makePng(1, 1))).toBe('image/png');
    expect(sniffFormat(makeJpeg(1, 1))).toBe('image/jpeg');
    expect(sniffFormat(makeWebpVp8(1, 1))).toBe('image/webp');
  });

  it('returns null for unrecognised or too-short buffers', () => {
    expect(sniffFormat(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
    expect(sniffFormat(new Uint8Array([0x89, 0x50]))).toBeNull(); // truncated PNG sig
    expect(sniffFormat(new Uint8Array(0))).toBeNull();
  });

  it('does not confuse a RIFF container that is not WEBP', () => {
    const riffWave = new Uint8Array(12);
    riffWave.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    riffWave.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE" not "WEBP"
    expect(sniffFormat(riffWave)).toBeNull();
  });
});

describe('parseDimensions round-trip', () => {
  it('recovers exact PNG dimensions', () => {
    expect(parseDimensions('image/png', makePng(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it('recovers exact JPEG dimensions', () => {
    expect(parseDimensions('image/jpeg', makeJpeg(800, 600))).toEqual({ width: 800, height: 600 });
  });

  it('recovers exact WebP (VP8) dimensions', () => {
    expect(parseDimensions('image/webp', makeWebpVp8(1024, 768))).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it('property: PNG width/height survive a round-trip for arbitrary in-range sizes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 65535 }),
        fc.integer({ min: 1, max: 65535 }),
        (w, h) => {
          const dims = parseDimensions('image/png', makePng(w, h));
          return dims?.width === w && dims.height === h;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('parseDimensions fail-closed', () => {
  it('rejects a truncated PNG IHDR', () => {
    const png = makePng(10, 10).slice(0, 18); // cut inside the dimension fields
    expect(parseDimensions('image/png', png)).toBeNull();
  });

  it('rejects a PNG whose first chunk is not IHDR', () => {
    const png = makePng(10, 10);
    png[12] = 0x00; // corrupt "IHDR"
    expect(parseDimensions('image/png', png)).toBeNull();
  });

  it('rejects a zero-dimension PNG', () => {
    expect(parseDimensions('image/png', makePng(0, 10))).toBeNull();
    expect(parseDimensions('image/png', makePng(10, 0))).toBeNull();
  });

  it('rejects a JPEG with no SOF marker', () => {
    const noSof = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // SOI then EOI, no frame
    expect(parseDimensions('image/jpeg', noSof)).toBeNull();
  });

  it('rejects a JPEG with a corrupt segment length', () => {
    const jpg = makeJpeg(10, 10);
    jpg[4] = 0x00;
    jpg[5] = 0x00; // length < 2 -> fail closed
    expect(parseDimensions('image/jpeg', jpg)).toBeNull();
  });

  it('skips standalone JPEG markers then finds the SOF', () => {
    // SOI, RST0 (standalone, no length), SOF0 ...
    const buf = new Uint8Array(22);
    buf.set([0xff, 0xd8], 0);
    buf.set([0xff, 0xd0], 2); // RST0 standalone
    buf.set([0xff, 0xc0], 4); // SOF0
    const dv = new DataView(buf.buffer);
    dv.setUint16(6, 0x0011, false);
    buf[8] = 8;
    dv.setUint16(9, 100, false); // height
    dv.setUint16(11, 200, false); // width
    expect(parseDimensions('image/jpeg', buf)).toEqual({ width: 200, height: 100 });
  });

  it('skips a non-SOF segment (APP0) before reaching the SOF frame', () => {
    // SOI | APP0 (len 4, skipped) | SOF0 with dims — exercises the segment-advance path.
    const buf = new Uint8Array(24);
    buf.set([0xff, 0xd8], 0); // SOI
    buf.set([0xff, 0xe0], 2); // APP0
    const dv = new DataView(buf.buffer);
    dv.setUint16(4, 0x0004, false); // APP0 length = 4 (2 length bytes + 2 payload)
    buf.set([0xff, 0xc0], 8); // SOF0 begins after the APP0 segment
    dv.setUint16(10, 0x0011, false);
    buf[12] = 8;
    dv.setUint16(13, 320, false); // height
    dv.setUint16(15, 240, false); // width
    expect(parseDimensions('image/jpeg', buf)).toEqual({ width: 240, height: 320 });
  });

  it('rejects a truncated WebP VP8 header', () => {
    const webp = makeWebpVp8(10, 10).slice(0, 20);
    expect(parseDimensions('image/webp', webp)).toBeNull();
  });

  it('rejects a WebP with an unknown sub-chunk', () => {
    const webp = makeWebpVp8(10, 10);
    webp.set([0x58, 0x58, 0x58, 0x58], 12); // not VP8/VP8L/VP8X
    expect(parseDimensions('image/webp', webp)).toBeNull();
  });
});

describe('WebP VP8L and VP8X sub-formats', () => {
  it('parses a VP8L lossless header', () => {
    // signature 0x2f at 20, then 14-bit (width-1) + 14-bit (height-1) packed LE from byte 21.
    const buf = new Uint8Array(25);
    buf.set([0x52, 0x49, 0x46, 0x46], 0);
    buf.set([0x57, 0x45, 0x42, 0x50], 8);
    buf.set([0x56, 0x50, 0x38, 0x4c], 12); // "VP8L"
    buf[20] = 0x2f;
    const width = 300, height = 200;
    const packed = (width - 1) | ((height - 1) << 14);
    buf[21] = packed & 0xff;
    buf[22] = (packed >> 8) & 0xff;
    buf[23] = (packed >> 16) & 0xff;
    buf[24] = (packed >> 24) & 0xff;
    expect(parseDimensions('image/webp', buf)).toEqual({ width, height });
  });

  it('parses a VP8X extended header', () => {
    const buf = new Uint8Array(30);
    buf.set([0x52, 0x49, 0x46, 0x46], 0);
    buf.set([0x57, 0x45, 0x42, 0x50], 8);
    buf.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
    const width = 500, height = 400;
    const wm1 = width - 1, hm1 = height - 1;
    buf[24] = wm1 & 0xff;
    buf[25] = (wm1 >> 8) & 0xff;
    buf[26] = (wm1 >> 16) & 0xff;
    buf[27] = hm1 & 0xff;
    buf[28] = (hm1 >> 8) & 0xff;
    buf[29] = (hm1 >> 16) & 0xff;
    expect(parseDimensions('image/webp', buf)).toEqual({ width, height });
  });

  it('rejects a VP8L with a missing signature byte', () => {
    const buf = new Uint8Array(25);
    buf.set([0x52, 0x49, 0x46, 0x46], 0);
    buf.set([0x57, 0x45, 0x42, 0x50], 8);
    buf.set([0x56, 0x50, 0x38, 0x4c], 12);
    buf[20] = 0x00; // wrong signature
    expect(parseDimensions('image/webp', buf)).toBeNull();
  });
});
