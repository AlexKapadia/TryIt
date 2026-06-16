"""Happy-path tests for ``POST /infer`` against the default mock backend.

Assert that a well-formed request returns 200 with a usable result image, the
``mock`` provider name, and a non-negative latency — the core success contract
the rest of the platform relies on.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import base64_ref, url_ref


def test_infer_url_request_returns_mock_result(client: TestClient) -> None:
    """A URL person + garment yields 200 with a data-url result from ``mock``."""
    response = client.post(
        "/infer",
        json={
            "personImage": url_ref("https://cdn.example.com/person.jpg"),
            "garmentImage": url_ref("https://cdn.example.com/garment.png"),
            "numSamples": 1,
            "seed": 7,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "mock"
    assert body["result_image"].startswith("data:image/png;base64,")
    assert isinstance(body["latency_ms"], int) and body["latency_ms"] >= 0


def test_infer_base64_request_returns_mock_result(client: TestClient) -> None:
    """An inline base64 person + garment also produces a 200 mock result."""
    response = client.post(
        "/infer",
        json={
            "personImage": base64_ref("image/jpeg"),
            "garmentImage": base64_ref("image/webp"),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "mock"
    assert body["result_image"].startswith("data:image/png;base64,")


def test_infer_defaults_num_samples_to_one(client: TestClient) -> None:
    """``numSamples`` is optional and defaults to 1 (request still succeeds)."""
    response = client.post(
        "/infer",
        json={
            "personImage": url_ref(),
            "garmentImage": url_ref("https://cdn.example.com/garment.webp"),
        },
    )
    assert response.status_code == 200
