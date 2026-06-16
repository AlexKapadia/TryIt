"""Runtime configuration for the TryIt inference service.

Settings are read from the process environment (``TRYIT_*`` prefix) so the
deployment never hard-codes operational knobs and secrets stay out of source.
The default backend is the torch-free ``mock`` so the service is installable,
health-checkable, and fully testable without a GPU or model weights.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# The mock backend is the safe default: deterministic, torch-free, and what the
# test suite exercises. The ``leffa`` backend is opt-in and requires the model
# extra (torch/diffusers) to be installed.
DEFAULT_BACKEND = "mock"


@dataclass(frozen=True)
class Settings:
    """Immutable, env-derived configuration snapshot for the service."""

    backend: str = DEFAULT_BACKEND
    # Hard upper bound on decoded inline image bytes (mirrors the schema bound);
    # kept here so an operator can tighten it without a code change.
    max_image_bytes: int = 8 * 1024 * 1024


def load_settings() -> Settings:
    """Build a :class:`Settings` from the environment, falling back to defaults.

    Fail-safe: an unset variable yields the documented default rather than an
    error, so a misconfigured environment still boots the safe mock backend.
    """
    backend = os.environ.get("TRYIT_INFER_BACKEND", DEFAULT_BACKEND).strip().lower()
    raw_max = os.environ.get("TRYIT_INFER_MAX_IMAGE_BYTES")
    max_image_bytes = int(raw_max) if raw_max and raw_max.isdigit() else 8 * 1024 * 1024
    return Settings(backend=backend, max_image_bytes=max_image_bytes)
