/**
 * @tryit/contracts/tryon — the core try-on request and result contracts.
 *
 * `TryOnRequestSchema` is the wire shape the API accepts from tenants; `TryOnResultSchema`
 * is the shape the engine returns once a provider has produced an image. Both derive their
 * static types from the schema so runtime validation and compile-time types never drift.
 * Untrusted request input is parsed at the boundary and fails closed on anything invalid.
 */

import { z } from 'zod';
import { ImageRefSchema } from './images.js';

/** Product categories supported by the try-on engine. Apparel is the only Gate 0 category. */
export const TryOnCategorySchema = z.enum(['apparel']);

/** A supported try-on product category. */
export type TryOnCategory = z.infer<typeof TryOnCategorySchema>;

/**
 * Optional provider-tuning parameters for a try-on request. Every field is optional so the
 * caller can supply none; `numSamples` is bounded so a caller cannot request unbounded work.
 */
export const TryOnParamsSchema = z.object({
  // Deterministic seed for reproducible generations; any finite integer is acceptable.
  seed: z.number().int().optional(),
  // An explicit garment image; if omitted the engine resolves the garment from `productId`.
  garmentImage: ImageRefSchema.optional(),
  // Bound the fan-out: 1..4 samples per request. Prevents a caller exhausting provider quota.
  numSamples: z.number().int().min(1).max(4).optional(),
});

/** Validated try-on tuning parameters. */
export type TryOnParams = z.infer<typeof TryOnParamsSchema>;

/**
 * A request to generate a virtual try-on for a single shopper and product.
 *
 * `tenantId` scopes the request for tenant isolation; `shopperId` identifies the end user.
 * `category` defaults to `apparel`. `params` is optional and bounded by {@link TryOnParamsSchema}.
 */
export const TryOnRequestSchema = z.object({
  tenantId: z.string().min(1),
  shopperId: z.string().min(1),
  personImage: ImageRefSchema,
  productId: z.string().min(1),
  category: TryOnCategorySchema.default('apparel'),
  params: TryOnParamsSchema.optional(),
});

/** A validated virtual try-on request. */
export type TryOnRequest = z.infer<typeof TryOnRequestSchema>;

/**
 * The outcome of a completed try-on generation as returned to the caller.
 *
 * `latencyMs` and `costUsd` are non-negative; `cached` flags a result served from cache
 * (which typically carries zero marginal cost). `provider` records which backend produced it.
 */
export const TryOnResultSchema = z.object({
  // fail-closed: only HTTPS result URLs are surfaced to callers.
  resultImageUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), { message: 'result url must use https' }),
  provider: z.string().min(1),
  latencyMs: z.number().nonnegative(),
  cached: z.boolean(),
  costUsd: z.number().nonnegative(),
});

/** A validated try-on result. */
export type TryOnResult = z.infer<typeof TryOnResultSchema>;

/**
 * Parse and validate an unknown input into a {@link TryOnRequest}.
 *
 * @returns The parsed request with defaults applied (e.g. `category`).
 * @throws {z.ZodError} if the input does not satisfy {@link TryOnRequestSchema}.
 */
export function parseTryOnRequest(input: unknown): TryOnRequest {
  // fail-closed: invalid input throws rather than flowing downstream as a partial object.
  return TryOnRequestSchema.parse(input);
}

/** Non-throwing variant of {@link parseTryOnRequest}. */
export function safeParseTryOnRequest(
  input: unknown,
): z.SafeParseReturnType<unknown, TryOnRequest> {
  return TryOnRequestSchema.safeParse(input);
}

/**
 * Parse and validate an unknown input into a {@link TryOnResult}.
 *
 * @throws {z.ZodError} if the input does not satisfy {@link TryOnResultSchema}.
 */
export function parseTryOnResult(input: unknown): TryOnResult {
  return TryOnResultSchema.parse(input);
}

/** Non-throwing variant of {@link parseTryOnResult}. */
export function safeParseTryOnResult(input: unknown): z.SafeParseReturnType<unknown, TryOnResult> {
  return TryOnResultSchema.safeParse(input);
}
