"""Backend selection and failure-mode tests (fail-closed paths).

Cover the factory's closed mapping (unknown backend is refused), the leffa
stub's refusal when the model extra is absent, and the HTTP layer mapping a
backend failure to a typed 500 — so the service never silently degrades.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.backends.base import Backend, BackendError
from app.backends.leffa import LeffaBackend
from app.backends.mock import MockBackend
from app.config import Settings
from app.factory import build_backend
from app.schemas import ErrorResponse, InferRequest, InferResponse, UrlImageRef
from tests.conftest import url_ref


def test_factory_default_is_mock() -> None:
    """The default settings select the torch-free mock backend."""
    backend = build_backend(Settings())
    assert isinstance(backend, MockBackend)
    assert backend.name == "mock"


def test_factory_selects_leffa_by_name() -> None:
    """An explicit ``leffa`` setting constructs the LeffaBackend (import-safe)."""
    backend = build_backend(Settings(backend="leffa"))
    assert isinstance(backend, LeffaBackend)


def test_factory_unknown_backend_fails_closed() -> None:
    """An unknown backend name raises rather than defaulting to something."""
    with pytest.raises(ValueError):
        build_backend(Settings(backend="totally-made-up"))


def test_leffa_without_model_extra_fails_closed() -> None:
    """The leffa stub refuses (BackendError) when torch/diffusers is absent.

    The test environment installs only base+dev extras, so this exercises the
    real ImportError -> BackendError fail-closed path (no torch in CI).
    """
    backend = LeffaBackend()
    person = UrlImageRef(kind="url", url="https://cdn.example.com/p.jpg")
    garment = UrlImageRef(kind="url", url="https://cdn.example.com/g.jpg")
    with pytest.raises(BackendError):
        backend.infer(person, garment, num_samples=1, seed=None)


def test_http_layer_maps_backend_error_to_typed_500() -> None:
    """A backend that raises BackendError surfaces as a typed 500 envelope."""

    class _FailingBackend:
        name = "failing"

        def infer(self, person, garment, num_samples, seed) -> str:
            raise BackendError("boom")

    # Build a tiny app wired to the failing backend, mirroring main.infer.
    failing: Backend = _FailingBackend()
    app = FastAPI()

    @app.post("/infer")
    def infer(request: InferRequest) -> JSONResponse:
        try:
            image = failing.infer(
                request.person_image, request.garment_image, request.num_samples, request.seed
            )
        except BackendError as exc:
            return JSONResponse(
                status_code=500,
                content=ErrorResponse(error="inference_failed", detail=str(exc)).model_dump(),
            )
        return JSONResponse(
            status_code=200,
            content=InferResponse(result_image=image, provider=failing.name, latency_ms=0).model_dump(),
        )

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/infer", json={"personImage": url_ref(), "garmentImage": url_ref()}
    )
    assert response.status_code == 500
    body = response.json()
    assert body["error"] == "inference_failed"
    assert "boom" in body["detail"]
