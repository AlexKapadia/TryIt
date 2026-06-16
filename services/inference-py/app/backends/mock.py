"""Deterministic, torch-free mock try-on backend.

This is the default backend and the one the test suite exercises. It mirrors
the TypeScript ``DeterministicProvider``: instead of running a diffusion model
it produces a stable placeholder image derived purely from the request inputs,
so identical ``(person, garment, num_samples, seed)`` tuples yield byte-for-byte
identical output. It uses only Pillow — no torch, no GPU, no network — so the
service can be installed and validated in CI without the heavy model stack.

The placeholder is a deterministic letterboxed canvas tinted by a hash of the
inputs (including the seed), which makes the determinism property easy to assert
in tests while staying obviously synthetic (never mistaken for a real try-on).
"""

from __future__ import annotations

import base64
import hashlib
import io
from typing import Optional

from PIL import Image

from app.backends.base import BackendError
from app.schemas import Base64ImageRef, ImageRef, UrlImageRef

# Fixed canvas size keeps output size stable and small; determinism comes from
# the pixel content, not the dimensions.
_CANVAS = (256, 256)


def _ref_fingerprint(ref: ImageRef) -> bytes:
    """Stable byte fingerprint of an image reference (its identifying content).

    For a URL we hash the URL; for inline base64 we hash the declared MIME type
    and the payload. This is what makes the mock deterministic per distinct
    input without decoding (and trusting) arbitrary image bytes.
    """
    if isinstance(ref, UrlImageRef):
        return b"url:" + ref.url.encode("utf-8")
    if isinstance(ref, Base64ImageRef):
        return b"b64:" + ref.mime_type.encode("utf-8") + b":" + ref.data.encode("utf-8")
    # fail-closed: an unrecognised ref shape never silently produces output.
    raise BackendError("unsupported image reference")


def _tint(person: ImageRef, garment: ImageRef, num_samples: int, seed: Optional[int]) -> tuple[int, int, int]:
    """Derive a deterministic RGB tint from all request inputs.

    The seed participates in the hash so the same images with a different seed
    produce a different (but still deterministic) placeholder.
    """
    digest = hashlib.sha256()
    digest.update(_ref_fingerprint(person))
    digest.update(b"|")
    digest.update(_ref_fingerprint(garment))
    digest.update(b"|n=")
    digest.update(str(num_samples).encode("ascii"))
    digest.update(b"|s=")
    # ``None`` and a literal 0 must hash differently, hence the explicit marker.
    digest.update(b"none" if seed is None else str(seed).encode("ascii"))
    raw = digest.digest()
    return raw[0], raw[1], raw[2]


def _render_png(tint: tuple[int, int, int]) -> bytes:
    """Render a deterministic letterboxed PNG for the given tint.

    PNG encoding is deterministic for a fixed Pillow build and fixed pixel
    content, which is what the determinism test relies on.
    """
    canvas = Image.new("RGB", _CANVAS, (0, 0, 0))  # black letterbox border
    inner = Image.new("RGB", (192, 192), tint)
    canvas.paste(inner, (32, 32))
    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", optimize=False)
    return buffer.getvalue()


class MockBackend:
    """Default backend: a deterministic Pillow placeholder, no model required."""

    name = "mock"

    def infer(
        self,
        person: ImageRef,
        garment: ImageRef,
        num_samples: int,
        seed: Optional[int],
    ) -> str:
        """Return a deterministic ``data:image/png;base64,...`` placeholder.

        Stable for a given ``(person, garment, num_samples, seed)`` so callers
        can rely on reproducibility, mirroring the deterministic provider.
        """
        try:
            tint = _tint(person, garment, num_samples, seed)
            png = _render_png(tint)
        except BackendError:
            raise
        except Exception as exc:  # defensive: never leak an internal error
            # fail-closed: any rendering failure surfaces as a typed error.
            raise BackendError("mock backend failed to render placeholder") from exc
        encoded = base64.b64encode(png).decode("ascii")
        return f"data:image/png;base64,{encoded}"
