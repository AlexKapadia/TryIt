/**
 * run_public_data_validation.mjs — PUBLIC-DATA-ONLY final-gate validation.
 *
 * Drives the REAL built catalog connector (packages/catalog-connectors dist) and the REAL
 * contracts (packages/contracts dist) against a committed, PUBLIC-SHAPED apparel fixture
 * (evidence/validation/public_catalog_fixture.json). It proves two things end-to-end with
 * production code, not mocks:
 *
 *   1. The Shopify connector normalises a realistic public Shopify-Admin-shaped payload into
 *      the single NormalizedProduct contract, and FAILS CLOSED on the deliberately-bad
 *      records (non-HTTPS image, no image, missing identity) — skipping + reporting them.
 *   2. The TryOnRequest contract accepts a realistic public apparel try-on request built
 *      around one of the normalised products (contract round-trip), so the pipeline seam is
 *      satisfied by real public-shaped inputs.
 *
 * BOUNDARY: public data only, no PII. The injected fetch returns the local fixture — no
 * network, nothing scraped, no private catalog. Emits a JSON result object to stdout for the
 * Python report writer.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ShopifyConnector } from '../../packages/catalog-connectors/dist/shopify.js';
import { safeParseTryOnRequest } from '../../packages/contracts/dist/tryon.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'validation', 'public_catalog_fixture.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

// Injected fetch: serves the public fixture as a single Shopify page (no Link -> no next page).
const fetchFixture = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ products: fixture.products }),
});

async function validateCatalog() {
  const connector = new ShopifyConnector({
    shop: 'public-demo.myshopify.com',
    token: 'public-fixture-token-not-a-secret',
    fetch: fetchFixture,
  });
  const normalised = [];
  for await (const product of connector.listProducts()) {
    normalised.push({
      id: product.id,
      title: product.title,
      category: product.category,
      imageRefs: product.imageRefs,
      price: product.price ?? null,
    });
  }
  return {
    input_records: fixture.products.length,
    normalised_count: normalised.length,
    normalised,
    skipped: connector.skipped.map((s) => ({ ref: s.ref, reason: s.reason })),
  };
}

function validateTryOnContract(firstProduct) {
  // A realistic public apparel try-on request: a placeholder base64 person image + the
  // normalised public product id. Proves the pipeline-entry contract accepts public inputs.
  const request = {
    tenantId: 'public-demo-tenant',
    shopperId: 'public-demo-shopper',
    productId: firstProduct.id,
    personImage: {
      kind: 'base64',
      mimeType: 'image/png',
      data: Buffer.from('public-demo-person-placeholder').toString('base64'),
    },
    params: { numSamples: 1, seed: 42 },
  };
  const parsed = safeParseTryOnRequest(request);
  return {
    accepted: parsed.success === true,
    productId: firstProduct.id,
    error: parsed.success ? null : (parsed.error?.issues?.[0]?.message ?? 'rejected'),
  };
}

async function main() {
  const catalog = await validateCatalog();
  const contract = catalog.normalised.length
    ? validateTryOnContract(catalog.normalised[0])
    : { accepted: false, productId: null, error: 'no normalised product to test' };

  const expectedSkips = 3; // ids 1004 (http), 1005 (no image), and the no-identity record
  const result = {
    boundary: 'public-data only; no PII',
    provenance: fixture._provenance.schema_reference,
    catalog,
    contract,
    checks: {
      catalog_normalised_three_valid: catalog.normalised_count === 3,
      catalog_skipped_three_bad: catalog.skipped.length === expectedSkips,
      no_http_image_admitted: catalog.normalised.every((p) =>
        p.imageRefs.every((u) => u.startsWith('https://'))),
      tryon_contract_accepts_public_input: contract.accepted === true,
    },
  };
  result.passed = Object.values(result.checks).every(Boolean);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(2);
});
