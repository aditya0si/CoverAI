// @ts-check
const path = require('path');
const { expect } = require('@playwright/test');

const PDF_PATH = path.join(__dirname, '..', 'test-results', 'demo-policy.pdf');
const PAGE_2_FRAGMENT = 'accidental external damage to the insured vehicle';
const NARRATIVE = 'my car had accidental external damage after a collision';

async function dismissConsent(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('dpdp_consent', 'true');
    } catch {
      /* ignore */
    }
  });
}

async function openDemo(page) {
  await dismissConsent(page);
  await page.goto('/demo');
  await expect(page.getByTestId('simulation-warning')).toBeVisible();
}

async function uploadPolicy(page) {
  await page.getByTestId('upload-input').setInputFiles(PDF_PATH);
  await page.getByTestId('upload-ack').check();
  await page.getByTestId('upload-button').click();
  await expect(page.getByTestId('document-summary')).toBeVisible({ timeout: 30_000 });
}

async function explainNarrative(page, narrative) {
  await page.getByTestId('narrative-input').fill(narrative);
  await page.getByTestId('explain-button').click();
  await expect(page.getByTestId('explanation-panel')).toBeVisible({ timeout: 30_000 });
}

module.exports = {
  PDF_PATH,
  PAGE_2_FRAGMENT,
  NARRATIVE,
  dismissConsent,
  openDemo,
  uploadPolicy,
  explainNarrative,
};
