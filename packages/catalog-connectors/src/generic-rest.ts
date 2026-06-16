/**
 * @tryit/catalog-connectors/generic-rest — a configurable connector for arbitrary REST catalogs.
 *
 * Many retailers expose a bespoke JSON product feed rather than a known platform. Rather than
 * write a connector per retailer, this one is driven by a {@link FieldMapping} of dot-path
 * strings ("data.items.0.sku") describing where each normalized field lives in the upstream
 * record. It is deliberately tolerant of messy feeds: a record missing a required field (id,
 * title, image) is skipped and reported — never thrown — so one bad row can't sink an import.
 * All extracted data is still parsed by the shared schema, so what comes out is always valid.
 */

import type {
  CatalogConnector,
  FetchLike,
  ListProductsOptions,
  SkippedProduct,
} from './connector.js';
import { DEFAULT_CATEGORY, safeParseNormalizedProduct, type NormalizedProduct } from './product.js';

/** Dot-path field mapping from an upstream record to the normalized product shape. */
export interface FieldMapping {
  /** Path to the (array of) products within the top-level JSON response. Empty = root array. */
  itemsPath?: string;
  idPath: string;
  titlePath: string;
  /** Path to a single image string, or to an array of image strings. */
  imagePath: string;
  pricePath?: string;
  currencyPath?: string;
  categoryPath?: string;
  vendorPath?: string;
}

/** Configuration for {@link GenericRestConnector}. */
export interface GenericRestConfig {
  /** Absolute HTTPS URL of the catalog feed. */
  url: string;
  fetch: FetchLike;
  mapping: FieldMapping;
}

/** Read a value at a dot-path from an arbitrary parsed-JSON value. Returns `undefined` if absent. */
export function getByPath(root: unknown, path: string): unknown {
  if (path === '') return root;
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (current == null) return undefined; // fail-closed: stop on null/undefined ancestor
    if (Array.isArray(current)) {
      const index = Number(segment);
      // Only a valid in-range integer index reads from an array; anything else is a miss.
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined; // can't descend into a primitive
    }
  }
  return current;
}

/** Coerce a mapped value into the imageRefs array the schema expects (single string or array). */
function toImageRefs(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/** Build a candidate normalized product from one upstream record using the mapping. */
function buildCandidate(record: unknown, mapping: FieldMapping): Record<string, unknown> {
  const price = getByPath(record, mapping.pricePath ?? '');
  const currency = getByPath(record, mapping.currencyPath ?? '');
  const category = getByPath(record, mapping.categoryPath ?? '');
  const vendor = getByPath(record, mapping.vendorPath ?? '');
  const id = getByPath(record, mapping.idPath);
  return {
    // Stringify id so numeric upstream ids satisfy the string contract.
    id: typeof id === 'number' || typeof id === 'string' ? String(id) : undefined,
    title: getByPath(record, mapping.titlePath),
    imageRefs: toImageRefs(getByPath(record, mapping.imagePath)),
    ...(typeof price === 'number' ? { price } : {}),
    ...(typeof currency === 'string' ? { currency: currency.toUpperCase() } : {}),
    ...(typeof category === 'string' && category.length > 0 ? { category } : { category: DEFAULT_CATEGORY }),
    ...(typeof vendor === 'string' ? { vendor } : {}),
  };
}

/** A connector that ingests an arbitrary REST product feed via a dot-path field mapping. */
export class GenericRestConnector implements CatalogConnector {
  private readonly url: string;
  private readonly fetch: FetchLike;
  private readonly mapping: FieldMapping;
  /** Products skipped on the most recent {@link listProducts} call, for fail-closed reporting. */
  readonly skipped: SkippedProduct[] = [];

  constructor(config: GenericRestConfig) {
    this.url = config.url;
    this.fetch = config.fetch;
    this.mapping = config.mapping;
  }

  /** Fetch the feed and normalize every record, skipping (and recording) malformed ones. */
  async listProducts(opts?: ListProductsOptions): Promise<NormalizedProduct[]> {
    this.skipped.length = 0;
    const response = await this.fetch(this.url, { headers: { accept: 'application/json' } });
    // fail-closed: a non-2xx feed yields no products rather than a guessed payload.
    if (!response.ok) {
      this.skipped.push({ ref: this.url, reason: `feed responded ${response.status}` });
      return [];
    }
    const body = await response.json();
    const items = getByPath(body, this.mapping.itemsPath ?? '');
    const records = Array.isArray(items) ? items : [];

    const products: NormalizedProduct[] = [];
    for (let i = 0; i < records.length; i++) {
      if (opts?.limit !== undefined && products.length >= opts.limit) break;
      const candidate = buildCandidate(records[i], this.mapping);
      const result = safeParseNormalizedProduct(candidate);
      if (result.success) {
        products.push(result.data);
      } else {
        // Tolerant import: record the skip with its position/id, never throw on one bad row.
        const ref = typeof candidate.id === 'string' ? candidate.id : `index:${i}`;
        this.skipped.push({ ref, reason: result.error.issues[0]?.message ?? 'invalid product' });
      }
    }
    return products;
  }

  /** Look up one product by id by scanning the feed; returns `null` when absent or invalid. */
  async getProduct(id: string): Promise<NormalizedProduct | null> {
    const products = await this.listProducts();
    return products.find((p) => p.id === id) ?? null;
  }
}
