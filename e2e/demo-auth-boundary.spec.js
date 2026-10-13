// @ts-check
const { test, expect } = require('@playwright/test');

test('anonymous visitors are redirected from protected production pages', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/insurer/dashboard');
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/policies');
  await expect(page).toHaveURL(/\/login/);
});

test('the demo is reachable without any login', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dpdp_consent', 'true'));
  await page.goto('/demo');
  await expect(page).toHaveURL(/\/demo/);
  await expect(page.getByTestId('simulation-warning')).toBeVisible();
});
