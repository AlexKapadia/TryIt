"""Pluggable inference backends for the TryIt service.

Each backend implements the :class:`~app.backends.base.Backend` protocol so the
FastAPI surface stays backend-agnostic. The default ``mock`` backend is
torch-free and deterministic (used by the test suite); the ``leffa`` backend is
the real CatVTON/Leffa model path and is opt-in behind the ``model`` extra.
"""
