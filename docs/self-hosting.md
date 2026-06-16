# Self-hosting TryIt

Run the whole TryIt stack — API, self-hosted try-on inference, and Redis — in
your own cloud or on a single box. Everything is containerised; the only hard
dependency is Docker.

> **What you get:** a self-contained virtual try-on service. The default image
> ships a torch-free **mock** inference backend so the stack boots and is fully
> exercisable with zero GPU. Swap in the GPU/model image when you want real
> generated try-ons (see [Enabling the GPU/model image](#enabling-the-gpumodel-inference-image)).

---

## 1. Prerequisites

- **Docker Engine 24+** with the **Compose v2** plugin (`docker compose version`).
- ~2 GB RAM for the default (mock) stack. The GPU/model image needs a CUDA GPU.
- Ports **3001** (API) and, optionally, **3002** (demo shop) free on the host.
- The repository checked out locally (build contexts are the repo root).

No Node, pnpm, or Python toolchain is required on the host — the multi-stage
Dockerfiles build everything inside the images.

---

## 2. Configure

Copy the example environment file to the repo root and edit it:

```bash
cp infra/.env.example .env
```

Every variable, its default, and what it does is documented inline in
[`infra/.env.example`](../infra/.env.example). The safe defaults run a
self-host-only, production-posture stack. The ones you are most likely to touch:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` disables the dev credential endpoint. |
| `TRYIT_KILL_SWITCH` | `0` | Set `1` to halt all external try-on calls (fail-closed). |
| `TRYIT_DEV_DEMO` | `0` | Set `1` (non-prod only) to expose `/v1/dev/credentials`. |
| `FAL_KEY` | _(empty)_ | Optional hosted-provider key; leave empty for self-host only. |
| `TRYIT_CORS_ORIGINS` | _(empty)_ | Comma-separated browser origins allowed to call the API. |
| `TRYIT_INFER_BACKEND` | `mock` | `mock` (torch-free) or `leffa` (needs the GPU image). |

> Never commit your `.env`. It is git-ignored. In production, inject secrets
> (e.g. `FAL_KEY`) from a secret manager, not from a file on disk.

---

## 3. Run

From the repo root:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up --build
```

This starts three services on a private network:

- **`api`** — the public API on `http://localhost:3001`
- **`inference`** — the FastAPI try-on service (private; reached only by the API)
- **`redis`** — the rate-limit / cache backing store (private)

The API waits for `redis` and `inference` to report healthy before it starts.

To also run the optional storefront:

```bash
docker compose -f infra/docker-compose.yml --env-file .env --profile demo up --build
```

…then open `http://localhost:3002`.

Validate the config without starting anything:

```bash
docker compose -f infra/docker-compose.yml config
```

---

## 4. Verify it works

### a. Health

```bash
curl http://localhost:3001/v1/health
# -> {"status":"ok"}
```

### b. Get a demo credential (development only)

The dev credential endpoint is **disabled in production** (fail-closed). To try
the full flow locally, set `NODE_ENV=development` and `TRYIT_DEV_DEMO=1` in your
`.env`, restart, then:

```bash
curl http://localhost:3001/v1/dev/credentials
# -> {"tenantId":"<demo-tenant>","apiKey":"<demo-key>"}
```

In production you instead provision real tenant API keys through your own
onboarding flow and pass them as `Authorization: Bearer <key>`.

### c. Submit a try-on

Try-ons are **asynchronous**: `POST /v1/tryons` creates a job, then you poll
`GET /v1/tryons/{jobId}` until it reaches `succeeded` or `failed`.

```bash
# Create a job (personImage can be a URL or base64 image ref):
curl -X POST http://localhost:3001/v1/tryons \
  -H "Authorization: Bearer <apiKey>" \
  -H "Content-Type: application/json" \
  -d '{
        "tenantId": "<demo-tenant>",
        "shopperId": "shopper-123",
        "productId": "product-abc",
        "personImage": { "kind": "url", "url": "https://example.com/me.jpg" }
      }'
# -> { "jobId": "...", "status": "queued", ... }

# Poll for the result:
curl http://localhost:3001/v1/tryons/<jobId> \
  -H "Authorization: Bearer <apiKey>"
# -> status transitions queued -> processing -> succeeded, with a result image
```

With the default **mock** backend the result is a deterministic placeholder —
proving the end-to-end path without a GPU.

---

## 5. Enabling the GPU/model inference image

The default inference image is intentionally **torch-free**. To run real
generated try-ons you build the heavier model image (installs `torch` +
`diffusers` via the `model` extra) and run it on GPU-capable hardware.

1. Build with the `model` extra. In your `.env`:

   ```bash
   INFERENCE_EXTRAS=model
   TRYIT_INFER_BACKEND=leffa
   ```

   then rebuild: `docker compose -f infra/docker-compose.yml --env-file .env build inference`.

2. For real GPU serving you will typically also:
   - swap the inference image's base to a CUDA runtime (see the comments at the
     top of [`services/inference-py/Dockerfile`](../services/inference-py/Dockerfile)),
   - run the container with GPU access (`--gpus all` / a GPU-capable task),
   - provision GPU-backed capacity in your cloud.

The mock and model images expose the **same** `/healthz` and `/infer` contract,
so nothing else in the stack changes.

---

## 6. Scaling notes

- **Stateless API, scale horizontally.** The API holds no per-request state, so
  you can run many replicas behind a load balancer. The wired `REDIS_URL` lets
  rate-limiting and caching share state across replicas (the code uses an
  in-memory store today and is designed to adopt Redis without redeploys).
- **Redis-backed rate-limit / cache.** Point `REDIS_URL` at a managed Redis
  (e.g. ElastiCache) so limits and cached results are consistent fleet-wide.
- **Async job model.** Try-ons are jobs (`queued → processing → succeeded/failed`),
  so the API responds fast and inference scales independently. Scale `inference`
  replicas to your try-on throughput; scale `api` to your request rate.
- **Cloud mapping.** [`infra/terraform/`](../infra/terraform/) is a skeleton that
  maps this compose stack onto AWS (ECS/Fargate + ALB + ElastiCache Redis).

---

## 7. Security checklist

- [ ] **`NODE_ENV=production`** — disables the dev credential endpoint (fail-closed).
- [ ] **`TRYIT_DEV_DEMO=0`** in production (belt-and-braces with `NODE_ENV`).
- [ ] **`FAL_KEY` via a secret manager**, never committed or logged. Leave empty
      if running self-host only.
- [ ] **`TRYIT_CORS_ORIGINS`** restricted to your real storefront origins
      (empty = deny cross-origin browser access).
- [ ] **Kill-switch ready:** flipping `TRYIT_KILL_SWITCH=1` halts all external
      try-on calls instantly.
- [ ] **TLS in transit:** terminate HTTPS at your load balancer; only expose the
      API publicly — keep `inference` and `redis` on the private network.
- [ ] **Pin images to digests** (not `:latest`) and run as the built-in non-root
      users (the images already do this).
- [ ] **Enable Redis AUTH + encryption** in transit and at rest in production.

---

## 8. Data residency & privacy

- **Self-hosted by design.** With the self-host inference path, shopper selfies
  are processed entirely **within your own infrastructure** — they never leave
  your network or go to a third-party provider (unless you opt into a hosted
  provider by setting `FAL_KEY`).
- **Process-then-purge.** Selfies are used to generate the try-on result and are
  not retained as long-lived storage by the service. Treat any inbound image as
  untrusted and short-lived.
- **No real PII in tests or validation.** The stack ships with synthetic fixtures
  only; keep real shopper data out of any test or demo run.
- **Audit trail.** Sensitive actions are recorded to an append-only audit log so
  you can demonstrate what was processed, when, and for whom.

You choose the region and provider, so data residency is entirely under your
control — run the whole stack in the jurisdiction your compliance requires.
