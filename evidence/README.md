# TryIt — Evidence Showcase

A **self-contained, separable** evidence package for TryIt (open-source virtual try-on
platform). It proves — to a peer-reviewed standard, with reproducible scripts — that the
system is well-tested, well-architected, fast on its deterministic path, and economical at
scale, and it validates the catalog pipeline against **public data only**.

Nothing here is part of the runtime. All plotting/diagram dependencies are isolated in
`requirements-analysis.txt` and installed only into the git-ignored local `.venv`.

## Headline numbers

| Claim | Evidence | Figure |
| --- | --- | --- |
| The suite is the evidence | `graphs/test_counts_per_package.*` | **755 automated tests** across 11 packages |
| Coverage clears the gates | `graphs/coverage_per_package.*` | every package **95.3–100%** line cov vs **90% / 85%** gates |
| Fast deterministic fallback (**MEASURED**) | `graphs/latency_distribution.*` | deterministic provider **p50 14.3 µs · p95 28.8 µs · p99 68.3 µs** (n=20k) |
| Fast cache-key derivation (**MEASURED**) | `graphs/latency_distribution.*` | **p50 46.2 µs · p95 72.8 µs · p99 130.3 µs** (n=20k) |
| Caching collapses cost (**MODELLED**) | `graphs/cost_vs_cache_hit_rate.*` | 10M req/day: **\$500k → \$100k/day** at 80% hit (\$0.05/hosted call) |
| Public-data validation passes | `validation/validation-report.md` | **PASS** — 3 valid products normalised, 3 bad records failed-closed |

Measured latency is steady-state (2,000 warm-up iterations excluded) over the **real built
TypeScript** (`packages/cache` + `packages/engine` dist), network-free. Mean values carry
95% bootstrap confidence intervals (see `data/benchmark_metrics.json`).

## What each artifact proves

### `diagrams/` — monochrome architecture schematics (HTML + PNG each)
Genuinely black-&-white, print-quality flow diagrams, one per major component plus the
whole system. Each is grounded in its source package.

| File | Proves |
| --- | --- |
| `00_whole_system_request_flow` | the end-to-end `POST /v1/tryons` flow: 8 ordered fail-closed gates → tenant cache → engine router → audit log |
| `01_security_gate` | auth → rate-limit → image-validation, deny-by-default, audit on every path |
| `02_cache_key_derivation` | tenant-namespaced, content-addressed, length-prefixed SHA-256 key (no cross-tenant collisions) |
| `03_engine_provider_fallthrough` | router orders by allow-list/priority/cost; deterministic provider is the terminal fallback |
| `04_catalog_connectors` | Shopify / REST → one `NormalizedProduct`; HTTPS-only; fail-closed skips |
| `05_widget_state_machine` | the embeddable `<tryit-widget>` state machine; every error mapped to copy |
| `06_inference_py_backend_selection` | FastAPI backend selection (Leffa / mock), validation fail-closed |

### `graphs/` — statistical & performance evidence (HTML + PNG each)
- `test_counts_per_package` — 755 tests across the 11 suites.
- `coverage_per_package` — line coverage vs the 90% line / 85% branch CI gates.
- `latency_distribution` — **MEASURED** per-op latency histograms with p50/p95/p99 markers.
- `cost_vs_cache_hit_rate` — **MODELLED** provider spend vs cache hit-rate at 1/5/10M req/day.

### `validation/` — public-data-only final gate
`validation-report.md` + `public_catalog_fixture.json`. Drives the real connector and
contracts against a public-*shaped* apparel catalog; documents method, provenance, results,
and the explicit **public-data-only, no-PII** boundary.

### `data/` — machine-readable results
`benchmark_metrics.json` (latency percentiles + CIs, cost model) and
`validation_result.json` (validation checks). Cited by the README and report so figures
cannot drift.

## Measured vs modelled (stated plainly)

- **MEASURED:** all latency figures — sampled from the real built TypeScript via
  `scripts/measure_pipeline_latency.mjs`. Only the deterministic, network-free hot path is
  timed (hosted-provider latency depends on third-party infrastructure and is out of scope).
- **MODELLED:** the cost-vs-cache-hit-rate curve — an illustrative planning model at
  \$0.05/hosted call (cache hit free). The formula is `requests × (1−hit) × \$0.05`.

## Regenerate everything

```bash
# 1. Isolated analysis environment (deps NEVER touch any runtime manifest):
python -m venv evidence/.venv
evidence/.venv/Scripts/python -m pip install -r evidence/requirements-analysis.txt

# 2. Diagrams (HTML + PNG):
evidence/.venv/Scripts/python evidence/scripts/generate_whole_system_diagram.py
evidence/.venv/Scripts/python evidence/scripts/generate_component_diagrams.py

# 3. Suite graphs (test counts + coverage):
evidence/.venv/Scripts/python evidence/scripts/generate_suite_graphs.py

# 4. Latency benchmark + cost curve (requires built TS dist in packages/*/dist):
evidence/.venv/Scripts/python evidence/scripts/benchmark_pipeline.py --samples 20000

# 5. Public-data validation + report:
node evidence/scripts/run_public_data_validation.mjs > evidence/data/validation_result.json
evidence/.venv/Scripts/python evidence/scripts/write_validation_report.py
```

The latency benchmark and the validation invoke `node` against the packages' built `dist/`
(run the workspace build first). Everything else is pure Python in the isolated venv.

## Scripts (all reproducible)

| Script | Output |
| --- | --- |
| `scripts/bw_diagram_toolkit.py` | shared monochrome SVG→PNG/HTML primitives |
| `scripts/generate_whole_system_diagram.py` | `diagrams/00_*` |
| `scripts/generate_component_diagrams.py` | `diagrams/01_*`…`06_*` |
| `scripts/evidence_data.py` | canonical test-count / coverage source of truth |
| `scripts/generate_suite_graphs.py` | `graphs/test_counts_*`, `graphs/coverage_*` |
| `scripts/measure_pipeline_latency.mjs` | MEASURED latency samples (Node → real TS dist) |
| `scripts/benchmark_pipeline.py` | `graphs/latency_*`, `graphs/cost_*`, `data/benchmark_metrics.json` |
| `scripts/run_public_data_validation.mjs` | `data/validation_result.json` |
| `scripts/write_validation_report.py` | `validation/validation-report.md` |
