# Mutation Testing

Mutation testing is the **acceptance signal** for the TryIt test suites (per `CLAUDE.md` §3.6):
a green, high-coverage suite proves lines _ran_, never that a _wrong answer would be caught_.
Stryker injects faults ("mutants") into the source and confirms the tests **kill** them. A
**surviving mutant** is a test gap — either a missing assertion or a genuinely equivalent mutant.

## Tooling

| Tool | Version |
| --- | --- |
| `@stryker-mutator/core` | 9.6.1 |
| `@stryker-mutator/vitest-runner` | 9.6.1 |
| `vitest` | 2.1.9 |

Stryker and the vitest runner are installed **once at the workspace root** (`pnpm -Dw`). Each
package's `stryker.conf.mjs` resolves the runner plugin by absolute path (pnpm does not symlink
root dev-deps into each package's local `node_modules`), uses `coverageAnalysis: 'perTest'`,
`concurrency: 4`, a 60s timeout, and mutates `src/**/*.ts` excluding `*.test.ts` and the
pure-barrel `index.ts` (and engine's `test_support/**`).

## How to run

```sh
pnpm --filter @tryit/contracts mutation
pnpm --filter @tryit/cache     mutation
pnpm --filter @tryit/engine    mutation
pnpm --filter @tryit/security  mutation
```

Each run writes a clear-text summary to the console plus `reports/mutation/mutation.html`
(browsable, per-mutant) and `reports/mutation/mutation.json`. The Stryker temp dir
`.stryker-tmp/` and the `reports/mutation/` output are **gitignored** (see root `.gitignore`),
so the artefacts are reproducible locally and never committed.

> "Mutation score" below is Stryker's score over **covered** mutants (killed + timeout) ÷
> (killed + timeout + survived), matching the per-file `% Mutation score (covered)` column.

## Per-package scores (before → after hardening)

| Package | Before | After | Killed by new tests | Notes |
| --- | ---: | ---: | --- | --- |
| `@tryit/security` | — | **92.46%** | — | Pre-existing (163 tests; not re-hardened in this pass). |
| `@tryit/contracts` | 85.03% | **86.39%** | 3 | `errors.ts` & `tenant.ts` already 100%. |
| `@tryit/cache` | 92.31% | **94.41%** | 6 | `result-cache.ts` 100%; `cache-key.ts` 64.3% → 85.7%. |
| `@tryit/engine` | 76.06% | **77.06%** | 5 | Router core hardened; `validate_provider_result.ts` & `image_ref_to_input.ts` 100%. |

The hardening pass focused on **security-/correctness-critical logic** (the modules `CLAUDE.md`
§3.6 calls out), not on chasing 100% across boilerplate provider-response mapping or
error-message strings.

### `@tryit/contracts`

New tests (3 mutants killed):

- **`images.ts` base64 alphabet `^` anchor** — without the start-anchor a hostile caller could
  prefix junk before a valid-base64 suffix and still match (SSRF/parser-confusion vector). Killed
  by a leading-junk payload that must fail closed. (`images-base64-anchor.mutation.test.ts`)
- **`tryon.ts` result-data-URL `^` anchor** — without it a `javascript:`-scheme prefix in front
  of a valid `data:image/...` tail would match. Killed by a scheme-injection payload.
  (`tryon-result-url-anchor.mutation.test.ts`)
- **`MAX_BASE64_DECODED_BYTES` arithmetic** — the existing boundary tests derive their payloads
  from the exported constant, so a mutation of `8 * 1024 * 1024` shifts the test boundary in
  lockstep and survives. Killed by asserting the exact literal `8388608`.
  (`images-size-constant.mutation.test.ts`)

### `@tryit/cache`

New tests (6 mutants killed) in `cache-key.mutation.test.ts`, all on the tenant-isolation guards
(threat T1), which the existing suite left alive because it only ever compared **full keys**
(prefix + digest) — a differing prefix masked a digest collision:

- **`hashField` length-prefix (`${bytes.length}:`)** — without it, the boundary between adjacent
  hashed fields can shift (`"ab"|"cZ"` vs `"a"|"bcZ"`) and the **digests collide**. Killed by
  comparing digests in isolation across an adjacent-field boundary shift.
- **`prefixSafe` percent-encoding of `:` and `%`** — without it, a tenant id containing `:`
  (e.g. `"a:b"`) yields a literal prefix segment `"a"`, colliding with tenant `"a"`'s namespace.
  Killed by asserting the exact escaped prefixes (`a%3Ab`, `a%253Ab`).

### `@tryit/engine`

New tests (5 mutants killed) across `router_ordering.mutation.test.ts` and
`router.mutation.test.ts`:

- **Priority tiebreak (`router_ordering.ts:66`)** — with cost tied, ordering must fall to
  `priority` asc. Killed by two equal-cost providers whose priorities differ.
- **Id tiebreak (`router_ordering.ts:70`)** — with cost AND priority tied, ordering must fall to
  provider id asc. Killed by two fully-tied providers listed in reverse-id order.
- **Latency arithmetic (`router.ts:140`, `now() - started`)** — a `-`→`+` mutant survived because
  no test pinned an exact non-zero latency. Killed with a stepping clock asserting the precise
  elapsed `latencyMs`.
- **Per-provider timeout resolution (`router.ts:183`, `candidate.timeoutMs ?? defaultTimeoutMs`)**
  — a `??`→`&&` mutant survived. Killed by a short per-provider timeout + long default and a
  hanging provider, asserting the short deadline fires.

## Documented equivalent / accepted mutants

These survive but are **genuinely equivalent** (no observable behaviour change) or unreachable by
construction — forcing a contrived/brittle test to "kill" them would add tautology, not rigour:

- **Custom error-message strings & `.refine(fn, { message })` option objects** (contracts: many
  `StringLiteral → ""` / `ObjectLiteral → {}` on Zod refinements; cache `RangeError`/`TypeError`
  message templates). Emptying the message changes only the human-readable error _text_;
  validation still fails/throws identically. Tests assert `.toThrow(ZodError/TypeError)`, not the
  message text (asserting exact prose would be brittle and tautological).
- **`z.enum([...])` option / `z.literal('url'|'base64')` discriminant string mutations** — extra
  keys are stripped and the discriminated union still resolves; behaviour is unchanged.
- **`contracts/images.ts:36` `decodedByteLength` `endsWith('==')` → `startsWith('==')`** — for any
  reachable base64 length the 1-byte delta this introduces never straddles the 8 MiB cap (the
  `==`-terminated lengths are spaced 3 bytes apart), so the size refinement's accept/reject
  outcome is identical. Equivalent.
- **`contracts/tryon.ts:79` empty `catch {}`** — the `catch` returns `false`; an emptied body
  returns `undefined`, which is falsy in the boolean-returning `isAcceptableResultImageUrl`, so
  the URL is rejected identically. Equivalent.
- **`cache/cache-key.ts:25` `KEY_DOMAIN = ''`** — mutating the domain-separation tag shifts every
  digest uniformly; no test pins an absolute digest, and pinning one would be brittle. The tag is
  defence-in-depth (collision-avoidance across SHA-256 uses), not a per-input correctness control.
- **`cache/canonical-json.ts:76` undefined-member guard (`if (v === undefined) throw`)** — when
  removed, `encode(undefined)` is reached and throws via the terminal "unsupported type" guard
  instead, so a `{a:1,b:undefined}` input still fails closed. Both paths reject; only the message
  differs. Equivalent for the fail-closed invariant.
- **`engine/router_ordering.ts:70` id-comparator `<` → `<=` and the `: 0` equal-id branch** —
  candidates are de-duplicated by id before sorting, so two candidates never share an id; the
  equality case is unreachable and `<`/`<=` are indistinguishable. Equivalent / unreachable.
- **Engine provider-adapter response-mapping survivors** (`fal.ts`, `replicate.ts`,
  `google-vto.ts`, `self-hosted.ts`, `deterministic_placeholder_svg.ts`) — lower-priority
  untrusted-response parsing whose output is re-validated at the router boundary by
  `validate_provider_result.ts` (100% killed). Out of scope for this correctness/security-critical
  pass; tracked for a later round.
