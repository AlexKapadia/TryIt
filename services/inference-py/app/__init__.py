"""TryIt self-hosted inference service package.

Hosts the CatVTON/Leffa virtual try-on model behind a small FastAPI surface.
See README.md and docs/research/decision.md for why this path exists. Real model
wiring is added in a later gate; this package currently exposes only health and a
stubbed inference route.
"""
