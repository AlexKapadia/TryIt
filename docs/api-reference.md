# TryIt API Reference

Precise reference for the TryIt virtual try-on REST API. Every field, status code, and
error code below is drawn from the shared `@tryit/contracts` Zod schemas and the route
handlers in `apps/api`. Field names are exact.

- **Base path:** all endpoints are versioned under `/v1` (except the unversioned health probe at `/v1/health`).
- **Content type:** request and response bodies are `application/json`.
- **Auth:** `Authorization: Bearer <api-key>` on `POST /v1/tryons`. Other endpoints are unauthenticated (see each entry).
- **Transport:** HTTPS only for image URLs and remote results; plaintext, `data:`, and `file:` image URLs are rejected at the contract boundary.

---

## Authentication model

- **Bearer token.** Clients present `Authorization: Bearer <api-key>`. The token is parsed by
  `extractBearerToken`: a missing header, a non-`Bearer` scheme, or an empty token is refused
  with `UNAUTHORIZED` (401) before any body is read (fail-closed).
- **Hashed keys.** Keys are minted by `createApiKey` (`@tryit/security`). Only a per-key
  salted **scrypt** hash record is persisted; the plaintext is shown once. Verification
  (`verifyApiKey`) uses a constant-time comparison.
- **Tenant scoping.** A key is bound to one `tenantId`. The pipeline requires the key's tenant
  to equal the request's `tenantId` (tenant isolation) and the key to hold the `tryon` scope
  (least privilege). A key from another tenant, or without the scope, fails closed as `UNAUTHORIZED`.

---

## `POST /v1/tryons`

Create and run a try-on. Authenticates the key, runs the fail-closed pipeline, and returns the
terminal job synchronously.

- **Auth:** required (`Bearer`).
- **CORS:** supported; `OPTIONS` preflight returns 204.

### Request body — `TryOnRequest`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `tenantId` | string (min 1) | yes | Must match the key's tenant. |
| `shopperId` | string (min 1) | yes | End-user identifier; also the audited actor. |
| `personImage` | `ImageRef` | yes | The shopper photo (see ImageRef below). |
| `productId` | string (min 1) | yes | Resolves the garment when no explicit garment image is given. |
| `category` | `"apparel"` | no | Defaults to `apparel` (only supported category). |
| `params` | `TryOnParams` | no | Optional tuning (see below). |

**`TryOnParams`** (all optional): `seed` (integer), `garmentImage` (`ImageRef`),
`numSamples` (integer, 1–4).

**`ImageRef`** is a discriminated union on `kind`:

- `{ "kind": "url", "url": "https://..." }` — HTTPS only.
- `{ "kind": "base64", "mimeType": "image/jpeg" | "image/png" | "image/webp", "data": "<base64>" }` —
  decoded size bounded to 8 MiB.

### Response body — `TryOnJob` (200)

| Field | Type | Notes |
| --- | --- | --- |
| `jobId` | string | Unguessable UUID. |
| `status` | `queued \| processing \| succeeded \| failed` | Terminal `succeeded` on a synchronous success. |
| `request` | `TryOnRequest` | Echo of the validated request. |
| `result` | `TryOnResult` | Present on success. |
| `error` | string | Present on failure. |
| `createdAt` | string (ISO-8601) | |
| `updatedAt` | string (ISO-8601) | |
| `idempotencyKey` | string | Optional. |

**`TryOnResult`**: `resultImageUrl` (HTTPS URL or bounded inline image data URL),
`provider` (string), `latencyMs` (≥0), `cached` (boolean), `costUsd` (≥0).

### Status codes

`200` success · `400` `INVALID_INPUT` · `401` `UNAUTHORIZED` · `402` `BUDGET_EXCEEDED` ·
`413` `PAYLOAD_TOO_LARGE` · `429` `RATE_LIMITED` (with `Retry-After`) · `502` `PROVIDER_ERROR` ·
`503` `KILL_SWITCH_ENGAGED`. The error body is the `ApiError` shape `{ code, message, httpStatus }`.

---

## `GET /v1/tryons/:id`

Fetch a stored job by id.

- **Auth:** none (job ids are unguessable UUIDs; Gate-0 read is not further tenant-scoped).
- **CORS:** supported; `OPTIONS` preflight returns 204.
- **200:** the `TryOnJob`.
- **404:** `{ "error": "not_found", "message": "no job exists for that id" }` for an unknown id (fail-closed).

---

## `GET /v1/dev/credentials`

Dev-only helper that returns a working demo key.

- **Auth:** none, but **gated**: serves credentials only when `NODE_ENV !== 'production'` **or**
  `TRYIT_DEV_DEMO === '1'`.
- **200:** `{ "tenantId": "demo-tenant", "apiKey": "<plaintext>" }`.
- **404:** `{ "error": "not_found" }` when disabled, or when no demo plaintext is retained.

This endpoint must never be exposed in production. Issue production keys via `@tryit/security`'s
`createApiKey`.

---

## `GET /v1/health`

Liveness probe.

- **Auth:** none. No side effects.
- **200:** `{ "status": "ok" }`.

---

## ErrorCode → HTTP status

The mapping is total and exhaustive (`ERROR_CODE_HTTP_STATUS` in `@tryit/contracts`). An
unrecognised code resolves to **500** (`FAIL_CLOSED_HTTP_STATUS`) — never a 2xx/3xx.

| ErrorCode | HTTP | Meaning |
| --- | --- | --- |
| `INVALID_INPUT` | 400 | Malformed / invalid request body. |
| `UNAUTHORIZED` | 401 | Missing or invalid credentials. |
| `BUDGET_EXCEEDED` | 402 | Tenant monthly spend cap reached. |
| `PAYLOAD_TOO_LARGE` | 413 | Request / image exceeds size bounds. |
| `RATE_LIMITED` | 429 | Per-shopper or per-tenant rate limit hit. |
| `PROVIDER_ERROR` | 502 | Upstream image provider failed. |
| `KILL_SWITCH_ENGAGED` | 503 | Global or tenant kill switch halting calls. |
| *(unknown code)* | 500 | Fail-closed default. |

---

## Rate limiting

Two independent limits, both enforced per minute in the pipeline:

- **Per-shopper:** `perShopperPerMinute` (demo tenant: 30).
- **Per-tenant (aggregate):** `perTenantPerMinute` (demo tenant: 600).

A denied request returns `429 RATE_LIMITED` with a `Retry-After` header in seconds (ceil of the
limiter's `retryAfterMs`).

## CORS

Driven by `corsHeaders` from a `TRYIT_CORS_ORIGINS` allow-list (comma-separated). When no
allow-list is configured, the dev fallback is `*`. With an allow-list, only an exact origin
match is echoed back; any other origin receives `null` (fail-closed). Allowed methods:
`GET, POST, OPTIONS`. Allowed headers: `Authorization, Content-Type`. Responses set `Vary: Origin`.

## Budget / cost

Before a non-cached call, the pipeline sums the tenant's audited spend and rejects with
`402 BUDGET_EXCEEDED` if the next call's estimated cost would exceed `monthlyBudgetUsd`.
Cache hits carry `costUsd: 0` and are not billed.

## Async job lifecycle

Jobs move `queued → processing → succeeded | failed`. `POST /v1/tryons` runs the pipeline
synchronously and returns a terminal job; `succeeded` carries a `result`, `failed` carries an
`error`. Stored jobs are retrievable by id via `GET /v1/tryons/:id`. The lifecycle states are
fixed by `TryOnJobStatusSchema`, so clients (and the SDK's `waitForJob`) can poll for a terminal
status.
