import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @tryit/api.
 *
 * Node environment because the units under test are App Router route handlers
 * (Web `Request`/`Response`), not DOM components.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
  },
});
