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
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index.ts is a re-export-only barrel with no executable logic.
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: 90,
        branches: 85,
      },
    },
  },
});
