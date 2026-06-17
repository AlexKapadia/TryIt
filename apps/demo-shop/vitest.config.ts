/**
 * Vitest config for @tryit/demo-shop.
 *
 * Light render/logic tests for the storefront's pure pieces (catalogue data + the cart reducer).
 * The primary proof of this app is the production build and the live Playwright e2e suite; these
 * unit tests guard the deterministic data/price/cart logic that the UI depends on.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use worker_threads, not forks: tinypool 1.1.1 ProcessWorker races and crashes
    // (workerData undefined) when turbo spawns several vitest processes in parallel.
    pool: "threads",
    // Property-based (fast-check) + sandboxed runs need headroom: turbo parallelises every
    // package while each vitest also spawns workers, so on a contended 2-core CI runner the
    // heaviest properties exceed the 5s default. 30s decouples correctness from machine speed.
    testTimeout: 30000,
    environment: 'node',
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
  },
});
