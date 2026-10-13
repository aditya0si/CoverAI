// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { expectedWebOrigin } = require('./demo-origin');

/**
 * coverai-repair-r2 dedicated-port proxy control.
 *
 * Runs against the second repair web server (3052) whose upstream is fixed
 * server-side to the recording mock (8092) via DEMO_API_ORIGIN. Proves the
 * same-origin proxy still strips production cookies and never forwards query
 * strings or Authorization on the repair origin (3042, resolved from config).
 */
const MOCK_RECORD = path.join(__dirname, '..', 'test-results', 'mock-upstream.json');
const WEB_ORIGIN = expectedWebOrigin();

test('repair proxy strips production cookies and does not forward query strings', async ({
  request,
}) => {
  if (fs.existsSync(MOCK_RECORD)) fs.unlinkSync(MOCK_RECORD);

  const response = await request.get('/api/v1/demo/session?evil=1', {
    headers: {
      Origin: WEB_ORIGIN,
      Cookie: 'access_token=LEAK; refresh_token=LEAK2; coverai_demo_session=opaque-abc',
    },
  });
  expect(response.status()).toBe(200);

  const record = JSON.parse(fs.readFileSync(MOCK_RECORD, 'utf8'));
  const forwardedCookie = String(record.headers.cookie || '');
  expect(forwardedCookie).toContain('coverai_demo_session=opaque-abc');
  expect(forwardedCookie).not.toContain('access_token');
  expect(forwardedCookie).not.toContain('refresh_token');
  expect(record.headers.authorization).toBeUndefined();
  expect(record.url).toBe('/api/v1/demo/session');
});

test('repair proxy rejects a foreign origin on mutations', async ({ request }) => {
  const response = await request.post('/api/v1/demo/session', {
    headers: { Origin: 'http://evil.example' },
    data: {},
  });
  expect(response.status()).toBe(403);
});
