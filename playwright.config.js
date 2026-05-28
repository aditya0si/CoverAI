// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * CoverAI Playwright Config
 * ─────────────────────────
 * Multi-role storageState architecture:
 *   1. "setup" project runs auth.setup.js → persists cookies for each role
 *   2. Role-specific projects depend on "setup" and load their storageState
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    // ── Auth Setup (runs first) ──────────────────────────────────────
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },

    // ── Customer Tests ───────────────────────────────────────────────
    {
      name: 'customer',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/customer.json',
      },
      dependencies: ['setup'],
      testMatch: /customer\.spec\.js/,
    },

    // ── Insurer Officer Tests ────────────────────────────────────────
    {
      name: 'insurer',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/insurer.json',
      },
      dependencies: ['setup'],
      testMatch: /insurer\.spec\.js/,
    },

    // ── Advisor Tests ────────────────────────────────────────────────
    {
      name: 'advisor',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/advisor.json',
      },
      dependencies: ['setup'],
      testMatch: /advisor\.spec\.js/,
    },
  ],
});
