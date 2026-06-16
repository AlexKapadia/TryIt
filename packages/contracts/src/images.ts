/**
 * @tryit/contracts/images — image reference contracts for try-on requests.
 *
 * A shopper's person image (or a garment image) reaches the engine either as a remote
 * HTTPS URL or as inline base64 bytes. Both arrive from untrusted callers, so this module
 * defines a discriminated union that parses and bounds them at the boundary: URLs must be
 * HTTPS (no plaintext fetches, no `data:`/`file:` SSRF vectors), and inline payloads are
 * format- and size-bounded so a hostile caller cannot exhaust memory with a giant blob.
 * Fail closed: anything that does not match these shapes is rejected, never coerced.
 */

import { z } from 'zod';

/**
 * Image MIME types accepted for inline base64 payloads. Kept deliberately narrow:
 * only raster formats the try-on providers can actually consume are allowed.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** A MIME type accepted for inline base64 image payloads. */
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * Maximum decoded size (bytes) of an inline base64 image. 8 MiB is generous for a single
 * photo yet bounds memory use. The base64 *string* is ~4/3 of the decoded size; we validate
 * against the decoded length to keep the limit meaningful regardless of padding.
 */
export const MAX_BASE64_DECODED_BYTES = 8 * 1024 * 1024;

/** Strict-ish base64 alphabet check (with optional `=` padding). Guards against junk input. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** Estimate the decoded byte length of a base64 string without allocating the buffer. */
function decodedByteLength(base64: string): number {
  // Each 4 base64 chars encode 3 bytes; trailing '=' padding reduces the final group.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** A remotely-hosted image referenced by an HTTPS URL. */
export const UrlImageRefSchema = z.object({
  kind: z.literal('url'),
  // fail-closed: only HTTPS is accepted; http/data/file URLs are rejected to block SSRF
  // and plaintext fetches. `z.string().url()` first guarantees a well-formed URL.
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), {
      message: 'image url must use https',
    }),
});

/** An inline image carried as base64-encoded bytes plus its declared MIME type. */
export const Base64ImageRefSchema = z.object({
  kind: z.literal('base64'),
  // Only an allow-listed image MIME type may be declared; everything else is refused.
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  data: z
    .string()
    .min(1)
    .regex(BASE64_PATTERN, { message: 'data must be valid base64' })
    .refine((value) => decodedByteLength(value) <= MAX_BASE64_DECODED_BYTES, {
      message: 'image exceeds maximum allowed size',
    }),
});

/**
 * A reference to an image supplied by a caller: either an HTTPS URL or inline base64 bytes.
 * Discriminated on `kind` so invalid combinations (e.g. a URL with base64 fields) are caught.
 */
export const ImageRefSchema = z.discriminatedUnion('kind', [
  UrlImageRefSchema,
  Base64ImageRefSchema,
]);

/** A validated image reference. */
export type ImageRef = z.infer<typeof ImageRefSchema>;

/**
 * Parse an unknown input into a validated {@link ImageRef}.
 *
 * @throws {z.ZodError} if the input is not a valid image reference.
 */
export function parseImageRef(input: unknown): ImageRef {
  // fail-closed: invalid image references throw rather than flowing downstream.
  return ImageRefSchema.parse(input);
}

/** Non-throwing variant of {@link parseImageRef}; returns a Zod result discriminated union. */
export function safeParseImageRef(input: unknown): z.SafeParseReturnType<unknown, ImageRef> {
  return ImageRefSchema.safeParse(input);
}
