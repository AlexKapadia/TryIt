# North Star / CCO Alignment Review — Gate 0 (Bootstrap)

**Project:** TryIt — open-source virtual try-on for retail
**Scope:** Gate 0 baseline (monorepo scaffold + first `@tryit/contracts` package)
**Reviewer role:** Read-only senior overseer (claude.md §2, §4.7)
**Date:** 2026-06-16
**Branch:** `main` · **HEAD:** `b441a83 Gate 0: bootstrap pnpm+Turborepo monorepo`

Graded fairly against a *bootstrap* gate: later-gate items (engine, ML, evidence/, mutation runs, UI E2E, research library) are noted as "scheduled, on track" rather than penalised — but anything claimed-done that is actually missing or weak is flagged.

---

## Grades

| Area | Grade | Justification |
| --- | --- | --- |
| Security & compliance | **GREEN** | CI runs gitleaks (secret scan) + CodeQL SAST on a separate hardened job with least-privilege `permissions:` (top-level `contents: read`; `security-events: write` scoped only to the SAST job). `.gitignore` excludes `.env`/`.env.*`; no secrets or env files are tracked. The one code path is fail-closed by design — `parseTryOnRequest` parses untrusted input via Zod and throws on invalid data rather than passing partial objects downstream, with an inline comment naming the control. Tenant isolation is seeded via `tenantId` in the contract. Appropriate for a scaffold; dependency scanning (e.g. `pnpm audit`/Dependabot) and the threat-model doc are not yet present — acceptable now, see drift. |
| Structure / generality / no-graveyard | **GREEN** | Clean monorepo: `apps/* packages/* services/*` workspace globs, no dead code, no `_old`/`_v2` files, no junk-drawer names. All source files well under the 300-line limit (index.ts 60, test 103, vitest.config 16). The contract is general (no magic constants, open `params` bag, schema-derived types so static + runtime can't drift). `category` enum is intentionally `['apparel']` only for Gate 0 and documented as such — a scoped narrowing, not overfitting. |
| Test rigour incl. mutation discipline | **GREEN** | The 15-case suite has genuine teeth, not tautologies: explicit min-length boundary triples (empty / exactly-1-char / present), rejection of unsupported enum values for both `category` and `personImage.kind`, non-object/`null` inputs, default-application assertions, and a `safeParse` path-precision check (`issues[0].path === ['tenantId']`). Coverage gates wired at line 90 / branch 85 via `@vitest/coverage-v8`. Mutation testing is not yet run, but the toolchain is pre-provisioned (`.stryker-tmp/` in `.gitignore`) — correctly **scheduled for the hardening gate**, on track. |
| Git / branch hygiene | **GREEN** | `main` is clean with a working tree at zero diff; single coherent, well-scoped bootstrap commit with a gate-referencing message. `.gitignore` is correct and comprehensive (dist, coverage, .turbo, .next, playwright-report, tsbuildinfo, venv). Verified **no build artifacts, coverage, node_modules, or env files are tracked**. Lockfile committed for reproducible installs. |
| Decisions evidence-backed + iterate-loop | **GREEN (for a bootstrap)** | The gated plan is being followed: Gate 0 delivers exactly the scaffold + one typed-contract package, no premature engine/UI. Schema-first contract is the right CTO-style foundation (one source of truth for wire shapes). `docs/research/` is not yet populated — correct, since no method-selection decision is due until the engine gate; noted as pending-as-planned. No premature evidence claims made. |
| On track to production-grade quality | **GREEN** | Foundation is institution-grade for a bootstrap: TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `composite`, Turborepo task graph with `^build` deps, ESLint flat config (typescript-eslint recommended, unused-vars as error), Prettier/editorconfig, frozen-lockfile CI, MIT LICENSE. Module/function docstrings present and meaningful. Nothing is faked or stubbed-as-done. |

---

## Drift List (prioritised)

1. **(Watch — next gate)** No dependency vulnerability scanning in CI yet. claude.md §5.6 requires dependency scanning + SAST + DAST with build-fail on high/critical. SAST (CodeQL) is in; add `pnpm audit --audit-level=high` or Dependabot before the engine gate.
2. **(Watch — next gate)** Threat model at the §5.6-mandated path does not yet exist. Fine for a scaffold with one pure-validation function; must land by the Contracts/Design gate (Gate 1) since the architecture is being defined.
3. **(Minor)** README.md is a single title line — the monorepo map referenced in memory is not actually in the file. Low priority for Gate 0, but flesh out before any external/open-source visibility.
4. **(Track, not a defect)** Mutation testing (Stryker) and `docs/research/` are provisioned/planned but not yet exercised — correct sequencing; ensure they are actually run at the hardening and method-selection gates rather than deferred indefinitely.

---

## Verdict

All six areas **GREEN**. No RED items — nothing is stop-and-fix. The Gate 0 bootstrap is disciplined, secure-by-default, free of graveyard/overfit, with a real (non-trivial) test suite and a clean, green `main`. The drift items are all legitimately later-gate work; flag #1 and #2 to be closed by Gate 1 so they don't silently slip.

**Still on North Star? yes**
