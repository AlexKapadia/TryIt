/**
 * @tryit/contracts — shared typed data contracts for the TryIt virtual try-on platform.
 *
 * This module is the single source of truth for the wire-level shapes that flow between
 * the API, engine, providers, and SDKs. Contracts are declared as Zod schemas so that both
 * runtime validation (untrusted input is parsed, never trusted) and static TypeScript types
 * derive from one definition and can never drift apart. Treat every external input as
 * untrusted: callers should parse with these schemas at the boundary and fail closed on
 * invalid data rather than passing raw payloads downstream.
 */

import { z } from 'zod';

/**
 * How a shopper's person image is supplied to a try-on request.
 * `url` references a remotely-hosted image; `base64` carries inline image bytes.
 */
export const PersonImageSchema = z.object({
  kind: z.enum(['url', 'base64']),
  value: z.string().min(1),
});

/** A shopper's person image reference. */
export type PersonImage = z.infer<typeof PersonImageSchema>;

/** Product categories supported by the try-on engine. Apparel is the only Gate 0 category. */
export const TryOnCategorySchema = z.enum(['apparel']);

/** A supported try-on product category. */
export type TryOnCategory = z.infer<typeof TryOnCategorySchema>;

/**
 * A request to generate a virtual try-on for a single shopper and product.
 *
 * `tenantId` scopes the request for tenant isolation; `shopperId` identifies the end user.
 * `params` is an open-ended bag of provider-specific tuning options and is optional.
 */
export const TryOnRequestSchema = z.object({
  tenantId: z.string().min(1),
  shopperId: z.string().min(1),
  personImage: PersonImageSchema,
  productId: z.string().min(1),
  category: TryOnCategorySchema.default('apparel'),
  params: z.record(z.unknown()).optional(),
});

/** A validated virtual try-on request. */
export type TryOnRequest = z.infer<typeof TryOnRequestSchema>;

/**
 * Parse and validate an unknown input into a {@link TryOnRequest}.
 *
 * @param input - Untrusted input, typically a decoded JSON request body.
 * @returns The parsed, validated request with defaults applied (e.g. `category`).
 * @throws {z.ZodError} if the input does not satisfy {@link TryOnRequestSchema}.
 */
export function parseTryOnRequest(input: unknown): TryOnRequest {
  // fail-closed: invalid input throws rather than flowing downstream as a partial object.
  return TryOnRequestSchema.parse(input);
}
