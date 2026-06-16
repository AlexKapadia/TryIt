"""Backend selection for the TryIt inference service.

Maps the configured backend name (from :mod:`app.config`) to a concrete
:class:`~app.backends.base.Backend`. The mapping is explicit and closed: an
unknown backend name fails closed with a clear error rather than defaulting to
something the operator did not ask for. The ``leffa`` backend is imported here
but is safe to import (its torch dependency is lazy — see ``app/backends/leffa.py``).
"""

from __future__ import annotations

from app.backends.base import Backend
from app.backends.leffa import LeffaBackend
from app.backends.mock import MockBackend
from app.config import Settings


def build_backend(settings: Settings) -> Backend:
    """Construct the backend named by ``settings.backend``.

    :raises ValueError: if the configured backend name is not recognised
        (fail-closed: never fall back to an unintended backend).
    """
    name = settings.backend
    if name == "mock":
        return MockBackend()
    if name == "leffa":
        return LeffaBackend()
    # fail-closed: an unknown backend is a configuration error, not a default.
    raise ValueError(f"unknown inference backend: {name!r}")
