/**
 * @tryit/engine/internal/image_ref_to_input — normalise an ImageRef into a provider input URL.
 *
 * The hosted providers all accept an image as a single string — either the original HTTPS URL
 * or a `data:` URI for inline base64 bytes. This module performs that one mapping in a single
 * place so every adapter agrees on how a {@link TryOnRequest}'s person/garment image is encoded
 * for the wire, and so the https-only / allow-listed-MIME guarantees from the contract carry
 * straight through without each adapter re-implementing (and risking diverging on) the logic.
 */

import type { ImageRef } from '@tryit/contracts';

/**
 * Convert a validated {@link ImageRef} to the single-string form hosted providers expect.
 *
 * - `url` refs pass through their HTTPS URL unchanged (already https-validated by the contract).
 * - `base64` refs become a `data:<mime>;base64,<data>` URI from their allow-listed MIME type.
 *
 * The discriminated union is exhaustive; the unreachable branch fails closed.
 */
export function imageRefToInput(ref: ImageRef): string {
  if (ref.kind === 'url') {
    return ref.url;
  }
  if (ref.kind === 'base64') {
    return `data:${ref.mimeType};base64,${ref.data}`;
  }
  // fail-closed: an unknown discriminant (should be impossible post-validation) is rejected.
  throw new Error('imageRefToInput: unsupported image reference kind');
}
