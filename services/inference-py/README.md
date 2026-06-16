# tryit-inference

Self-hosted virtual try-on inference service for the TryIt platform. This is the
**self-hosted CatVTON/Leffa inference path** described in
[`docs/research/decision.md`](../../docs/research/decision.md) — the open-weights
alternative to hosted try-on providers (e.g. the fal.ai adapter in
`@tryit/engine`).

## Status

Gate 2 skeleton. The FastAPI app exposes:

- `GET /healthz` — liveness probe, returns `{"status": "ok"}`.
- `POST /infer` — **stub**; fails closed with `501 Not Implemented` until the
  CatVTON/Leffa model is wired in a later gate.

No model weights, GPU code, or real inference logic exist yet.

## Layout

```
app/__init__.py   package docstring
app/main.py       FastAPI app (healthz + stubbed infer)
tests/test_health.py  TestClient smoke test for /healthz
pyproject.toml    deps (fastapi, uvicorn, pydantic, pillow); extras: model, dev
```

## Dependencies

Runtime deps install with the base project. The heavy model stack
(`torch`, `diffusers`) lives under the optional `model` extra so the service can
be installed and health-checked without pulling GPU dependencies:

```bash
pip install -e .            # base service
pip install -e ".[model]"   # + torch/diffusers (model serving)
pip install -e ".[dev]"     # + pytest/httpx (tests)
```

## Run (later, once a model is wired)

```bash
uvicorn app.main:app --reload
```

> Not part of the pnpm workspace — this is a standalone Python service.
