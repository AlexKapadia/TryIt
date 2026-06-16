# TryIt — Open-Source Virtual Try-On for Retail

TryIt is an open-source virtual try-on platform for retail. Shoppers upload a photo and try on
products before they buy; retailers integrate via a hosted API, an embeddable widget, or by
self-hosting the stack. Try-on providers are pluggable behind a common contract, with built-in
caching and cost controls to keep inference spend predictable, and security and rate-limiting
enabled by default at every boundary.

## Monorepo Structure

The workspace is organised into apps, packages, and services (planned layout):

- `apps/api` — hosted try-on API service
- `apps/demo-shop` — reference storefront demonstrating the widget and SDK
- `packages/widget` — embeddable browser try-on widget
- `packages/sdk-node` — Node.js client SDK
- `packages/engine` — try-on orchestration engine and provider abstraction
- `packages/security` — shared security primitives (auth, rate limiting, validation)
- `packages/catalog-connectors` — retail catalog/product source connectors
- `packages/contracts` — shared typed data contracts (Zod schemas + inferred types)
- `packages/cache` — caching layer for inference results and cost control
- `services/inference-py` — Python inference microservice for try-on providers
- `infra` — infrastructure-as-code and deployment configuration
- `docs` — architecture, research, and design documentation
- `evidence` — statistical evidence, graphs, and flow diagrams
- `e2e` — end-to-end browser-driven test suites

## Status

Status: under active development (Gate 0 — bootstrap).

## Quickstart

```bash
pnpm install
pnpm test
```

## License

Released under the [MIT License](./LICENSE).
