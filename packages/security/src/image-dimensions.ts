/**
 * @tryit/security/image-dimensions — pure-TS magic-byte sniffing and dimension parsing.
 *
 * Reads just enough of an untrusted image's header to (a) identify its true format from magic
 * bytes — never the caller's declared MIME — and (b) recover its pixel dimensions, for PNG
 * (IHDR), JPEG (SOFn frame headers), and WebP (VP8 / VP8L / VP8X). No decoding library is used:
 * we parse bytes directly so a malformed or truncated header is detected and rejected rather
 * than handed to a native decoder. Every reader is bounds-checked and returns `null` (fail-
 * closed) the instant it would read past the buffer (threat: dimension-bomb / truncation abuse).
 */

/** The set of formats this module can identify. */
export type SniffedFormat = 'image/jpeg' | 'image/png' | 'image/webp';

/** Pixel dimensions recovered from a header. */
export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

/** Identify a buffer's true format from its magic bytes, or `null` if unrecognised. */
export function sniffFormat(buf: Uint8Array): SniffedFormat | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: starts FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Read a big-endian uint16 at offset, or `null` if out of bounds. */
function readU16BE(buf: Uint8Array, off: number): number | null {
  if (off + 1 >= buf.length) return null;
  return (buf[off]! << 8) | buf[off + 1]!;
}

/** Read a big-endian uint32 at offset, or `null` if out of bounds. */
function readU32BE(buf: Uint8Array, off: number): number | null {
  if (off + 3 >= buf.length) return null;
  return (
    (buf[off]! * 0x1000000 + (buf[off + 1]! << 16)) |
    (buf[off + 2]! << 8) |
    buf[off + 3]!
  ) >>> 0;
}

/** PNG dimensions live in the IHDR chunk: width @16, height @20 (big-endian uint32). */
function parsePngDimensions(buf: Uint8Array): ImageDimensions | null {
  // The first chunk after the 8-byte signature must be IHDR ("IHDR" @12).
  if (buf.length < 24) return null;
  if (
    buf[12] !== 0x49 ||
    buf[13] !== 0x48 ||
    buf[14] !== 0x44 ||
    buf[15] !== 0x52
  ) {
    return null; // fail-closed: not a well-formed PNG header
  }
  const width = readU32BE(buf, 16);
  const height = readU32BE(buf, 20);
  if (width === null || height === null || width === 0 || height === 0) return null;
  return { width, height };
}

/** Markers that carry frame dimensions. SOF0..SOF15 excluding the non-SOF DHT/JPG/DAC slots. */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** JPEG: walk marker segments until a Start-Of-Frame, then read height @5, width @7. */
function parseJpegDimensions(buf: Uint8Array): ImageDimensions | null {
  let off = 2; // skip SOI (FF D8)
  while (off + 1 < buf.length) {
    if (buf[off] !== 0xff) return null; // marker must start with FF — else corrupt
    const marker = buf[off + 1]!;
    // Standalone markers (RSTn, SOI, EOI, TEM) carry no length; skip 2 bytes.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const segLen = readU16BE(buf, off + 2);
    if (segLen === null || segLen < 2) return null; // fail-closed on bad length
    if (SOF_MARKERS.has(marker)) {
      const height = readU16BE(buf, off + 5);
      const width = readU16BE(buf, off + 7);
      if (width === null || height === null || width === 0 || height === 0) return null;
      return { width, height };
    }
    off += 2 + segLen; // advance past this segment
  }
  return null; // no SOF found
}

/** Read a little-endian uint24 at offset, or `null` if out of bounds. */
function readU24LE(buf: Uint8Array, off: number): number | null {
  if (off + 2 >= buf.length) return null;
  return buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16);
}

/** WebP has three sub-formats (VP8, VP8L, VP8X), each storing dimensions differently. */
function parseWebpDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 16) return null;
  // The chunk FourCC sits at offset 12.
  const c12 = buf[12], c13 = buf[13], c14 = buf[14], c15 = buf[15];
  // "VP8 " (lossy)
  if (c12 === 0x56 && c13 === 0x50 && c14 === 0x38 && c15 === 0x20) {
    // 16-bit key-frame header: width @26, height @28 as 14-bit little-endian values.
    if (buf.length < 30) return null;
    const width = (buf[26]! | (buf[27]! << 8)) & 0x3fff;
    const height = (buf[28]! | (buf[29]! << 8)) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }
  // "VP8L" (lossless): 1 signature byte then 14+14 bits packed little-endian.
  if (c12 === 0x56 && c13 === 0x50 && c14 === 0x38 && c15 === 0x4c) {
    if (buf.length < 25 || buf[20] !== 0x2f) return null; // 0x2f signature
    const b0 = buf[21]!, b1 = buf[22]!, b2 = buf[23]!, b3 = buf[24]!;
    const packed = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  // "VP8X" (extended): canvas size is 24-bit little-endian minus-one at 24/27.
  if (c12 === 0x56 && c13 === 0x50 && c14 === 0x38 && c15 === 0x58) {
    const w = readU24LE(buf, 24);
    const h = readU24LE(buf, 27);
    if (w === null || h === null) return null;
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

/** Recover dimensions for a sniffed format, or `null` on any malformation/truncation. */
export function parseDimensions(
  format: SniffedFormat,
  buf: Uint8Array,
): ImageDimensions | null {
  switch (format) {
    case 'image/png':
      return parsePngDimensions(buf);
    case 'image/jpeg':
      return parseJpegDimensions(buf);
    case 'image/webp':
      return parseWebpDimensions(buf);
  }
}
