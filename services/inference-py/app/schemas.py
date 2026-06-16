"""Wire-level request/response schemas for the TryIt inference service.

These pydantic models mirror the TypeScript contract in
``packages/contracts/src/images.ts`` and ``tryon.ts`` so the Python self-hosted
inference path enforces the *same* fail-closed boundary as the rest of the
platform: HTTPS-only image URLs (no ``http``/``data``/``file`` SSRF vectors), a
narrow base64 MIME allow-list, and a decoded-size bound so a hostile caller
cannot exhaust memory with a giant blob. Anything that does not match these
shapes is rejected (FastAPI surfaces a 422), never coerced.
"""

from __future__ import annotations

import re
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

# Raster formats the try-on backends can actually consume. Mirrors
# ALLOWED_IMAGE_MIME_TYPES in the TS contract — kept deliberately narrow.
ALLOWED_IMAGE_MIME_TYPES = ("image/jpeg", "image/png", "image/webp")

# Maximum *decoded* size of an inline base64 image (8 MiB). Mirrors
# MAX_BASE64_DECODED_BYTES; bounds memory use regardless of base64 padding.
MAX_BASE64_DECODED_BYTES = 8 * 1024 * 1024

# Strict-ish base64 alphabet (with optional '=' padding). Guards against junk.
_BASE64_PATTERN = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")


def decoded_byte_length(base64_str: str) -> int:
    """Estimate decoded byte length of a base64 string without allocating it.

    Each 4 base64 chars encode 3 bytes; trailing ``=`` padding reduces the
    final group. Mirrors ``decodedByteLength`` in the TS contract.
    """
    if base64_str.endswith("=="):
        padding = 2
    elif base64_str.endswith("="):
        padding = 1
    else:
        padding = 0
    return (len(base64_str) * 3) // 4 - padding


class UrlImageRef(BaseModel):
    """A remotely-hosted image referenced by an HTTPS URL."""

    kind: Literal["url"]
    url: str

    @field_validator("url")
    @classmethod
    def _https_only(cls, value: str) -> str:
        # fail-closed: only HTTPS is accepted; http/data/file URLs are rejected
        # to block SSRF and plaintext fetches.
        if not value.startswith("https://"):
            raise ValueError("image url must use https")
        # A minimal well-formedness check: scheme + non-empty host.
        if len(value) <= len("https://"):
            raise ValueError("image url is malformed")
        return value


class Base64ImageRef(BaseModel):
    """An inline image carried as base64 bytes plus its declared MIME type."""

    kind: Literal["base64"]
    mime_type: Literal["image/jpeg", "image/png", "image/webp"] = Field(
        ..., alias="mimeType"
    )
    data: str = Field(..., min_length=1)

    model_config = {"populate_by_name": True}

    @field_validator("data")
    @classmethod
    def _valid_bounded_base64(cls, value: str) -> str:
        # fail-closed: refuse anything that is not allow-listed base64...
        if not _BASE64_PATTERN.match(value):
            raise ValueError("data must be valid base64")
        # ...and bound the decoded size so a giant blob cannot exhaust memory.
        if decoded_byte_length(value) > MAX_BASE64_DECODED_BYTES:
            raise ValueError("image exceeds maximum allowed size")
        return value


# Discriminated on ``kind`` so invalid combinations (a URL with base64 fields,
# or vice versa) are caught at the boundary rather than coerced.
ImageRef = Annotated[
    Union[UrlImageRef, Base64ImageRef],
    Field(discriminator="kind"),
]


class InferRequest(BaseModel):
    """A request to generate a virtual try-on for one person + one garment."""

    person_image: ImageRef = Field(..., alias="personImage")
    garment_image: ImageRef = Field(..., alias="garmentImage")
    # Bound the fan-out: 1..4 samples. Prevents a caller exhausting quota.
    num_samples: int = Field(default=1, ge=1, le=4, alias="numSamples")
    # Deterministic seed for reproducible generations; any int (or none).
    seed: Optional[int] = None

    model_config = {"populate_by_name": True}


class InferResponse(BaseModel):
    """The outcome of a completed try-on generation returned to the caller."""

    # A data-url (mock backend) or an HTTPS url (real backend).
    result_image: str = Field(..., min_length=1)
    provider: str = Field(..., min_length=1)
    latency_ms: int = Field(..., ge=0)


class ErrorResponse(BaseModel):
    """A typed error envelope used for backend failures (fail-closed 5xx)."""

    error: str
    detail: str
