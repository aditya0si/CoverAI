// @ts-check
const { test } = require('@playwright/test');

const DEFAULT_ORIGIN = 'http://localhost:3000';

/**
 * The exact web origin the API/proxy allowlist expects for this run.
 *
 * The value is resolved from configuration, never hardcoded in a spec, so the
 * same specs run on the parent servers (web 3000) and on the dedicated repair
 * servers (web 3042). Resolution order:
 *
 *   1. `DEMO_EXPECTED_WEB_ORIGIN` — set by each Playwright config for the run;
 *   2. the active project's `use.baseURL` (the config fixture);
 *   3. the historical parent default.
 *
 * This only selects which exact origin a test *sends*; the server still performs
 * a byte-exact allowlist comparison, so the origin contract is not weakened.
 */
function expectedWebOrigin() {
  const configured = process.env.DEMO_EXPECTED_WEB_ORIGIN;
  if (configured) return configured;
  try {
    const baseURL = test.info().project.use.baseURL;
    if (baseURL) return baseURL;
  } catch {
    /* called outside a running test */
  }
  return DEFAULT_ORIGIN;
}

module.exports = { DEFAULT_ORIGIN, expectedWebOrigin };
