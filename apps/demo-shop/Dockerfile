# syntax=docker/dockerfile:1.7
#
# Multi-stage build for @tryit/demo-shop (Next.js storefront) in the pnpm monorepo.
#
# Mirrors apps/api/Dockerfile: install the frozen workspace, build only this app
# into a Next.js `standalone` server, then ship a slim non-root runtime with just
# the output. The `output: 'standalone'` in apps/demo-shop/next.config.mjs is gated
# behind BUILD_STANDALONE=1 (set below) — off locally to dodge Windows symlink
# EPERM; the container build opts in so it still emits .next/standalone.
#
# The demo shop is OPTIONAL — it exists to showcase the embeddable widget against
# a real API. Retailers running headless can skip building/starting this image.

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# Stage 1: workspace dependencies
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/demo-shop/package.json apps/demo-shop/package.json
COPY packages/ packages/
COPY e2e/package.json e2e/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: build @tryit/demo-shop into a standalone server
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The storefront resolves the API base URL at build time for client bundles.
ARG NEXT_PUBLIC_TRYIT_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_TRYIT_API_URL=$NEXT_PUBLIC_TRYIT_API_URL
# Opt into Next's standalone output (gated off locally to avoid Windows EPERM).
ENV BUILD_STANDALONE=1
RUN pnpm --filter @tryit/demo-shop build

# ---------------------------------------------------------------------------
# Stage 3: minimal runtime image (non-root)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /repo/apps/demo-shop/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/demo-shop/.next/static ./apps/demo-shop/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/demo-shop/public ./apps/demo-shop/public

USER nextjs
EXPOSE 3002

# Next serves the App Router root ("/") once the server is ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3002/ || exit 1

CMD ["node", "apps/demo-shop/server.js"]
