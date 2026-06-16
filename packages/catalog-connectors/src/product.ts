/**
 * @tryit/catalog-connectors/product — the normalized product shape every connector emits.
 *
 * Retailer catalogs come in many wire formats (Shopify, arbitrary REST). Each connector
 * maps its upstream payload into this single, validated shape so the rest of the try-on
 * platform only ever sees one product contract. The schema is the boundary: upstream data
 * is untrusted, so it is parsed here and fails closed on anything malformed.
 *
 * A product is only usable for try-on if it carries at least one image, and images must be
 * HTTPS (no plaintext fetch, no `data:`/`file:` SSRF vectors) — those invariants are
 * enforced by the schema, not by convention.
 */

import { z } from 'zod';

/** Default product category when an upstream catalog does not classify the item. */
export const DEFAULT_CATEGORY = 'apparel';

/**
 * An HTTPS image reference. Try-on needs at least one fetchable garment image, and we only
 * ever accept HTTPS — http/data/file URLs are refused to block plaintext fetches and SSRF.
 */
const HttpsImageRefSchema = z
  .string()
  .url()
  // fail-closed: only https image refs are accepted; everything else is rejected.
  .refine((value) => value.startsWith('https://'), {
    message: 'imageRef must use https',
  });

/**
 * The normalized product every connector emits. `id` and `title` are mandatory identity,
 * `imageRefs` must be non-empty (a product with no image cannot be tried on), and the
 * commercial fields (price/currency/vendor) are optional. `category` defaults to apparel.
 */
export const NormalizedProductSchema = z.object({
  // Stable upstream identifier, stringified by the connector so all ids share one type.
  id: z.string().min(1, { message: 'id must be a non-empty string' }),
  title: z.string().min(1, { message: 'title must be a non-empty string' }),
  // At least one HTTPS image is required: a try-on product without an image is unusable.
  imageRefs: z.array(HttpsImageRefSchema).min(1, { message: 'at least one imageRef required' }),
  // price is a non-negative finite number when present; negative/NaN prices fail closed.
  price: z.number().finite().nonnegative().optional(),
  // ISO-4217-ish currency code; bounded length, uppercased by the connector before parse.
  currency: z.string().min(3).max(3).optional(),
  category: z.string().min(1).default(DEFAULT_CATEGORY),
  vendor: z.string().min(1).optional(),
});

/** A validated, normalized product ready for the try-on pipeline. */
export type NormalizedProduct = z.infer<typeof NormalizedProductSchema>;

/**
 * Parse an unknown value into a {@link NormalizedProduct}.
 *
 * @throws {z.ZodError} if the input is not a valid normalized product.
 */
export function parseNormalizedProduct(input: unknown): NormalizedProduct {
  // fail-closed: malformed products throw rather than flowing downstream.
  return NormalizedProductSchema.parse(input);
}

/** Non-throwing variant of {@link parseNormalizedProduct}. */
export function safeParseNormalizedProduct(
  input: unknown,
): z.SafeParseReturnType<unknown, NormalizedProduct> {
  return NormalizedProductSchema.safeParse(input);
}
