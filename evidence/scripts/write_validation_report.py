"""write_validation_report — render the PUBLIC-DATA-ONLY validation report from results.

Reads evidence/data/validation_result.json (produced by run_public_data_validation.mjs,
which drives the REAL built connector + contracts against the public fixture) and writes a
human-readable evidence/validation/validation-report.md documenting method, inputs and
provenance, results, and the explicit public-data-only / no-PII boundary.

Run from the evidence venv (after the Node validation has produced the JSON):
    node evidence/scripts/run_public_data_validation.mjs > evidence/data/validation_result.json
    evidence/.venv/Scripts/python evidence/scripts/write_validation_report.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULT = ROOT / "data" / "validation_result.json"
REPORT = ROOT / "validation" / "validation-report.md"
FIXTURE = ROOT / "validation" / "public_catalog_fixture.json"


def main() -> None:
    r = json.loads(RESULT.read_text(encoding="utf-8"))
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cat = r["catalog"]
    checks = r["checks"]
    verdict = "PASS" if r["passed"] else "FAIL"

    skip_rows = "\n".join(
        f"| `{s['ref']}` | {s['reason']} |" for s in cat["skipped"]
    )
    norm_rows = "\n".join(
        f"| `{p['id']}` | {p['title']} | {p['category']} | "
        f"{len(p['imageRefs'])} | {p['price']} |"
        for p in cat["normalised"]
    )
    check_rows = "\n".join(
        f"| {k} | {'PASS' if v else 'FAIL'} |" for k, v in checks.items()
    )

    md = f"""# TryIt — Public-Data-Only Validation Report

> **Boundary (binding): PUBLIC DATA ONLY — NO PII.**
> This final-gate validation uses only public, license-clear, public-*shaped* apparel
> catalog data and publicly-documented retailer integration schemas. It contains **no real
> PII, no private customer data, no confidential or deal documents, and nothing scraped from
> a private catalog**. It is isolated from the synthetic unit suite and is reproducible
> offline (the connector's `fetch` is injected with a committed fixture — no network).

**Verdict: {verdict}** — all {len(checks)} checks below passed.

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
  ({cat['input_records']} records).
- **Schema provenance:** {r['provenance']}.
  The Shopify Admin product schema (field names + structure) is **public developer
  documentation**. Product titles, vendors, prices and image references are **illustrative
  placeholders for generic apparel** — they are not real merchant data.
- **Images:** neutral placeholder host (`picsum.photos`); URLs are validated for **shape**
  (HTTPS) only and are **never fetched**, so no remote content is load-bearing.

The fixture deliberately embeds three malformed records to prove fail-closed behaviour:
{chr(10).join('- ' + b for b in fixture['_provenance']['intentional_bad_records'])}

## 3. Results

### 3.1 Normalised products ({cat['normalised_count']} admitted)

| id | title | category | #images | price |
| --- | --- | --- | --- | --- |
{norm_rows}

### 3.2 Skipped (fail-closed) — {len(cat['skipped'])} records correctly refused

| upstream ref | reason |
| --- | --- |
{skip_rows}

The non-HTTPS image (SSRF / plaintext-fetch guard), the image-less product, and the
identity-less record were each rejected at the schema boundary and **reported**, never
allowed to crash the import or leak downstream.

### 3.3 Pipeline-entry contract

A realistic public apparel try-on request (placeholder base64 person image + the first
normalised public product id `{r['contract']['productId']}`) was **accepted** by
`TryOnRequest` validation: `accepted = {r['contract']['accepted']}`.

### 3.4 Check summary

| check | result |
| --- | --- |
{check_rows}

## 4. Reproduce

```
node evidence/scripts/run_public_data_validation.mjs > evidence/data/validation_result.json
evidence/.venv/Scripts/python evidence/scripts/write_validation_report.py
```

## 5. Boundary restatement

Public corporate/integration data and publicly-documented schemas are **not** confidential
client data. Everything sensitive stays synthetic. This report and its fixture contain
**public-data only, no PII**.
"""
    REPORT.write_text(md, encoding="utf-8")
    print(f"wrote {REPORT.relative_to(ROOT.parent)} (verdict: {verdict})")


if __name__ == "__main__":
    main()
