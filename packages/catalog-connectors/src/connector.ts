/**
 * @tryit/catalog-connectors/connector — the common interface every catalog connector implements.
 *
 * A connector knows how to talk to one retailer catalog source (Shopify, generic REST, …) and
 * emit {@link NormalizedProduct}s. The platform consumes connectors only through this interface,
 * so adding a new catalog source never changes downstream code. `listProducts` may stream
 * (AsyncIterable, for large/paginated catalogs) or return an array; `getProduct` returns `null`
 * — never throws — when a product is absent, so callers fail closed on a missing lookup.
 */

import type { NormalizedProduct } from './product.js';

/** Options accepted by {@link CatalogConnector.listProducts}. */
export interface ListProductsOptions {
  /** Soft cap on the number of products emitted. Connectors stop once reached. */
  limit?: number;
}

/** Outcome of a connector run that skipped malformed products, for fail-closed reporting. */
export interface SkippedProduct {
  /** The upstream id (or a positional marker) of the product that was dropped. */
  readonly ref: string;
  /** Human-readable reason the product failed validation and was skipped. */
  readonly reason: string;
}

/**
 * A source of normalized products. Implementations validate untrusted upstream data at the
 * boundary and never surface unvalidated shapes through these methods.
 */
export interface CatalogConnector {
  /**
   * List products from the catalog. May return an async iterable (preferred for large or
   * paginated catalogs, so memory stays bounded) or a resolved array. Malformed upstream
   * products are skipped, never thrown.
   */
  listProducts(opts?: ListProductsOptions): AsyncIterable<NormalizedProduct> | Promise<NormalizedProduct[]>;

  /**
   * Fetch a single product by its upstream id. Returns `null` when the product does not
   * exist or fails validation — callers treat a missing product as a hard no, not an error.
   */
  getProduct(id: string): Promise<NormalizedProduct | null>;
}

/**
 * The `fetch` surface a connector depends on. Injected (never imported globally) so every
 * connector is fully testable offline with a fixture-backed fake — no network in tests.
 */
export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<FetchLikeResponse>;

/** The minimal response shape a connector reads from {@link FetchLike}. */
export interface FetchLikeResponse {
  readonly ok: boolean;
  readonly status: number;
  /** Reads response headers (e.g. the Shopify `Link` pagination header). */
  readonly headers: { get(name: string): string | null };
  /** Parses the body as JSON. */
  json(): Promise<unknown>;
}
