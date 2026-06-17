import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @tryit/api.
 *
 * Node environment because the units under test are App Router route handlers
 * (Web `Request`/`Response`), not DOM components.
 */
export default defineConfig({
  test: {
    // Use worker_threads, not forks: tinypool 1.1.1 ProcessWorker races and crashes
    // (workerData undefined) when turbo spawns several vitest processes in parallel.
    pool: "threads",
    environment: 'node',
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
  },
});
