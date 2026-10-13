// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const ROOT = __dirname;

// The dedicated web origin for this run. All specs (original + repair) resolve
// their expected Origin from this value, so the full browser suite can run on
// dedicated ports without hardcoding localhost:3000.
process.env.DEMO_EXPECTED_WEB_ORIGIN =
  process.env.DEMO_EXPECTED_WEB_ORIGIN || 'http://localhost:3042';

/**
 * Dedicated Playwright config for the coverai-repair-r2 verification.
 *
 * It runs the FULL browser suite on dedicated ports: the original demo specs
 * (demo.spec.js, demo-auth-boundary.spec.js, demo-proxy.spec.js) plus the r2
 * repair regressions, so the parent servers on 3000/8001/3010/8098 are never
 * started. Every service binds a dedicated local port:
 *
 *   web (demo-repair)        3042
 *   web (demo-repair-proxy)  3052
 *   demo API                 8042
 *   mock upstream            8092
 *
 * Origin allowlists are adjusted via test-only env vars, and both web servers
 * run the already-built production `next start` bundle.
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
    baseURL: 'http://localhost:3042',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
  },

  projects: [
    // The full original demo suite (demo.spec.js + demo-auth-boundary.spec.js)
    // runs here too, on the dedicated web server, never on parent port 3000.
    {
      name: 'demo',
      testMatch: /demo.*\.spec\.js/,
      testIgnore: [
        /demo-proxy\.spec\.js/,
        /demo-repair(-proxy)?\.spec\.js/,
        /demo-repair-r4\.spec\.js/,
        /demo-repair-r5\.spec\.js/,
      ],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3042' },
    },
    {
      name: 'demo-proxy',
      testMatch: /demo-proxy\.spec\.js/,
      use: { baseURL: 'http://localhost:3052' },
    },
    {
      name: 'demo-repair',
      testMatch: /demo-repair\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3042' },
    },
    {
      // coverai independent-review repair (r4) browser regressions.
      name: 'demo-repair-r4',
      testMatch: /demo-repair-r4\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3042' },
    },
    {
      // coverai-r5 lifecycle-continuation browser regressions.
      name: 'demo-repair-r5',
      testMatch: /demo-repair-r5\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3042' },
    },
    {
      name: 'demo-repair-proxy',
      testMatch: /demo-repair-proxy\.spec\.js/,
      use: { baseURL: 'http://localhost:3052' },
    },
  ],

  webServer: [
    {
      command:
        'poetry run uvicorn demo_app:app --host 127.0.0.1 --port 8042 --workers 1',
      cwd: path.join(ROOT, 'apps', 'api'),
      url: 'http://127.0.0.1:8042/api/v1/demo/health',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        DEMO_WORKERS: '1',
        DEMO_ALLOWED_ORIGINS: 'http://localhost:3042,http://127.0.0.1:3042',
        // Test-only override: the suite creates ~25 fresh anonymous sessions in
        // a single sequential run, far above the production per-IP default of
        // 10/min. The limit itself is unchanged for real deployments.
        DEMO_SESSION_CREATE_PER_MINUTE: '1000',
      },
    },
    {
      command: 'node e2e/mock-upstream.js',
      cwd: ROOT,
      url: 'http://127.0.0.1:8092/health',
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...process.env, MOCK_PORT: '8092' },
    },
    {
      command: 'pnpm --filter web exec next start -p 3042',
      cwd: ROOT,
      url: 'http://localhost:3042/demo',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        DEMO_API_ORIGIN: 'http://127.0.0.1:8042',
        DEMO_WEB_ORIGIN: 'http://localhost:3042',
      },
    },
    {
      command: 'pnpm --filter web exec next start -p 3052',
      cwd: ROOT,
      url: 'http://localhost:3052/demo',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        DEMO_API_ORIGIN: 'http://127.0.0.1:8092',
        DEMO_WEB_ORIGIN: 'http://localhost:3042',
      },
    },
  ],
});
