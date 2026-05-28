// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Helper: dismiss DPDP consent modal if it appears.
 */
async function dismissConsent(page) {
  try {
    const btn = page.getByRole('button', { name: 'Accept & Continue' });
    await btn.waitFor({ state: 'visible', timeout: 3_000 });
    await btn.click();
    await page.waitForTimeout(500);
  } catch {
    // Not shown
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Advisor Portal Access
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Advisor - Portal Access', () => {
  test('loads advisor customers page with sidebar nav', async ({ page }) => {
    await page.goto('/advisor/customers');
    await page.waitForLoadState('networkidle');
    await dismissConsent(page);
    await page.waitForTimeout(2_000);

    await expect(page.locator('nav >> text=Customers').first()).toBeVisible();
    await expect(page.locator('nav >> text=Claims').first()).toBeVisible();
    await expect(page.locator('nav >> text=Renewals').first()).toBeVisible();
  });

  test('advisor claims page loads', async ({ page }) => {
    await page.goto('/advisor/claims');
    await page.waitForLoadState('networkidle');
    await dismissConsent(page);
    expect(page.url()).toContain('/advisor/claims');
  });

  test('advisor renewals page loads', async ({ page }) => {
    await page.goto('/advisor/renewals');
    await page.waitForLoadState('networkidle');
    await dismissConsent(page);
    expect(page.url()).toContain('/advisor/renewals');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Advisor Auth Guard
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Advisor - Auth Guard', () => {
  test('advisor can access advisor routes', async ({ page }) => {
    await page.goto('/advisor/customers');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/advisor');
  });
});
