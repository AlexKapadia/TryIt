// Stryker mutation-testing config for @tryit/contracts.
// The vitest-runner plugin is installed once at the workspace root (pnpm `-Dw`), so we resolve
// it by absolute path here — pnpm does not symlink it into this package's local node_modules.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vitestRunner = require.resolve('@stryker-mutator/vitest-runner');

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  coverageAnalysis: 'perTest',
  plugins: [vitestRunner],
  concurrency: 4,
  timeoutMS: 60000,
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
  ],
  reporters: ['html', 'clear-text', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: '.stryker-tmp',
};
