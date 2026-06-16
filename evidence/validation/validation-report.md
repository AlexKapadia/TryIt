# TryIt — Public-Data-Only Validation Report

> **Boundary (binding): PUBLIC DATA ONLY — NO PII.**
> This final-gate validation uses only public, license-clear, public-*shaped* apparel
> catalog data and publicly-documented retailer integration schemas. It contains **no real
> PII, no private customer data, no confidential or deal documents, and nothing scraped from
> a private catalog**. It is isolated from the synthetic unit suite and is reproducible
> offline (the connector's `fetch` is injected with a committed fixture — no network).

**Verdict: PASS** — all 4 checks below passed.

## 1. Method

The validation drives the **real, built** platform code (not mocks):

- `packages/catalog-connectors` (`ShopifyConnector`) — normalises a realistic public
  Shopify-Admin-shaped product payload into the single `NormalizedProduct` contract.
- `packages/contracts` (`safeParseTryOnRequest`) — confirms the pipeline-entry contract
  accepts a realistic public apparel try-on request built around a normalised product.

Harness: `evidence/scripts/run_public_data_validation.mjs`
(machine-readable result: `evidence/data/validation_result.json`).

## 2. Inputs & provenance

- **Fixture:** `evidence/validation/public_catalog_fixture.json`
  (6 records).
- **Schema provenance:** Shopify Admin REST API: GET /admin/api/<version>/products.json — public developer documentation.
  The Shopify Admin product schema (field names + structure) is **public developer
  documentation**. Product titles, vendors, prices and image references are **illustrative
  placeholders for generic apparel** — they are not real merchant data.
- **Images:** neutral placeholder host (`picsum.photos`); URLs are validated for **shape**
  (HTTPS) only and are **never fetched**, so no remote content is load-bearing.

The fixture deliberately embeds three malformed records to prove fail-closed behaviour:
- id 1004 has an http:// (non-HTTPS) image — must be SKIPPED (SSRF / plaintext-fetch guard)
- id 1005 has an empty images array — must be SKIPPED (a product with no image cannot be tried on)
- the sixth record has no id/title — must be SKIPPED (mandatory identity missing)

## 3. Results

### 3.1 Normalised products (3 admitted)

| id | title | category | #images | price |
| --- | --- | --- | --- | --- |
| `1001` | Classic Cotton Crew T-Shirt | apparel | 2 | 24 |
| `1002` | Slim-Fit Denim Jacket | apparel | 1 | 89.5 |
| `1003` | Merino Wool Knit Sweater | apparel | 1 | 120 |

### 3.2 Skipped (fail-closed) — 3 records correctly refused

| upstream ref | reason |
| --- | --- |
| `1004` | imageRef must use https |
| `1005` | at least one imageRef required |
| `unknown` | Required |

The non-HTTPS image (SSRF / plaintext-fetch guard), the image-less product, and the
identity-less record were each rejected at the schema boundary and **reported**, never
allowed to crash the import or leak downstream.

### 3.3 Pipeline-entry contract

A realistic public apparel try-on request (placeholder base64 person image + the first
normalised public product id `1001`) was **accepted** by
`TryOnRequest` validation: `accepted = True`.

### 3.4 Check summary

| check | result |
| --- | --- |
| catalog_normalised_three_valid | PASS |
| catalog_skipped_three_bad | PASS |
| no_http_image_admitted | PASS |
| tryon_contract_accepts_public_input | PASS |

## 4. Reproduce

```
node evidence/scripts/run_public_data_validation.mjs > evidence/data/validation_result.json
evidence/.venv/Scripts/python evidence/scripts/write_validation_report.py
```

## 5. Boundary restatement

Public corporate/integration data and publicly-documented schemas are **not** confidential
client data. Everything sensitive stays synthetic. This report and its fixture contain
**public-data only, no PII**.
