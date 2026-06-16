import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the TryIt live end-to-end suite.
 *
 * This is the §4.9 "live UI proof": it boots BOTH real apps in PRODUCTION mode and drives the
 * running demo-shop storefront (port 3002) in a real Chromium browser, exercising the embedded
 * `<tryit-widget>` against the real API (port 3001) and its offline DeterministicProvider.
 *
 * Both servers are built+started by the `webServer` array below and Playwright waits on each
 * one's readiness URL before any test runs. The API is started with `TRYIT_DEV_DEMO=1` so the
 * dev-credentials endpoint serves a working demo key (the storefront and these tests fetch it at
 * runtime — no key is committed). `reuseExistingServer` is on locally so a dev can keep servers
 * running between runs, but off in CI for a clean boot every time.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Build + start the real API on 3001 with the dev credential endpoint enabled.
      command: 'pnpm --filter @tryit/api build && pnpm --filter @tryit/api start',
      url: 'http://localhost:3001/v1/health',
      env: { TRYIT_DEV_DEMO: '1', PORT: '3001' },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Build + start the real storefront on 3002 (it talks to the API above at runtime).
      command: 'pnpm --filter @tryit/demo-shop build && pnpm --filter @tryit/demo-shop start',
      url: 'http://localhost:3002',
      env: { PORT: '3002' },
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
