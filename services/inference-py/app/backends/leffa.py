"""Real CatVTON/Leffa try-on backend (opt-in, behind the ``model`` extra).

This is the self-hosted inference path recommended in
``docs/research/decision.md`` (CatVTON method, Leffa MIT-licensed checkpoint).
It is a deliberate STUB: the heavy ``torch``/``diffusers`` stack is imported
*lazily inside* :meth:`LeffaBackend.infer` so importing this module never drags
in the GPU dependencies, and so the service (and its test suite) run fine with
only the base + dev extras installed.

If the ``model`` extra is absent the backend fails closed with a clear
:class:`~app.backends.base.BackendError` that names the missing dependency and
points back at the research decision — it never silently degrades to a
non-functional response.
"""

from __future__ import annotations

from typing import Optional

from app.backends.base import BackendError
from app.schemas import ImageRef


class LeffaBackend:
    """CatVTON/Leffa diffusion backend. Requires the ``model`` extra installed."""

    name = "leffa"

    def infer(
        self,
        person: ImageRef,
        garment: ImageRef,
        num_samples: int,
        seed: Optional[int],
    ) -> str:
        """Run CatVTON/Leffa inference (STUB — wiring lands in a later gate).

        The torch/diffusers imports are intentionally lazy and local so this
        module is importable without the model extra. Until the model pipeline
        is wired, this fails closed rather than returning a fake result.
        """
        try:
            import torch  # noqa: F401  (lazy: only needed for real inference)
            import diffusers  # noqa: F401
        except ImportError as exc:
            # fail-closed: the model extra is not installed; refuse the request.
            raise BackendError(
                "leffa backend requires the 'model' extra (torch, diffusers). "
                "Install with: pip install -e '.[model]'. "
                "See docs/research/decision.md (CatVTON / Leffa MIT checkpoint)."
            ) from exc

        # The Leffa pipeline (load checkpoint, encode person+garment, denoise,
        # decode to an image, upload, return an HTTPS URL) is wired in a later
        # gate. Until then this path is not yet functional.
        raise BackendError(
            "leffa backend is not yet wired; model pipeline lands in a later gate. "
            "See docs/research/decision.md."
        )
