# TryIt — Open-Source Virtual Try-On for Retail

**TryIt** is an open-source platform any retail shop can adopt so shoppers can **upload a photo of themselves and try on products** before buying. Retailers consume it however suits them — call the **hosted multi-tenant API**, drop in the **embeddable widget/SDK**, or **self-host** the whole stack in their own cloud. It auto-connects to a store's product catalog, is **secure and rate-limited by default**, and is engineered to scale to millions of try-ons a day with **controlled cost**.

> **Status:** under active development — **Gate 0 (bootstrap) complete**. See [`ROADMAP.md`](./ROADMAP.md) for the gated build plan and current state.

## Why TryIt

- **Pluggable try-on engine.** One `TryOnProvider` interface, swappable behind config: a hosted AI provider (**fal.ai** is the live default), other hosted providers (Replicate, Google Virtual Try-On) as drop-in adapters, and a **self-hosted open-model** path (IDM-VTON / CatVTON class) — plus a deterministic fallback so the UX degrades gracefully, never hard-fails.
- **Built for scale and cost.** Content-addressed **result caching** (the biggest cost lever at volume), per-tenant + per-shopper **rate limiting & quotas**, an async job model for heavy inference, provider routing by cost/latency, and a hard **per-tenant budget guard + global kill-switch**.
- **Secure by default, fail-closed.** Per-tenant API keys (hashed at rest), input validation + image re-encode at every boundary, an abuse/WAF layer, signed expiring result URLs, an append-only audit log, and selfies treated as sensitive PII (process-then-purge, encryption in transit + at rest).
- **Apparel-first, category-extensible.** Garment try-on now; a category-plugin architecture so eyewear, makeup, and footwear attach later as modules.

## Monorepo structure

```
apps/
  api/                 # multi-tenant try-on API + admin (Next.js route handlers)
  demo-shop/           # reference storefront proving the widget end-to-end
packages/
  widget/              # embeddable web component (<script> drop-in) + JS SDK
  sdk-node/            # typed server SDK for retailer backends
  engine/              # provider abstraction (TryOnProvider) + routing
    providers/         # fal, replicate, google-vto, self-hosted, deterministic
  security/            # auth, rate-limit, abuse/WAF, input validation, audit log
  catalog-connectors/  # Shopify + generic REST product-image ingestion
  contracts/           # zod schemas — the typed data contracts shared by all stages
  cache/               # content-addressed try-on result cache
services/
  inference-py/        # FastAPI wrapper around an open try-on model (self-host path)
infra/                 # Dockerfiles, docker-compose, IaC, heartbeats/watchdog
docs/                  # research/, design/, threat-model, operations/, alignment/
evidence/              # stats, PNG + interactive HTML graphs, B/W flow diagrams
e2e/                   # Playwright live-browser end-to-end suite
```

## Quickstart

```bash
pnpm install          # install the workspace (pnpm 10, node 22)
pnpm test             # run the full test suite via Turborepo
pnpm typecheck        # strict TypeScript across all packages
pnpm lint             # ESLint (flat config)
```

## Tech stack

TypeScript / Next.js + Node for the UI, API, and security layer; a thin **Python** (FastAPI) service only where ML inference needs it. Monorepo managed with **pnpm + Turborepo**.

## Contributing & operations

- Build plan and gate status: [`ROADMAP.md`](./ROADMAP.md)
- Autonomous-build heartbeats (auto-resume watchdog, North Star alignment, design beat): [`docs/operations/heartbeats.md`](./docs/operations/heartbeats.md)
- Alignment reviews: [`docs/alignment/`](./docs/alignment/)

## License

[MIT](./LICENSE) © 2026 Alexander Kapadia (AlexKapadia)
