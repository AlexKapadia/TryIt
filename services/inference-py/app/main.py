"""FastAPI application for the TryIt self-hosted inference service.

Exposes a liveness probe (``GET /healthz``) and the try-on inference endpoint
(``POST /infer``). This is the self-hosted CatVTON/Leffa path described in
``docs/research/decision.md`` — the open-weights alternative to hosted try-on
providers in ``@tryit/engine``.

All external input is treated as untrusted and validated at the boundary by the
pydantic schemas in :mod:`app.schemas` (FastAPI returns 422 on bad input). The
backend is pluggable (:mod:`app.factory`); the default is the torch-free,
deterministic ``mock`` backend so the service runs without a GPU. Backend
failures fail closed as a typed 500 — never a leaked stack trace or partial
result.
"""

from __future__ import annotations

import time

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.backends.base import Backend, BackendError
from app.config import load_settings
from app.factory import build_backend
from app.schemas import ErrorResponse, InferRequest, InferResponse

app = FastAPI(title="tryit-inference", version="0.1.0")

# Built once at import time from the environment. The selected backend is the
# safe ``mock`` default unless TRYIT_INFER_BACKEND is set.
_settings = load_settings()
_backend: Backend = build_backend(_settings)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness probe: returns a fixed OK payload for orchestrator health checks."""
    return {"status": "ok"}


@app.post("/infer", response_model=InferResponse)
def infer(request: InferRequest) -> JSONResponse:
    """Validate the request, run the configured backend, return the result.

    FastAPI validates ``request`` against :class:`InferRequest` before this body
    runs (422 on invalid input — fail-closed). A backend failure is caught and
    surfaced as a typed 500 so no internal detail leaks to the caller.
    """
    started = time.perf_counter()
    try:
        result_image = _backend.infer(
            person=request.person_image,
            garment=request.garment_image,
            num_samples=request.num_samples,
            seed=request.seed,
        )
    except BackendError as exc:
        # fail-closed: a backend failure yields a typed 500, not a partial result.
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(error="inference_failed", detail=str(exc)).model_dump(),
        )

    latency_ms = int((time.perf_counter() - started) * 1000)
    payload = InferResponse(
        result_image=result_image,
        provider=_backend.name,
        latency_ms=latency_ms,
    )
    return JSONResponse(status_code=200, content=payload.model_dump())
