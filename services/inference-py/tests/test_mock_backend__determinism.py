"""Determinism tests for the mock backend.

The platform promises reproducible try-ons: identical
``(person, garment, num_samples, seed)`` inputs must yield byte-for-byte
identical output, and a changed seed (or input) must change the output. These
tests assert that property directly on the backend and through the HTTP layer,
over repeated runs, so any non-determinism would fail loudly.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.backends.mock import MockBackend
from app.schemas import Base64ImageRef, UrlImageRef
from tests.conftest import url_ref


def _person() -> UrlImageRef:
    return UrlImageRef(kind="url", url="https://cdn.example.com/person.jpg")


def _garment() -> UrlImageRef:
    return UrlImageRef(kind="url", url="https://cdn.example.com/garment.png")


def test_same_inputs_same_seed_are_byte_identical() -> None:
    """Repeated calls with the same inputs+seed return identical bytes."""
    backend = MockBackend()
    results = {
        backend.infer(_person(), _garment(), num_samples=1, seed=42)
        for _ in range(10)
    }
    assert len(results) == 1  # all 10 runs collapsed to one distinct output


def test_different_seed_changes_output() -> None:
    """Changing only the seed changes the deterministic output."""
    backend = MockBackend()
    a = backend.infer(_person(), _garment(), num_samples=1, seed=1)
    b = backend.infer(_person(), _garment(), num_samples=1, seed=2)
    assert a != b


def test_seed_none_differs_from_seed_zero() -> None:
    """``seed=None`` and ``seed=0`` are distinct inputs (no collision)."""
    backend = MockBackend()
    none_seed = backend.infer(_person(), _garment(), num_samples=1, seed=None)
    zero_seed = backend.infer(_person(), _garment(), num_samples=1, seed=0)
    assert none_seed != zero_seed


def test_different_garment_changes_output() -> None:
    """Swapping the garment changes the output for the same person+seed."""
    backend = MockBackend()
    a = backend.infer(_person(), _garment(), num_samples=1, seed=5)
    other = UrlImageRef(kind="url", url="https://cdn.example.com/other.webp")
    b = backend.infer(_person(), other, num_samples=1, seed=5)
    assert a != b


def test_base64_input_is_deterministic() -> None:
    """Inline base64 inputs are also deterministic across runs."""
    backend = MockBackend()
    person = Base64ImageRef(kind="base64", mimeType="image/png", data="QUJD")
    garment = Base64ImageRef(kind="base64", mimeType="image/jpeg", data="WFla")
    first = backend.infer(person, garment, num_samples=2, seed=9)
    second = backend.infer(person, garment, num_samples=2, seed=9)
    assert first == second


def test_http_layer_determinism_for_fixed_seed(client: TestClient) -> None:
    """End-to-end: the same request+seed returns the same result_image twice."""
    payload = {
        "personImage": url_ref("https://cdn.example.com/person.jpg"),
        "garmentImage": url_ref("https://cdn.example.com/garment.png"),
        "numSamples": 1,
        "seed": 1234,
    }
    first = client.post("/infer", json=payload).json()["result_image"]
    second = client.post("/infer", json=payload).json()["result_image"]
    assert first == second
