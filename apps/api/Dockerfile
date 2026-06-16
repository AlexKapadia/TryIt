# syntax=docker/dockerfile:1.7
#
# Multi-stage build for @tryit/api (Next.js, App Router) in the pnpm monorepo.
#
# Strategy:
#   1. `deps`  — install the FULL workspace with a frozen lockfile (deterministic).
#   2. `build` — build only @tryit/api; Next emits a self-contained `standalone`
#                server. The `output: 'standalone'` in apps/api/next.config.mjs is
#                gated behind BUILD_STANDALONE=1 (set below) — locally it stays off
#                because standalone's symlinks hit EPERM on Windows; the container
#                build opts in so it still produces .next/standalone.
#   3. `runner`— copy ONLY the standalone output + static assets into a slim,
#                non-root image. No pnpm, no source, no dev deps at runtime.
#
# The standalone output bundles every transpiled @tryit/* workspace dependency,
# so the runtime stage needs no node_modules install of its own.

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# Stage 1: workspace dependencies (cached unless lockfile/manifests change)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Pin Corepack-managed pnpm to the version declared in the root package.json.
RUN corepack enable
WORKDIR /repo

# Copy only the files that affect dependency resolution first, so the install
# layer is cached across source-only changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/demo-shop/package.json apps/demo-shop/package.json
COPY packages/ packages/
COPY e2e/package.json e2e/package.json

# Frozen lockfile = reproducible, fail-if-drift install (institution-grade posture).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: build @tryit/api into a standalone server
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo
# Bring in the full source now that deps are resolved.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build ONLY the API workspace (and its internal deps via the dependency graph).
# Opt into Next's standalone output (gated off locally to avoid Windows EPERM).
ENV BUILD_STANDALONE=1
RUN pnpm --filter @tryit/api build

# ---------------------------------------------------------------------------
# Stage 3: minimal runtime image (non-root, standalone server only)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# curl is used by the container HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    # Run as a dedicated unprivileged user (never root) — least privilege.
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# The standalone output places the server entry under the app's path inside the
# monorepo (.next/standalone/apps/api/server.js) plus a shared node_modules.
COPY --from=build --chown=nextjs:nodejs /repo/apps/api/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/api/.next/static ./apps/api/.next/static
# NOTE: @tryit/api has no apps/api/public directory today, so it is intentionally
# not copied. If static assets are added under apps/api/public later, add:
#   COPY --from=build --chown=nextjs:nodejs /repo/apps/api/public ./apps/api/public

USER nextjs
EXPOSE 3001

# Liveness: the public, side-effect-free /v1/health route returns {"status":"ok"}.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3001/v1/health || exit 1

CMD ["node", "apps/api/server.js"]
