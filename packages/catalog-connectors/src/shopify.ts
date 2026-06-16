/**
 * @tryit/catalog-connectors/shopify — connector for the Shopify Admin product API.
 *
 * Shopify returns products as `{ products: [...] }`, each product carrying an `images` array
 * and a `variants` array (variants hold per-SKU pricing). This connector maps that shape into
 * {@link NormalizedProduct}s: it collects every image URL, takes the lead variant's price, and
 * parses the result through the shared schema so only valid products escape. Cursor pagination
 * is followed via the `Link: <…page_info=…>; rel="next"` response header until exhausted.
 *
 * The upstream `fetch` is injected (never the global), so the connector runs entirely offline
 * against fixtures in tests — there is no network in the unit suite. Non-2xx responses fail
 * closed (the page yields nothing and pagination stops).
 */

import type {
  CatalogConnector,
  FetchLike,
  FetchLikeResponse,
  ListProductsOptions,
  SkippedProduct,
} from './connector.js';
import { DEFAULT_CATEGORY, safeParseNormalizedProduct, type NormalizedProduct } from './product.js';

/** Configuration for {@link ShopifyConnector}. */
export interface ShopifyConfig {
  /** The store's myshopify domain, e.g. "demo.myshopify.com". */
  shop: string;
  /** Shopify Admin API access token (sent as the X-Shopify-Access-Token header). */
  token: string;
  fetch: FetchLike;
  /** Max products fetched per page (Shopify caps at 250; defaults to 250). */
  pageSize?: number;
}

/** Extract the `page_info` cursor from a Shopify `Link` header's rel="next" entry, if present. */
export function nextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Link entries look like: <https://…?page_info=abc>; rel="next", <…>; rel="previous"
  for (const part of linkHeader.split(',')) {
    if (!/rel="next"/.test(part)) continue;
    const urlMatch = part.match(/<([^>]+)>/);
    if (!urlMatch?.[1]) continue;
    const pageInfo = new URL(urlMatch[1]).searchParams.get('page_info');
    if (pageInfo) return pageInfo;
  }
  return null;
}

/** Map one raw Shopify product object into a candidate normalized product (unvalidated). */
function buildCandidate(raw: unknown): Record<string, unknown> {
  const product = (raw ?? {}) as Record<string, unknown>;
  const images = Array.isArray(product.images) ? product.images : [];
  // Collect every image src; non-string/empty entries are dropped here and the schema
  // re-checks https, so a product with no usable image fails validation and is skipped.
  const imageRefs = images
    .map((img) => (img && typeof img === 'object' ? (img as Record<string, unknown>).src : undefined))
    .filter((src): src is string => typeof src === 'string');

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const lead = (variants[0] ?? {}) as Record<string, unknown>;
  // Shopify prices are decimal strings ("19.99"); coerce, and ignore unparseable values.
  const priceNum = typeof lead.price === 'string' ? Number(lead.price) : lead.price;
  const id = product.id;

  return {
    id: typeof id === 'number' || typeof id === 'string' ? String(id) : undefined,
    title: product.title,
    imageRefs,
    ...(typeof priceNum === 'number' && Number.isFinite(priceNum) ? { price: priceNum } : {}),
    ...(typeof product.vendor === 'string' && product.vendor.length > 0
      ? { vendor: product.vendor }
      : {}),
    category: DEFAULT_CATEGORY,
  };
}

/** A connector that ingests products from a Shopify store's Admin API. */
export class ShopifyConnector implements CatalogConnector {
  private readonly shop: string;
  private readonly token: string;
  private readonly fetch: FetchLike;
  private readonly pageSize: number;
  /** Products skipped during the most recent listing, for fail-closed reporting. */
  readonly skipped: SkippedProduct[] = [];

  constructor(config: ShopifyConfig) {
    this.shop = config.shop;
    this.token = config.token;
    this.fetch = config.fetch;
    this.pageSize = config.pageSize ?? 250;
  }

  /** Stream every product across all pages, skipping (and recording) malformed ones. */
  async *listProducts(opts?: ListProductsOptions): AsyncIterable<NormalizedProduct> {
    this.skipped.length = 0;
    let pageInfo: string | null = null;
    let emitted = 0;

    do {
      const url = this.pageUrl(pageInfo);
      const response = await this.fetch(url, {
        // least privilege: only the access token header the Admin API requires.
        headers: { 'X-Shopify-Access-Token': this.token, accept: 'application/json' },
      });
      // fail-closed: a non-2xx page yields nothing and halts pagination.
      if (!response.ok) {
        this.skipped.push({ ref: url, reason: `shopify responded ${response.status}` });
        return;
      }

      const products = await this.parsePage(response);
      for (const candidate of products) {
        if (opts?.limit !== undefined && emitted >= opts.limit) return;
        const result = safeParseNormalizedProduct(candidate);
        if (result.success) {
          yield result.data;
          emitted++;
        } else {
          const ref = typeof candidate.id === 'string' ? candidate.id : 'unknown';
          this.skipped.push({ ref, reason: result.error.issues[0]?.message ?? 'invalid product' });
        }
      }

      pageInfo = nextPageInfo(response.headers.get('Link'));
    } while (pageInfo !== null);
  }

  /** Look up one product by id; returns `null` when absent or invalid. */
  async getProduct(id: string): Promise<NormalizedProduct | null> {
    for await (const product of this.listProducts()) {
      if (product.id === id) return product;
    }
    return null;
  }

  /** Build the paged Admin API URL, carrying the cursor when continuing pagination. */
  private pageUrl(pageInfo: string | null): string {
    const base = `https://${this.shop}/admin/api/2024-01/products.json`;
    const params = new URLSearchParams({ limit: String(this.pageSize) });
    if (pageInfo) params.set('page_info', pageInfo);
    return `${base}?${params.toString()}`;
  }

  /** Read a response body and return the raw product candidates within it. */
  private async parsePage(response: FetchLikeResponse): Promise<Record<string, unknown>[]> {
    const body = (await response.json()) as Record<string, unknown> | null;
    const products = body && Array.isArray(body.products) ? body.products : [];
    return products.map(buildCandidate);
  }
}
