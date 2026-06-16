/**
 * @tryit/widget/validate-file — client-side file gate enforced BEFORE any upload.
 *
 * Instruct-before-capture (component-inventory §4): the shopper's selected file is checked for
 * type and size here, in the browser, before a single byte leaves the device. This mirrors the
 * `@tryit/contracts` image constraints (jpeg/png/webp, ≤8MB decoded) so the obvious rejections
 * never cost a round-trip and the privacy posture is honoured (no upload of an invalid file).
 *
 * Fail-closed: an unrecognised MIME type or an oversize file is rejected with the matching
 * contract error code; only an explicitly allowed file passes.
 */

import { ALLOWED_IMAGE_MIME_TYPES, MAX_BASE64_DECODED_BYTES, type ErrorCode } from '@tryit/contracts';

/** Outcome of validating a chosen file: accepted, or rejected with the matching error code. */
export type FileValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: ErrorCode };

/** The minimal shape of a chosen file this validator needs (a `File` satisfies it). */
export interface ChosenFile {
  readonly type: string;
  readonly size: number;
}

/**
 * Validate a chosen file against the allowed MIME types and size bound.
 *
 * @returns `{ ok: true }` for an allowed image within the size limit; otherwise `{ ok: false }`
 *   with `INVALID_INPUT` for a disallowed type or `PAYLOAD_TOO_LARGE` for an oversize file.
 *   Type is checked first so a giant non-image still reports the more actionable type error.
 */
export function validateChosenFile(file: ChosenFile): FileValidation {
  // fail-closed: only the allow-listed raster image types are accepted.
  const allowed = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
  if (!allowed) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  // Bound size against the same decoded-byte limit the API enforces.
  if (file.size > MAX_BASE64_DECODED_BYTES) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  }
  return { ok: true };
}
