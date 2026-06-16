/**
 * @tryit/catalog-connectors — product-catalog ingestion connectors.
 *
 * Pulls retailer product/garment data into the TryIt platform via a Shopify connector and a
 * generic REST connector, normalising each into one shared {@link NormalizedProduct} shape.
 * All upstream responses are untrusted and parsed with Zod at the boundary, failing closed on
 * malformed data: a single bad record is skipped and reported, never allowed to crash an import.
 *
 * This file is a barrel — the connectors and shared product contract live in focused,
 * single-responsibility modules and are re-exported here.
 */

export * from './product.js';
export * from './connector.js';
export * from './shopify.js';
export * from './generic-rest.js';
