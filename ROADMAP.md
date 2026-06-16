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
- [ ] **Gate 2 - Build** PENDING. Implement packages test-first: security,
  engine + providers, cache, catalog-connectors, inference-py, widget + sdk.
- [ ] **Gate 3 - Integrate** PENDING. Wire components end-to-end, build the
  demo-shop, add the live Playwright E2E suite, and catalog auto-connect.
- [ ] **Gate 4 - Harden / Ship** PENDING. Mutation testing, security scans,
  `evidence/` showcase (stats + PNG/HTML graphs + B&W flow diagrams),
  self-host compose + IaC, docs, public-data validation, release.

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
