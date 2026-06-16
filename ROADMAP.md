# TryIt Roadmap (durable resume anchor)

## North Star

TryIt is an open-source virtual try-on platform for retail. Shoppers upload a
photo and try on products; retailers consume it three ways - a hosted
multi-tenant API, an embeddable widget/SDK, or a self-hosted deployment. Try-on
generation runs through pluggable providers: fal.ai is the live default, with
Replicate, Google VTO, and a self-hosted backend stubbed behind the same
contract, plus a deterministic fallback that always returns a defensible result.
The platform uses content-addressed caching, per-tenant cost guards, and rate
limiting; security is fail-closed everywhere. It is apparel-first but
category-extensible. Stack: TypeScript (Next.js + Node) with a thin Python ML
service. Licence: MIT.

## Gates

- [x] **Gate 0 - Bootstrap** COMPLETE. Monorepo scaffolded and pushed (turbo +
  pnpm workspaces, CI skeleton, base TS config, this CLAUDE.md contract).
- [x] **Gate 1 - Contracts / Design** COMPLETE. Research library under
  `docs/research/` (5 papers + method survey + provider survey + decision:
  CatVTON method for self-host, Leffa MIT benchmark, fal.ai hosted default,
  caching as primary cost lever); full zod data contracts in
  `packages/contracts` (118 tests, 100% coverage); STRIDE `docs/threat-model.md`;
  UI design brief in `docs/design/`. Pushed.
- [x] **Gate 2 - Build** COMPLETE. All packages implemented test-first and
  green: security (auth/rate-limit/image-validation/audit), engine (router +
  5 provider adapters incl. deterministic fallback), cache (tenant-namespaced
  content-addressed), catalog-connectors (shopify + generic), sdk-node,
  widget (web component), inference-py (FastAPI, mock + Leffa stub). ~569
  adversarial/property-based tests; build+typecheck+lint+test all green. Pushed.
- [x] **Gate 3 - Integrate** COMPLETE. apps/api wires the full fail-closed
  pipeline (auth -> kill-switch -> validation -> rate-limit -> budget -> cache
  -> engine -> audit) over canonical `/v1/tryons` routes; apps/demo-shop
  (ATELIER storefront) embeds the widget SSR-safe; live Playwright E2E (17
  tests) drives the real browser through every flow + state and renders a real
  result image. build/typecheck/lint/test all green (turbo 16/16). Pushed.
- [x] **Gate 4 - Harden / Ship** COMPLETE. Mutation testing (Stryker) on the
  critical packages (security 92%, cache 94%, contracts 86%, engine 77%;
  survivors killed, equivalents documented); CI adds dependency audit + live
  E2E job; security hardening (authenticated + tenant-scoped job reads, server
  idempotency, drop-in embed loader); `evidence/` showcase (7 B&W flow diagrams
  + 4 stat graphs as PNG/HTML + measured latency + public-data validation);
  self-host Docker/compose + Terraform skeleton + guide; consumer docs
  (integration + API reference). build/typecheck/lint/test all green
  (turbo 16/16 incl E2E; python 48). Pushed.

## How to resume

1. Read `C:\dev\TryIt\claude.md` and this file in full.
2. From `git log` and the gate checkboxes above, find the next incomplete gate.
3. Continue autonomously exactly per claude.md - research-first, test-first with
   adversarial + mutation-tested suites, iterate to perfection.
4. Commit AND push at every gate; `main` stays always green and shippable.
5. Competing approaches live on `experiment/*` branches; only the
   evidence-backed winner merges to `main` (no graveyard).

## Branch policy

`main` is always clean and green; experiments on `experiment/<approach>`,
features on `feature/<name>`, fixes on `fix/<name>` - all pushed and visible.
