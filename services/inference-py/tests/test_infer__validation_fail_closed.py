"""Adversarial validation tests for ``POST /infer`` — boundary, fail-closed.

These mirror the TypeScript contract's fail-closed guarantees: non-HTTPS URLs,
disallowed MIME types, malformed base64, out-of-range ``numSamples``, oversize
images, and shape confusion must all be rejected with 422 (or 413) and never
flow downstream. Each assertion sits on / just-over / just-under a boundary so a
weakened validator would visibly fail.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

from app.schemas import MAX_BASE64_DECODED_BYTES
from tests.conftest import base64_ref, url_ref


def _post(client: TestClient, person: dict, garment: dict, **extra) -> int:
    """POST a request and return only the status code."""
    body = {"personImage": person, "garmentImage": garment, **extra}
    return client.post("/infer", json=body).status_code


@pytest.mark.parametrize(
    "bad_url",
    [
        "http://cdn.example.com/p.jpg",   # plaintext: rejected
        "ftp://cdn.example.com/p.jpg",    # wrong scheme
        "file:///etc/passwd",             # SSRF / local file vector
        "data:image/png;base64,AAAA",     # data: vector
        "https://",                       # malformed (no host)
        "not-a-url",                      # junk
    ],
)
def test_non_https_or_malformed_url_is_422(client: TestClient, bad_url: str) -> None:
    """Any non-HTTPS or malformed URL fails closed with 422."""
    assert _post(client, url_ref(bad_url), url_ref()) == 422


@pytest.mark.parametrize(
    "bad_mime",
    ["image/gif", "image/svg+xml", "application/pdf", "text/plain", "image/tiff", ""],
)
def test_disallowed_mime_is_422(client: TestClient, bad_mime: str) -> None:
    """A MIME type outside the jpeg/png/webp allow-list fails closed with 422."""
    assert _post(client, base64_ref(mime_type=bad_mime), url_ref()) == 422


@pytest.mark.parametrize("bad_data", ["", "not base64!!!", "@@@@", "AAA A"])
def test_malformed_base64_is_422(client: TestClient, bad_data: str) -> None:
    """Junk / non-base64 payloads fail closed with 422."""
    person = {"kind": "base64", "mimeType": "image/png", "data": bad_data}
    assert _post(client, person, url_ref()) == 422


@pytest.mark.parametrize("num_samples", [0, -1, 5, 100])
def test_num_samples_out_of_range_is_422(client: TestClient, num_samples: int) -> None:
    """``numSamples`` outside 1..4 (incl. 0 and 5) fails closed with 422."""
    assert _post(client, url_ref(), url_ref(), numSamples=num_samples) == 422


@pytest.mark.parametrize("num_samples", [1, 2, 3, 4])
def test_num_samples_in_range_is_accepted(client: TestClient, num_samples: int) -> None:
    """Boundary values 1 and 4 (and 2,3) are accepted — proves the edges are open."""
    assert _post(client, url_ref(), url_ref(), numSamples=num_samples) == 200


def test_oversize_base64_image_is_rejected(client: TestClient) -> None:
    """An inline image whose decoded size exceeds the bound fails closed (422/413)."""
    # One base64 char over the 8 MiB decoded bound. 4 base64 chars -> 3 bytes,
    # so this comfortably exceeds MAX_BASE64_DECODED_BYTES.
    oversize_chars = (MAX_BASE64_DECODED_BYTES // 3 + 16) * 4
    person = {"kind": "base64", "mimeType": "image/png", "data": "A" * oversize_chars}
    assert _post(client, person, url_ref()) in (413, 422)


def test_at_limit_base64_image_is_accepted(client: TestClient) -> None:
    """An inline image exactly at the decoded-size bound is accepted (open edge)."""
    raw = b"\x00" * MAX_BASE64_DECODED_BYTES
    at_limit = base64.b64encode(raw).decode("ascii")
    person = {"kind": "base64", "mimeType": "image/png", "data": at_limit}
    assert _post(client, person, url_ref()) == 200


def test_missing_garment_is_422(client: TestClient) -> None:
    """A request missing the required garment image fails closed with 422."""
    status = client.post("/infer", json={"personImage": url_ref()}).status_code
    assert status == 422


def test_shape_confusion_url_with_base64_fields_is_422(client: TestClient) -> None:
    """A discriminator mismatch (kind=url but base64 fields) is rejected."""
    confused = {"kind": "url", "mimeType": "image/png", "data": "AAAA"}
    assert _post(client, confused, url_ref()) == 422


def test_empty_body_is_422(client: TestClient) -> None:
    """An empty JSON body fails closed with 422."""
    assert client.post("/infer", json={}).status_code == 422
