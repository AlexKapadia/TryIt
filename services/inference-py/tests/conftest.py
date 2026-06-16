"""Shared pytest fixtures for the inference service tests.

Provides a FastAPI :class:`TestClient` (no real network) and small helpers to
build valid/invalid image references, so each test file states *what* it asserts
rather than re-deriving request payloads.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client() -> TestClient:
    """A TestClient bound to the app's default (mock) backend."""
    return TestClient(app)


def url_ref(url: str = "https://cdn.example.com/person.jpg") -> dict:
    """Build a valid HTTPS URL image reference payload."""
    return {"kind": "url", "url": url}


def base64_ref(
    mime_type: str = "image/png",
    raw: bytes = b"hello-tryit-mock-image-bytes",
) -> dict:
    """Build a valid inline base64 image reference payload."""
    return {
        "kind": "base64",
        "mimeType": mime_type,
        "data": base64.b64encode(raw).decode("ascii"),
    }
