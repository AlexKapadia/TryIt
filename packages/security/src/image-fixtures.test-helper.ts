/**
 * @tryit/security/image-fixtures — synthetic, byte-exact image headers for tests.
 *
 * Builds minimal valid PNG / JPEG / WebP headers with caller-chosen dimensions so the dimension
 * parser and validator can be exercised at exact boundaries without any real image files or
 * network. Not part of the runtime package surface — `.test-helper` keeps it out of the barrel.
 */

/** Build a PNG buffer whose IHDR encodes the given width/height (big-endian uint32). */
export function makePng(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  buf.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const dv = new DataView(buf.buffer);
  dv.setUint32(16, width, false);
  dv.setUint32(20, height, false);
  return buf;
}

/** Build a JPEG buffer with one SOF0 segment encoding height @5, width @7 (big-endian uint16). */
export function makeJpeg(width: number, height: number): Uint8Array {
  // FF D8 (SOI) | FF C0 (SOF0) | len=0x0011 | precision | height | width | comps...
  const buf = new Uint8Array(20);
  buf.set([0xff, 0xd8], 0); // SOI
  buf.set([0xff, 0xc0], 2); // SOF0
  const dv = new DataView(buf.buffer);
  dv.setUint16(4, 0x0011, false); // segment length
  buf[6] = 8; // sample precision
  dv.setUint16(7, height, false);
  dv.setUint16(9, width, false);
  return buf;
}

/** Build a lossy "VP8 " WebP whose key-frame header encodes width @26, height @28 (14-bit LE). */
export function makeWebpVp8(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(30);
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  buf.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  buf.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  buf[26] = width & 0xff;
  buf[27] = (width >> 8) & 0x3f;
  buf[28] = height & 0xff;
  buf[29] = (height >> 8) & 0x3f;
  return buf;
}
