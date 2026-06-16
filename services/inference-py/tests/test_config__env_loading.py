"""Tests for environment-driven settings loading.

Assert the safe defaults (mock backend, 8 MiB bound) and that ``TRYIT_*`` env
vars override them, including normalisation (case/whitespace) and a fail-safe
fallback when ``TRYIT_INFER_MAX_IMAGE_BYTES`` is non-numeric.
"""

from __future__ import annotations

import pytest

from app.config import DEFAULT_BACKEND, load_settings


def test_defaults_when_env_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """With no env vars set, the safe mock default and 8 MiB bound apply."""
    monkeypatch.delenv("TRYIT_INFER_BACKEND", raising=False)
    monkeypatch.delenv("TRYIT_INFER_MAX_IMAGE_BYTES", raising=False)
    settings = load_settings()
    assert settings.backend == DEFAULT_BACKEND == "mock"
    assert settings.max_image_bytes == 8 * 1024 * 1024


def test_backend_env_override_is_normalised(monkeypatch: pytest.MonkeyPatch) -> None:
    """Backend name is lower-cased and stripped before use."""
    monkeypatch.setenv("TRYIT_INFER_BACKEND", "  LEFFA  ")
    assert load_settings().backend == "leffa"


def test_non_numeric_max_bytes_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    """A non-numeric byte bound is ignored in favour of the safe default."""
    monkeypatch.setenv("TRYIT_INFER_MAX_IMAGE_BYTES", "not-a-number")
    assert load_settings().max_image_bytes == 8 * 1024 * 1024


def test_numeric_max_bytes_override(monkeypatch: pytest.MonkeyPatch) -> None:
    """A numeric byte bound overrides the default."""
    monkeypatch.setenv("TRYIT_INFER_MAX_IMAGE_BYTES", "1048576")
    assert load_settings().max_image_bytes == 1048576
