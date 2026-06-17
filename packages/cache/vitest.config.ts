import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use worker_threads, not forks: tinypool 1.1.1 ProcessWorker races and crashes
    // (workerData undefined) when turbo spawns several vitest processes in parallel.
    pool: "threads",
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
