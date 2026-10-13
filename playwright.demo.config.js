// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const ROOT = __dirname;

// The exact web origin the specs should send as Origin for this run. Preserves
// the historical parent default (web on 3000) while letting the same specs run
// on dedicated repair ports via the dedicated config.
process.env.DEMO_EXPECTED_WEB_ORIGIN =
  process.env.DEMO_EXPECTED_WEB_ORIGIN || 'http://localhost:3000';

/**
 * Standalone demo Playwright config.
 *
 * No role auth setup, no storageState dependencies, no production settings.
 * Runs the isolated demo API (one worker) plus a mock upstream used only to spy
 * on proxy header forwarding.
 *
 * IMPORTANT: build the web app first (`pnpm build`). Both web servers below run
 * the production `next start` bundle so the test run is not affected by the
 * Next.js dev compiler worker crashes seen under this environment.
 *
 * The proxy-spy tests run on a second server instance (port 3010) whose upstream
 * is fixed, server-side only, via DEMO_API_ORIGIN. No request header can select
 * the upstream at runtime.
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: require.resolve('./e2e/demo-global-setup.js'),

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
  },

  projects: [
    {
      name: 'demo',
      testMatch: /demo.*\.spec\.js/,
      // The repair-r2/r4 regressions run on dedicated ports via
      // playwright.demo-repair.config.js; never on the parent demo servers.
      testIgnore: [
        /demo-proxy\.spec\.js/,
        /demo-repair(-proxy)?\.spec\.js/,
        /demo-repair-r4\.spec\.js/,
        /demo-repair-r5\.spec\.js/,
      ],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'demo-proxy',
      testMatch: /demo-proxy\.spec\.js/,
      use: { baseURL: 'http://localhost:3010' },
    },
  ],

  webServer: [
    {
      command:
        'poetry run uvicorn demo_app:app --host 127.0.0.1 --port 8001 --workers 1',
      cwd: path.join(ROOT, 'apps', 'api'),
      url: 'http://127.0.0.1:8001/api/v1/demo/health',
      reuseExistingServer: false,
      timeout: 180_000,
      env: { ...process.env, DEMO_WORKERS: '1' },
    },
    {
      command: 'node e2e/mock-upstream.js',
      cwd: ROOT,
      url: 'http://127.0.0.1:8098/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter web start',
      cwd: ROOT,
      url: 'http://localhost:3000/demo',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        DEMO_API_ORIGIN: 'http://127.0.0.1:8001',
        DEMO_WEB_ORIGIN: 'http://localhost:3000',
      },
    },
    {
      command: 'pnpm --filter web exec next start -p 3010',
      cwd: ROOT,
      url: 'http://localhost:3010/demo',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        DEMO_API_ORIGIN: 'http://127.0.0.1:8098',
        DEMO_WEB_ORIGIN: 'http://localhost:3000',
      },
    },
  ],
});
