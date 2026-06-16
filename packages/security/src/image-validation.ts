/**
 * @tryit/security/image-validation — validate untrusted uploaded images before processing.
 *
 * Shopper images arrive from untrusted callers as an {@link ImageRef} (inline base64) or raw
 * bytes. Before any of it reaches a provider we enforce, fail-closed, that: the bytes' true
 * format (sniffed from magic bytes) matches the caller's declared MIME; the payload is within a
 * byte ceiling; and the parsed pixel dimensions are within a width/height ceiling (rejecting
 * dimension-bomb images whose tiny payload decodes to enormous canvases). Any anomaly — spoofed
 * MIME, oversize, truncated/garbled header, out-of-range dimensions — is rejected, never coerced.
 *
 * The {@link ImageSanitizer} seam returns only validated bytes. The default is a passthrough;
 * production wires a full decode+re-encode (e.g. sharp) here to strip embedded payloads, EXIF,
 * and trailing data so nothing the parser did not understand survives (threat T2: malicious
 * payload smuggled inside an image).
 */
import { type ImageRef } from '@tryit/contracts';
import {
  parseDimensions,
  sniffFormat,
  type SniffedFormat,
} from './image-dimensions.js';

/** Bounds applied to every validated image. All limits are inclusive maxima. */
export interface ImageValidationLimits {
  /** Maximum decoded payload size in bytes (inclusive). */
  readonly maxBytes: number;
  /** Maximum image width in pixels (inclusive). */
  readonly maxWidth: number;
  /** Maximum image height in pixels (inclusive). */
  readonly maxHeight: number;
}

/** Conservative default limits: 8 MiB, 4096x4096. */
export const DEFAULT_IMAGE_LIMITS: ImageValidationLimits = {
  maxBytes: 8 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
};

/** Why validation failed. Deny-by-default: every non-`ok` outcome refuses the upload. */
export type ImageRejectReason =
  | 'unrecognised-format'
  | 'mime-mismatch'
  | 'too-large'
  | 'malformed-header'
  | 'dimensions-too-large';

/** Discriminated validation outcome carrying the sanitised bytes on success. */
export type ImageValidationResult =
  | {
      readonly ok: true;
      readonly format: SniffedFormat;
      readonly width: number;
      readonly height: number;
      /** Validated (and, with a real sanitizer, re-encoded) bytes. */
      readonly bytes: Uint8Array;
    }
  | { readonly ok: false; readonly reason: ImageRejectReason };

/**
 * A seam that returns only validated bytes. Implementations MUST NOT pass through anything the
 * validator did not understand. The default {@link PassthroughImageSanitizer} returns the bytes
 * unchanged; a production implementation decodes and re-encodes to strip embedded data/EXIF.
 */
export interface ImageSanitizer {
  sanitize(bytes: Uint8Array, format: SniffedFormat): Uint8Array;
}

/**
 * Default sanitizer: returns the validated bytes unchanged.
 *
 * NOTE: this does NOT strip EXIF or trailing payloads. Production deployments wire a full
 * decode+re-encode (e.g. sharp) here so that only re-encoded pixels — never attacker-controlled
 * bytes after the parsed header — leave this boundary (threat T2).
 */
export class PassthroughImageSanitizer implements ImageSanitizer {
  sanitize(bytes: Uint8Array, _format: SniffedFormat): Uint8Array {
    return bytes;
  }
}

/** Map a sniffed format to the MIME string a caller would declare. */
function formatToMime(format: SniffedFormat): string {
  return format; // SniffedFormat values are themselves MIME strings
}

/**
 * Validate raw image bytes against limits, asserting the declared MIME (if given) matches the
 * sniffed format. Returns sanitised bytes on success. Fail-closed at every step.
 */
export function validateImageBytes(
  bytes: Uint8Array,
  declaredMime: string | undefined,
  limits: ImageValidationLimits = DEFAULT_IMAGE_LIMITS,
  sanitizer: ImageSanitizer = new PassthroughImageSanitizer(),
): ImageValidationResult {
  // Size ceiling first: bound work before parsing untrusted structure.
  if (bytes.length > limits.maxBytes) {
    return { ok: false, reason: 'too-large' }; // fail-closed: oversize payload
  }

  const format = sniffFormat(bytes);
  if (format === null) {
    return { ok: false, reason: 'unrecognised-format' }; // fail-closed: unknown bytes
  }

  // Declared MIME must equal the true format — defeats extension/MIME spoofing.
  if (declaredMime !== undefined && declaredMime !== formatToMime(format)) {
    return { ok: false, reason: 'mime-mismatch' };
  }

  const dims = parseDimensions(format, bytes);
  if (dims === null) {
    return { ok: false, reason: 'malformed-header' }; // fail-closed: truncated/garbled
  }

  if (dims.width > limits.maxWidth || dims.height > limits.maxHeight) {
    return { ok: false, reason: 'dimensions-too-large' }; // fail-closed: dimension bomb
  }

  return {
    ok: true,
    format,
    width: dims.width,
    height: dims.height,
    bytes: sanitizer.sanitize(bytes, format),
  };
}

/**
 * Validate an inline base64 {@link ImageRef}. URL refs carry no inline bytes to inspect here and
 * are rejected (`unrecognised-format`) — they are validated when fetched, not at this seam.
 * The base64 string is decoded, then handed to {@link validateImageBytes} with the ref's declared
 * MIME so a base64 payload whose bytes disagree with `mimeType` is refused.
 */
export function validateImageRef(
  ref: ImageRef,
  limits: ImageValidationLimits = DEFAULT_IMAGE_LIMITS,
  sanitizer: ImageSanitizer = new PassthroughImageSanitizer(),
): ImageValidationResult {
  if (ref.kind !== 'base64') {
    // fail-closed: no inline bytes to validate for a URL ref at this boundary.
    return { ok: false, reason: 'unrecognised-format' };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(ref.data, 'base64'));
  } catch {
    return { ok: false, reason: 'malformed-header' }; // fail-closed on undecodable base64
  }

  return validateImageBytes(bytes, ref.mimeType, limits, sanitizer);
}
