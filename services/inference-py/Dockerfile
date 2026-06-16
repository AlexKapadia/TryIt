# syntax=docker/dockerfile:1.7
#
# Image for the TryIt self-hosted inference service (FastAPI, uvicorn).
#
# By DEFAULT this builds the lightweight, torch-free `mock` backend image:
#   - installs the base package only (fastapi/uvicorn/pydantic/pillow)
#   - NO `model` extra (torch + diffusers) — that is a separate, heavy GPU image
#   - boots the safe `mock` backend unless TRYIT_INFER_BACKEND is overridden
#
# To build the REAL model (GPU) image, install the `model` extra by setting the
# build arg:  --build-arg INSTALL_EXTRAS=model
# For production GPU serving you will typically also swap the base image to a CUDA
# runtime (e.g. nvidia/cuda:12.x-runtime) and pass --gpus all at run time. The
# default here stays CPU-only and CUDA-free so the stack runs anywhere.

ARG PYTHON_VERSION=3.13

# ---------------------------------------------------------------------------
# Stage 1: build a wheel/install into an isolated prefix
# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS build
WORKDIR /src

# Set to "model" to pull the torch/diffusers GPU extra; default is base-only.
ARG INSTALL_EXTRAS=""

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Copy the package sources (pyproject + the importable `app` package).
COPY pyproject.toml ./
COPY app ./app

# Install into a relocatable prefix so the runtime stage stays minimal.
# When INSTALL_EXTRAS is empty we install the base package; otherwise ".[model]".
RUN if [ -n "$INSTALL_EXTRAS" ]; then SPEC=".[$INSTALL_EXTRAS]"; else SPEC="."; fi \
    && pip install --prefix=/install "$SPEC"

# ---------------------------------------------------------------------------
# Stage 2: minimal non-root runtime
# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-slim AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Safe default: torch-free deterministic mock backend (override to "leffa").
    TRYIT_INFER_BACKEND=mock

# curl is used by the container HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    # Dedicated unprivileged user — never run uvicorn as root (least privilege).
    && groupadd --system --gid 1001 tryit \
    && useradd --system --uid 1001 --gid tryit tryit

# Bring in the installed packages + console scripts from the build stage.
COPY --from=build /install /usr/local
# The app package is imported as `app.main:app`; ship the sources too.
COPY --chown=tryit:tryit app ./app

USER tryit
EXPOSE 8000

# Liveness: GET /healthz returns {"status":"ok"} with no side effects.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

# Single uvicorn worker is the safe default; scale workers/replicas in prod.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
