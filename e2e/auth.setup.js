// @ts-check
const { test: setup } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const API = 'http://localhost:8000/api/v1';
const WEB = 'http://localhost:3000';

// Fixed credentials so re-runs reuse existing accounts
const ROLES = [
  {
    key: 'customer',
    file: 'e2e/.auth/customer.json',
    full_name: 'E2E Customer',
    email: 'e2e_customer@coverai.test',
    phone: '9876500001',
    password: 'E2eTest@1234',
    role: 'customer',
  },
  {
    key: 'insurer',
    file: 'e2e/.auth/insurer.json',
    full_name: 'E2E Insurer Officer',
    email: 'e2e_insurer@coverai.test',
    phone: '8876500002',
    password: 'E2eTest@1234',
    role: 'insurer_officer',
  },
  {
    key: 'advisor',
    file: 'e2e/.auth/advisor.json',
    full_name: 'E2E Advisor',
    email: 'e2e_advisor@coverai.test',
    phone: '7876500003',
    password: 'E2eTest@1234',
    role: 'advisor',
  },
];

// Ensure .auth directory exists
const authDir = path.join(__dirname, '.auth');
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

// Run serially to avoid parallel rate limit collisions on /auth/register (3/min)
setup.describe.configure({ mode: 'serial' });

/**
 * Helper: register with retry on 429
 */
async function registerWithRetry(page, role, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await page.request.post(`${API}/auth/register`, {
      data: {
        full_name: role.full_name,
        email: role.email,
        phone: role.phone,
        password: role.password,
        role: role.role,
      },
    });
    if (res.status() === 201 || res.status() === 400) return res;
    if (res.status() === 429) {
      const waitMs = (attempt + 1) * 20_000;
      console.log(`  [${role.key}] Rate limited, waiting ${waitMs / 1000}s…`);
      await page.waitForTimeout(waitMs);
      continue;
    }
    throw new Error(
      `Registration failed for ${role.key}: HTTP ${res.status()} – ${await res.text()}`
    );
  }
  throw new Error(`Registration for ${role.key} exhausted ${maxRetries} retries on 429`);
}

for (const role of ROLES) {
  setup(`authenticate as ${role.key}`, async ({ page, context }) => {
    // ── 1. Register via API (skip if duplicate) ──────────────────────
    await registerWithRetry(page, role);

    // ── 2. Login via browser to capture cookies + localStorage ───────
    await page.goto(`${WEB}/login`);

    // Dismiss DPDP consent modal if present
    try {
      const consentBtn = page.getByRole('button', { name: 'Accept & Continue' });
      await consentBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await consentBtn.click();
      await page.waitForTimeout(500);
    } catch {
      // Modal not shown — continue
    }

    await page.locator('#email').fill(role.email);
    await page.locator('#password').fill(role.password);
    await page.locator('button[type="submit"]').click();

    // Wait for redirect
    await page.waitForURL('**/dashboard', { timeout: 15_000 });

    // ── 3. Set user_role cookie explicitly ────────────────────────────
    // The app sets this via document.cookie which Playwright captures,
    // but we also add it to the context to be safe.
    await context.addCookies([{
      name: 'user_role',
      value: role.role,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    }]);

    // Dismiss DPDP consent modal on dashboard if it appears
    try {
      const consentBtn = page.getByRole('button', { name: 'Accept & Continue' });
      await consentBtn.waitFor({ state: 'visible', timeout: 3_000 });
      await consentBtn.click();
      await page.waitForTimeout(500);
    } catch {
      // Not shown
    }

    // ── 4. Persist auth state ────────────────────────────────────────
    await context.storageState({ path: role.file });
  });
}
