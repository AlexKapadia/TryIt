"""Backend protocol for the TryIt inference service.

Defines the narrow structural interface every try-on backend must satisfy so
the HTTP layer can select a backend at runtime without importing any concrete
(possibly torch-heavy) implementation. Backends receive already-validated
image references and return a single result image as a string (a ``data:`` URL
for the mock backend, or an HTTPS URL for a real backend).
"""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from app.schemas import ImageRef


@runtime_checkable
class Backend(Protocol):
    """Structural interface for a try-on inference backend.

    Implementations must be pure with respect to their inputs: identical
    ``(person, garment, num_samples, seed)`` tuples must produce identical
    output so the platform's determinism guarantees hold end to end.
    """

    name: str

    def infer(
        self,
        person: ImageRef,
        garment: ImageRef,
        num_samples: int,
        seed: Optional[int],
    ) -> str:
        """Produce a try-on result image.

        :param person: validated person image reference.
        :param garment: validated garment image reference.
        :param num_samples: requested sample count (already bounded 1..4).
        :param seed: optional deterministic seed.
        :returns: a result image as a ``data:`` URL or HTTPS URL string.
        :raises BackendError: on any failure to produce a result.
        """
        ...


class BackendError(RuntimeError):
    """Raised when a backend cannot produce a result.

    The HTTP layer maps this to a typed 500 (fail-closed): a backend failure
    never leaks an internal stack trace or a partial result to the caller.
    """
