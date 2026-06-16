"""Tests for the inference service health probe.

Uses FastAPI's TestClient (no network) to assert `/healthz` returns 200 with the
expected OK payload. Placeholder coverage for the Gate 2 skeleton; the stubbed
`/infer` 501 behaviour and real model paths are tested in a later gate.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_returns_ok() -> None:
    """`/healthz` responds 200 with {"status": "ok"}."""
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
