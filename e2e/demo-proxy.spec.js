// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { expectedWebOrigin } = require('./demo-origin');

const MOCK_RECORD = path.join(__dirname, '..', 'test-results', 'mock-upstream.json');
const WEB_ORIGIN = expectedWebOrigin();

test('proxy rejects arbitrary paths, invalid ids and disallowed methods', async ({ request }) => {
  expect((await request.get('/api/v1/demo/admin')).status()).toBe(404);
  expect((await request.get('/api/v1/demo/policies/not-a-uuid/pages/1')).status()).toBe(404);
  expect((await request.get('/api/v1/demo/inboxes/attacker')).status()).toBe(404);
  expect((await request.put('/api/v1/demo/session')).status()).toBe(405);
  expect(
    (
      await request.post('/api/v1/demo/session', {
        headers: { Origin: 'http://evil.example' },
        data: {},
      })
    ).status()
  ).toBe(403);
});

test('proxy responses are no-store', async ({ request }) => {
  const response = await request.get('/api/v1/demo/session', {
    headers: { Origin: WEB_ORIGIN },
  });
  expect(response.headers()['cache-control']).toContain('no-store');
});

// This test runs in the `demo-proxy` project against a dedicated web server
// instance (port 3010) whose upstream is fixed server-side to the recording mock
// via DEMO_API_ORIGIN. The upstream is never selectable from a request header.
test('proxy preserves a validated Retry-After and drops unsafe values', async ({ request }) => {
  const safe = await request.get('/api/v1/demo/session', {
    headers: { Origin: WEB_ORIGIN, 'Idempotency-Key': 'safe-retry-after' },
  });
  expect(safe.status()).toBe(200);
  expect(safe.headers()['retry-after']).toBe('42');

  const unsafe = await request.get('/api/v1/demo/session', {
    headers: { Origin: WEB_ORIGIN, 'Idempotency-Key': 'unsafe-retry-after' },
  });
  expect(unsafe.status()).toBe(200);
  expect(unsafe.headers()['retry-after']).toBeUndefined();
});

test('proxy strips production cookies and does not forward query strings', async ({ request }) => {
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
