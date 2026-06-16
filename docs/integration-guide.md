# TryIt Integration Guide

How a retailer adopts TryIt. There are three integration paths — pick the one that matches
your stack:

1. **[Hosted API](#1-hosted-api)** — call the REST API directly from any language.
2. **[Embeddable widget](#2-embeddable-widget)** — drop a `<tryit-widget>` tag into a product page.
3. **[Server SDK](#3-server-sdk-tryitsdk-node)** — a typed Node client (`@tryit/sdk-node`).

Plus [catalog auto-connect](#catalog-auto-connect) to ingest your product images, and notes on
[rate limits, budgets, and caching](#rate-limits-budget-and-caching).

See `api-reference.md` for the exact schemas and status codes referenced throughout.

---

## 1. Hosted API

### Get an API key

A TryIt key is a tenant-scoped bearer token. In **development**, fetch a working demo key from
the gated dev endpoint:

```bash
curl https://api.tryit.example/v1/dev/credentials
# -> { "tenantId": "demo-tenant", "apiKey": "<plaintext>" }
```

This endpoint is **dev-only** — it returns `404` in production unless `TRYIT_DEV_DEMO=1` is
explicitly set, and it never commits a key anywhere. For **production**, issue keys with
`@tryit/security`'s `createApiKey` (mints a tenant-scoped key, persists only a salted scrypt
hash, and returns the plaintext exactly once). Store the plaintext in your secret manager; it
cannot be recovered later.

### Create a try-on

`POST /v1/tryons` with a `Bearer` token. The call runs synchronously and returns a terminal job.

```bash
curl -X POST https://api.tryit.example/v1/tryons \
  -H "Authorization: Bearer $TRYIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "demo-tenant",
    "shopperId": "shopper-123",
    "productId": "sku-42",
    "personImage": { "kind": "url", "url": "https://cdn.example.com/shopper.jpg" },
    "params": { "numSamples": 1 }
  }'
```

`personImage` may instead be inline base64:
`{ "kind": "base64", "mimeType": "image/jpeg", "data": "<base64>" }` (decoded ≤ 8 MiB).

Success response (`TryOnJob`):

```json
{
  "jobId": "f1c2…",
  "status": "succeeded",
  "request": { "...": "echo of your validated request" },
  "result": {
    "resultImageUrl": "https://cdn.tryit.example/results/f1c2.png",
    "provider": "deterministic",
    "latencyMs": 412,
    "cached": false,
    "costUsd": 0.05
  },
  "createdAt": "2026-06-16T20:00:00.000Z",
  "updatedAt": "2026-06-16T20:00:00.000Z"
}
```

### Poll a job

```bash
curl https://api.tryit.example/v1/tryons/f1c2… \
  -H "Authorization: Bearer $TRYIT_API_KEY"
```

Returns the stored `TryOnJob`, or a `404 { "error": "not_found" }` for an unknown id. Poll until
`status` is `succeeded` or `failed`.

### Errors

Non-2xx responses use the `ApiError` shape `{ code, message, httpStatus }`. See the full
`ErrorCode → HTTP status` table in `api-reference.md`. Notable ones: `401 UNAUTHORIZED`,
`429 RATE_LIMITED` (with a `Retry-After` header), `402 BUDGET_EXCEEDED`, `413 PAYLOAD_TOO_LARGE`,
`502 PROVIDER_ERROR`, `503 KILL_SWITCH_ENGAGED`.

---

## 2. Embeddable widget

`@tryit/widget` ships a framework-free Web Component, `<tryit-widget>`. Importing the package's
main module auto-registers the element exactly once, so a single `<script>` include is enough.

The widget drives a privacy-first state machine: `idle → consent → upload → uploading →
processing → result | error`. No photo is uploaded before the shopper accepts consent.

### Events emitted to the host page

The widget dispatches bubbling, composed `CustomEvent`s:

| Event | `detail` | Fired when |
| --- | --- | --- |
| `tryit:result` | `{ resultUrl: string \| null }` | A result is rendered. |
| `tryit:error` | `{ code: ErrorCode }` | The widget enters its error state. |
| `tryit:addtocart` | `{ resultUrl: string \| null }` | The shopper clicks add-to-cart. |

> Note: `<tryit-widget>` does not currently read HTML attributes for configuration. API base
> URL, the publishable key, and network orchestration live in host glue (the browser API client
> `createApiClient` from `@tryit/widget`); the element exposes a `send(event)` method and a
> `currentState` getter for host integration. Wire the result of `createApiClient` into the
> element's `send()` to feed job outcomes, and listen for the events above.

### Minimal HTML snippet

```html
<script type="module" src="https://cdn.tryit.example/widget/index.js"></script>

<tryit-widget id="tryit"></tryit-widget>

<script type="module">
  const el = document.querySelector('#tryit');
  el.addEventListener('tryit:result', (e) => console.log('result:', e.detail.resultUrl));
  el.addEventListener('tryit:error', (e) => console.warn('error:', e.detail.code));
  el.addEventListener('tryit:addtocart', (e) => addToCart(e.detail.resultUrl));
</script>
```

### React / Next.js (SSR-safe)

The widget defines a custom element on import, which only works in the browser. Import it
dynamically so it never runs during server rendering:

```tsx
'use client';
import { useEffect, useRef } from 'react';

export function TryItWidget() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // Dynamic import: registers <tryit-widget> on the client only (SSR-safe).
    void import('@tryit/widget');
    const el = ref.current;
    const onResult = (e: Event) =>
      console.log('result', (e as CustomEvent).detail.resultUrl);
    el?.addEventListener('tryit:result', onResult);
    return () => el?.removeEventListener('tryit:result', onResult);
  }, []);

  // @ts-expect-error custom element
  return <tryit-widget ref={ref} />;
}
```

---

## 3. Server SDK (`@tryit/sdk-node`)

A typed, fail-closed Node client. Requests are validated against the contract before any byte
leaves the process; every response is parsed against its contract before being trusted. The API
key is sent only as a `Bearer` token and is never logged.

```ts
import { TryItClient } from '@tryit/sdk-node';

const client = new TryItClient({
  apiKey: process.env.TRYIT_API_KEY!, // from your secret manager
  baseUrl: 'https://api.tryit.example',
});

// Create a try-on (validated before sending).
const job = await client.createTryOn({
  tenantId: 'demo-tenant',
  shopperId: 'shopper-123',
  productId: 'sku-42',
  personImage: { kind: 'url', url: 'https://cdn.example.com/shopper.jpg' },
});

// Fetch a single job by id.
const fetched = await client.getJob(job.jobId);

// Or poll until terminal (succeeded/failed) or timeout.
const done = await client.waitForJob(job.jobId, { pollMs: 1000, timeoutMs: 30_000 });
```

Every failure is raised as a typed `ApiClientError` carrying `code`, `httpStatus`, and the full
`apiError` contract — branch on `error.code` (e.g. `RATE_LIMITED`, `BUDGET_EXCEEDED`). Transport
failures, unparseable bodies, and `waitForJob` timeouts surface fail-closed as `PROVIDER_ERROR`.

`waitForJob` validates its options (`pollMs` must be a positive integer; `timeoutMs` a
non-negative integer) and checks the deadline against an injectable clock, so it is deterministic
under test.

---

## Catalog auto-connect

`@tryit/catalog-connectors` ingests your product/garment images into one normalized shape
(`NormalizedProduct`: `id`, `title`, non-empty `imageRefs` (HTTPS), optional `price`,
`currency`, `vendor`, `category` defaulting to `apparel`). Malformed records are skipped and
recorded on `connector.skipped`, never thrown.

### Shopify

```ts
import { ShopifyConnector } from '@tryit/catalog-connectors';

const connector = new ShopifyConnector({
  shop: 'demo.myshopify.com',
  token: process.env.SHOPIFY_ADMIN_TOKEN!,
  fetch, // inject your fetch
});

for await (const product of connector.listProducts({ limit: 500 })) {
  // product.imageRefs are HTTPS garment images ready for try-on
}
```

Streams every product across pages (follows the `Link: …; rel="next"` cursor); a non-2xx page
halts pagination and yields nothing further (fail-closed).

### Generic REST

For any bespoke JSON feed, map dot-paths to the normalized fields:

```ts
import { GenericRestConnector } from '@tryit/catalog-connectors';

const connector = new GenericRestConnector({
  url: 'https://shop.example.com/api/products.json',
  fetch,
  mapping: {
    itemsPath: 'data.products', // empty = root array
    idPath: 'sku',
    titlePath: 'name',
    imagePath: 'images',        // single string or array of strings
    pricePath: 'price.amount',
    currencyPath: 'price.currency',
  },
});

const products = await connector.listProducts({ limit: 1000 });
```

---

## Rate limits, budget, and caching

- **Rate limits.** Two per-minute limits are enforced together: per-shopper (`perShopperPerMinute`)
  and per-tenant aggregate (`perTenantPerMinute`). The demo tenant uses 30 / 600. Exceeding either
  returns `429 RATE_LIMITED` with a `Retry-After` header (seconds) — back off and retry.
- **Budget.** Each tenant has a `monthlyBudgetUsd` cap (demo: 100). Before a non-cached call the
  pipeline sums audited spend; if the next call would exceed the cap it returns `402 BUDGET_EXCEEDED`.
- **Caching makes repeat try-ons free.** Results are cached on a tenant-namespaced key derived
  from the person image content, `productId`, and `params`. A cache hit returns the stored result
  with `cached: true` and `costUsd: 0` — it does **not** call a provider and does **not** count
  against the budget. So the same shopper photo + product + params combination is free on every
  repeat.
