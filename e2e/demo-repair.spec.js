// @ts-check
const { test, expect } = require('@playwright/test');
const { PDF_PATH, NARRATIVE, openDemo, uploadPolicy, explainNarrative } = require('./demo-helpers');
const { injectDemoClient } = require('./demo-client-inject');

/**
 * coverai-repair-r2 browser regressions (classes 1 and 5).
 *
 * These are the corrected acceptance probes: the historical harnesses asserted
 * the *buggy* behaviour (server document still readable with no warning, selected
 * File still present after expiry). The assertions below are inverted and
 * strengthened, and every one of them runs against a real browser.
 *
 * Runs on the dedicated ports from playwright.demo-repair.config.js.
 */

async function sessionDocumentId(page) {
  const view = await (await page.request.get('/api/v1/demo/session')).json();
  return view.document.id;
}

async function oldPageStatus(page, documentId) {
  return (await page.request.get(`/api/v1/demo/policies/${documentId}/pages/1`)).status();
}

// ── class 1: failed DELETE reset ───────────────────────────────────────────
test('failed DELETE (network error) clears local state, warns deletion is unconfirmed, retries with the same csrf', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);
  const documentId = await sessionDocumentId(page);

  let failMode = true;
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'DELETE') {
      if (failMode) return route.abort('failed');
      return route.continue();
    }
    return route.continue();
  });

  await page.getByTestId('reset-button').click();

  // Local sensitive state and the selected File are cleared immediately.
  await expect(page.getByTestId('document-summary')).toHaveCount(0);
  await expect(page.getByTestId('reset-unconfirmed')).toBeVisible();
  expect(await page.getByTestId('upload-input').inputValue()).toBe('');
  await expect(page.getByTestId('upload-ack')).not.toBeChecked();
  // Starting fresh is blocked until deletion is handled or explicitly discarded.
  await expect(page.getByTestId('start-button')).toHaveCount(0);

  // The server deletion is unconfirmed: the old capability still reads the page.
  expect(await oldPageStatus(page, documentId)).toBe(200);

  // Retry with the same csrf confirms deletion and makes the old ID inaccessible.
  failMode = false;
  await page.getByTestId('reset-retry-button').click();
  await expect(page.getByTestId('reset-unconfirmed')).toHaveCount(0);
  await expect.poll(() => oldPageStatus(page, documentId)).toBe(401);
});

test('failed DELETE (HTTP 500) reports unconfirmed deletion and retries', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);
  const documentId = await sessionDocumentId(page);

  let failMode = true;
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'DELETE') {
      if (failMode) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'boom', request_id: 't' },
          }),
        });
      }
      return route.continue();
    }
    return route.continue();
  });

  await page.getByTestId('reset-button').click();
  await expect(page.getByTestId('reset-unconfirmed')).toBeVisible();
  expect(await oldPageStatus(page, documentId)).toBe(200);

  failMode = false;
  await page.getByTestId('reset-retry-button').click();
  await expect(page.getByTestId('reset-unconfirmed')).toHaveCount(0);
  await expect.poll(() => oldPageStatus(page, documentId)).toBe(401);
});

test('a late failed reset response cannot overwrite a newer successful reset', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);
  const documentId = await sessionDocumentId(page);

  let deleteCount = 0;
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'DELETE') {
      deleteCount += 1;
      if (deleteCount === 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'late', request_id: 't' },
          }),
        });
      }
      return route.continue();
    }
    return route.continue();
  });

  await page.getByTestId('reset-button').click();
  await page.getByTestId('reset-button').click();

  await expect.poll(() => oldPageStatus(page, documentId)).toBe(401);
  await page.waitForTimeout(1800);
  // The superseded late failure must not resurrect the unconfirmed warning.
  await expect(page.getByTestId('reset-unconfirmed')).toHaveCount(0);
});

test('an explicitly discarded failed reset allows starting fresh', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);

  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'DELETE') return route.abort('failed');
    return route.continue();
  });

  await page.getByTestId('reset-button').click();
  await expect(page.getByTestId('reset-unconfirmed')).toBeVisible();
  await page.getByTestId('reset-discard-button').click();
  await expect(page.getByTestId('reset-unconfirmed')).toHaveCount(0);
  await expect(page.getByTestId('start-button')).toBeVisible();
});

// ── class 5: client expiry clears File/input/ack ───────────────────────────
test('client clock expiry clears the selected File, input and acknowledgement', async ({ page }) => {
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'POST') {
      const response = await route.fetch();
      const data = await response.json();
      data.expires_at = new Date(Date.now() + 3000).toISOString();
      await route.fulfill({ response, json: data });
    } else {
      await route.continue();
    }
  });

  await openDemo(page);
  await page.getByTestId('upload-input').setInputFiles(PDF_PATH);
  await page.getByTestId('upload-ack').check();

  await expect(page.getByTestId('session-expired')).toBeVisible({ timeout: 10_000 });
  expect(await page.getByTestId('upload-input').evaluate((input) => input.files.length)).toBe(0);
  expect(await page.getByTestId('upload-input').inputValue()).toBe('');
  await expect(page.getByTestId('upload-ack')).not.toBeChecked();
});

test('a 410 response clears the selected File and rendered state', async ({ page }) => {
  await openDemo(page);
  await page.route('**/api/v1/demo/policies', async (route) => {
    return route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'SESSION_EXPIRED', message: 'expired', request_id: 't' },
      }),
    });
  });

  await page.getByTestId('upload-input').setInputFiles(PDF_PATH);
  await page.getByTestId('upload-ack').check();
  await page.getByTestId('upload-button').click();

  await expect(page.getByTestId('session-expired')).toBeVisible();
  expect(await page.getByTestId('upload-input').evaluate((input) => input.files.length)).toBe(0);
  expect(await page.getByTestId('upload-input').inputValue()).toBe('');
  await expect(page.getByTestId('upload-ack')).not.toBeChecked();
});

test('a delayed upload response cannot resurrect state after client expiry', async ({ page }) => {
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'POST') {
      const response = await route.fetch();
      const data = await response.json();
      data.expires_at = new Date(Date.now() + 2500).toISOString();
      await route.fulfill({ response, json: data });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/v1/demo/policies', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.fulfill({ response });
  });

  await openDemo(page);
  await page.getByTestId('upload-input').setInputFiles(PDF_PATH);
  await page.getByTestId('upload-ack').check();
  await page.getByTestId('upload-button').click();

  await expect(page.getByTestId('session-expired')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(3500);
  await expect(page.getByTestId('document-summary')).toHaveCount(0);
  expect(await page.getByTestId('upload-input').evaluate((input) => input.files.length)).toBe(0);
});

// ── class 5: generation guards on every await boundary ─────────────────────
test('a delayed explanation response cannot resurrect state after reset', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);

  await page.route('**/api/v1/demo/explanations', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.fulfill({ response });
  });

  await page.getByTestId('narrative-input').fill(NARRATIVE);
  const request = page.waitForRequest(
    (req) => req.url().includes('/api/v1/demo/explanations') && req.method() === 'POST'
  );
  await page.getByTestId('explain-button').click();
  await request;

  await page.getByTestId('reset-button').click();
  await expect(page.getByTestId('document-summary')).toHaveCount(0);
  await page.waitForTimeout(3000);

  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);
});

test('a late explanation error after reset does not surface', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);

  await page.route('**/api/v1/demo/explanations', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: 'late', request_id: 't' },
      }),
    });
  });

  await page.getByTestId('narrative-input').fill(NARRATIVE);
  const request = page.waitForRequest(
    (req) => req.url().includes('/api/v1/demo/explanations') && req.method() === 'POST'
  );
  await page.getByTestId('explain-button').click();
  await request;

  await page.getByTestId('reset-button').click();
  await page.waitForTimeout(3000);

  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);
});

test('a late explanation error after timer expiry does not surface', async ({ page }) => {
  // Deterministic time control: install the fake clock before navigation and let
  // it flow naturally during setup, then jump past the TTL only once the target
  // request is actually pending. No arbitrary sleeps decide the ordering.
  await page.clock.install({ time: new Date() });

  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'POST') {
      const response = await route.fetch();
      const data = await response.json();
      data.expires_at = new Date(Date.now() + 600_000).toISOString();
      await route.fulfill({ response, json: data });
    } else {
      await route.continue();
    }
  });

  await openDemo(page);
  await uploadPolicy(page);

  let releaseExplanation = () => {};
  const explanationGate = new Promise((resolve) => {
    releaseExplanation = resolve;
  });
  let explanationPending = false;
  await page.route('**/api/v1/demo/explanations', async (route) => {
    explanationPending = true;
    await explanationGate;
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: 'late', request_id: 't' },
      }),
    });
  });

  await page.getByTestId('narrative-input').fill(NARRATIVE);
  const request = page.waitForRequest(
    (req) => req.url().includes('/api/v1/demo/explanations') && req.method() === 'POST'
  );
  await page.getByTestId('explain-button').click();
  await request;
  await expect.poll(() => explanationPending).toBe(true);

  // Initiate expiry only now that the target request is actually in flight.
  await page.clock.fastForward('11:00');
  await expect(page.getByTestId('session-expired')).toBeVisible();

  // Release the still-pending 500; the stale error must not surface.
  releaseExplanation();
  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);
});

test('a delayed inbox response cannot resurrect inboxes after reset', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);

  await page.route('**/api/v1/demo/inboxes/**', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.fulfill({ response });
  });

  const request = page.waitForRequest((req) => req.url().includes('/api/v1/demo/inboxes/mechanic'));
  await page.getByTestId('handoff-button').click();
  await request;

  await page.getByTestId('reset-button').click();
  await expect(page.getByTestId('simulated-inboxes')).toHaveCount(0);
  await page.waitForTimeout(3000);

  await expect(page.getByTestId('simulated-inboxes')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);
});

test('a delayed citation page cannot resurrect after reset', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);

  await page.route('**/api/v1/demo/policies/*/pages/*', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.fulfill({ response });
  });

  const request = page.waitForRequest((req) => /\/pages\/\d+$/.test(req.url()));
  await page.getByTestId('citation-button').first().click();
  await request;
  await expect(page.getByTestId('citation-panel')).toBeVisible();

  // A citation panel is a modal whose backdrop covers the header reset button.
  // Trigger the reset by dispatching the click directly on the button so the
  // in-flight page fetch is still pending when the generation is invalidated.
  await page.getByTestId('reset-button').dispatchEvent('click');
  await expect(page.getByTestId('citation-panel')).toHaveCount(0);
  await page.waitForTimeout(3000);

  await expect(page.getByTestId('citation-panel')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);
});

// ── class 5: citation lifecycle routes through the safe handler ────────────
test('a source-page 410 clears the selected File, acknowledgement and rendered state', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);

  await page.route('**/api/v1/demo/policies/*/pages/*', (route) =>
    route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'SESSION_EXPIRED', message: 'expired', request_id: 't' },
      }),
    })
  );

  await page.getByTestId('citation-button').first().click();

  await expect(page.getByTestId('session-expired')).toBeVisible();
  await expect(page.getByTestId('citation-panel')).toHaveCount(0);
  await expect(page.getByTestId('document-summary')).toHaveCount(0);
  expect(await page.getByTestId('upload-input').evaluate((input) => input.files.length)).toBe(0);
  await expect(page.getByTestId('upload-ack')).not.toBeChecked();
});

test('a source-page 401 clears local state and reports the missing session', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);

  await page.route('**/api/v1/demo/policies/*/pages/*', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'SESSION_MISSING', message: 'missing', request_id: 't' },
      }),
    })
  );

  await page.getByTestId('citation-button').first().click();

  await expect(page.getByTestId('error-message')).toBeVisible();
  await expect(page.getByTestId('citation-panel')).toHaveCount(0);
  await expect(page.getByTestId('document-summary')).toHaveCount(0);
  expect(await page.getByTestId('upload-input').evaluate((input) => input.files.length)).toBe(0);
});

// ── class 5: busy flags released on expiry ─────────────────────────────────
test('busy flags are cleared on expiry so a fresh session can upload again', async ({ page }) => {
  // Deterministic expiry: install the fake clock before navigation. The first
  // session gets a long TTL so it cannot expire on its own during setup (which
  // raced the upload click whenever page load was cold); expiry is then triggered
  // deliberately, only once the target upload is positively pending.
  const SESSION_TTL_MS = 10 * 60 * 1000;
  const CLOCK_JUMP_MS = 11 * 60 * 1000;
  await page.clock.install({ time: new Date() });

  // The fake clock is jumped past the first TTL, so the fresh (post-expiry)
  // session's expiry must be placed relative to the jumped browser clock, not
  // the real one, or it would be born already expired.
  let sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'POST') {
      const response = await route.fetch();
      const data = await response.json();
      data.expires_at = sessionExpiresAt;
      await route.fulfill({ response, json: data });
      return;
    }
    return route.continue();
  });

  // Deterministic response gate, not a fixed sleep. The first upload is fetched
  // from the real server, then held at the response boundary so it is *still
  // in flight* when the client clock expires and a fresh session uploads. The
  // stale body is tagged so a generation-guard failure becomes visible instead
  // of silently passing; the handler settles before the test ends, so its
  // `fulfill` can never race context teardown ("Fetch response has been
  // disposed").
  const STALE_FILENAME = 'stale-upload-must-not-resurrect.pdf';
  let releaseStaleUpload = () => {};
  const staleUploadGate = new Promise((resolve) => {
    releaseStaleUpload = resolve;
  });
  let signalStaleHeld = () => {};
  const staleHeld = new Promise((resolve) => {
    signalStaleHeld = resolve;
  });
  let signalStaleSettled = () => {};
  const staleSettled = new Promise((resolve) => {
    signalStaleSettled = resolve;
  });

  let uploadCalls = 0;
  await page.route('**/api/v1/demo/policies', async (route) => {
    uploadCalls += 1;
    if (uploadCalls === 1) {
      const response = await route.fetch();
      const body = await response.json();
      signalStaleHeld();
      await staleUploadGate;
      await route.fulfill({ response, json: { ...body, filename: STALE_FILENAME } });
      signalStaleSettled();
      return;
    }
    return route.continue();
  });

  await openDemo(page);
  await page.getByTestId('upload-input').setInputFiles(PDF_PATH);
  await page.getByTestId('upload-ack').check();
  await page.getByTestId('upload-button').click();

  // The stale upload is positively pending before expiry.
  await staleHeld;

  // Expire deterministically now that the first upload is actually in flight.
  await page.clock.fastForward(CLOCK_JUMP_MS);
  await expect(page.getByTestId('session-expired')).toBeVisible({ timeout: 10_000 });

  // Place the fresh session's expiry beyond the jumped browser clock.
  sessionExpiresAt = new Date(Date.now() + CLOCK_JUMP_MS + SESSION_TTL_MS).toISOString();

  await page.getByTestId('restart-button').click();
  await page.getByTestId('upload-input').setInputFiles(PDF_PATH);
  await page.getByTestId('upload-ack').check();
  await expect(page.getByTestId('upload-button')).toBeEnabled();
  await page.getByTestId('upload-button').click();

  await expect(page.getByTestId('document-summary')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('document-summary')).toContainText('demo-policy.pdf');

  // Release the abandoned response and wait for the route handler to settle
  // before teardown. The fresh document must survive and no stale error surface.
  releaseStaleUpload();
  await staleSettled;
  await expect(page.getByTestId('document-summary')).toBeVisible();
  await expect(page.getByTestId('document-summary')).not.toContainText(STALE_FILENAME);
  await expect(page.getByTestId('error-message')).toHaveCount(0);
});

// ── transport lifecycle: a late cookie-mutating response must not clobber a
//    newer session cookie (the cookie jar is shared, not React state) ────────
//
// `coverai_demo_session` is a single shared cookie. A DELETE that resolves after
// a fresh POST /session clears the cookie the browser just received, even though
// React already discarded the stale DELETE body via its generation guard. These
// acceptance tests assert real Set-Cookie/HTTP behaviour, not an in-page helper.

async function setCookieToken(response) {
  const entries = await response.headersArray();
  const header = entries
    .filter((entry) => entry.name.toLowerCase() === 'set-cookie')
    .map((entry) => entry.value)
    .join('\n');
  const match = /coverai_demo_session=([^;,\s]+)/.exec(header);
  return match ? match[1] : null;
}

async function setCookieHeader(response) {
  const entries = await response.headersArray();
  return entries
    .filter((entry) => entry.name.toLowerCase() === 'set-cookie')
    .map((entry) => entry.value)
    .join('\n');
}

/**
 * Wait for the *browser cookie jar* to settle on a live session and return the
 * final observed status. This observes the eventual outcome only; the ordering
 * that matters is enforced by the held response gate, never by a sleep.
 */
async function settleSessionStatus(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let status = (await page.request.get('/api/v1/demo/session')).status();
  while (status !== 200 && Date.now() < deadline) {
    await page.waitForTimeout(50);
    status = (await page.request.get('/api/v1/demo/session')).status();
  }
  return status;
}

test('a held DELETE 204 response cannot clear a newer session cookie (response-held)', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);

  // The FIRST DELETE is dispatched to the real server with `route.fetch`, so its
  // genuine 204 + clearing `Set-Cookie` is captured — but that successful
  // *response* is withheld from the browser until `route.fulfill` is called.
  // This is a response gate, not a request delay: the server has already cleared
  // the session, and the browser cookie jar is only mutated on release.
  let releaseOldDelete = () => {};
  const oldDeleteGate = new Promise((resolve) => {
    releaseOldDelete = resolve;
  });
  let signalResponseHeld = () => {};
  const responseHeld = new Promise((resolve) => {
    signalResponseHeld = resolve;
  });

  let deleteCount = 0;
  const heldDeleteResponses = [];
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() !== 'DELETE') {
      return route.continue();
    }
    deleteCount += 1;
    if (deleteCount > 1) {
      return route.continue();
    }
    const response = await route.fetch();
    heldDeleteResponses.push({
      status: response.status(),
      setCookie: await setCookieHeader(response),
    });
    signalResponseHeld();
    await oldDeleteGate;
    return route.fulfill({ response });
  });

  await page.getByTestId('reset-button').click();
  await responseHeld;

  // The held response is the real successful delete, and it carries a clearing
  // Set-Cookie for the shared demo capability.
  expect(heldDeleteResponses).toHaveLength(1);
  expect(heldDeleteResponses[0].status).toBe(204);
  expect(heldDeleteResponses[0].setCookie).toContain('coverai_demo_session=');
  expect(heldDeleteResponses[0].setCookie).toMatch(/Max-Age=0/i);

  // A second reset reaches the server, clears the cookie and returns to idle.
  await page.getByTestId('reset-button').click();
  await expect(page.getByTestId('start-button')).toBeVisible();

  const postResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/demo/session') &&
      response.request().method() === 'POST'
  );
  // Positive-control probe: if the POST is issued while the older DELETE
  // *response* is still held (the pre-repair race) this resolves; otherwise it
  // times out and the fresh creation was correctly reserved behind the held 204.
  const postWhileDeleteHeld = page.waitForRequest(
    (request) =>
      request.url().includes('/api/v1/demo/session') && request.method() === 'POST',
    { timeout: 1_200 }
  );
  await page.getByTestId('start-button').click();
  const postSentTooEarly = await postWhileDeleteHeld.then(
    () => true,
    () => false
  );

  // If the client failed to reserve (pre-repair), the POST is already in flight.
  // Let its 201 + new Set-Cookie land *before* releasing the older 204, so the
  // stale clear is then applied last and clobbers the newer cookie. A reserved
  // creation has not sent its POST yet, so it only runs after release.
  let created;
  if (postSentTooEarly) {
    created = await postResponsePromise;
  }
  releaseOldDelete();
  if (!postSentTooEarly) {
    created = await postResponsePromise;
  }

  expect(created.status()).toBe(201);
  const savedToken = await setCookieToken(created);
  expect(savedToken).toBeTruthy();

  // The saved capability is a real, live server session.
  const savedView = await page.request.get('/api/v1/demo/session', {
    headers: { Cookie: `coverai_demo_session=${savedToken}` },
  });
  const browserStatus = await settleSessionStatus(page, 4_000);

  // Single combined assertion so a pre-repair failure reports the whole race:
  // the POST went out while the 204 was held, and the browser cookie ended up
  // cleared (401) even though the saved capability is a live session (200).
  expect({
    postSentTooEarly,
    savedCapability: savedView.status(),
    browserCookie: browserStatus,
  }).toEqual({ postSentTooEarly: false, savedCapability: 200, browserCookie: 200 });
});

test('a held DELETE 204 response released before the next start keeps the new cookie (response-held control)', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);

  let releaseOldDelete = () => {};
  const oldDeleteGate = new Promise((resolve) => {
    releaseOldDelete = resolve;
  });
  let signalResponseHeld = () => {};
  const responseHeld = new Promise((resolve) => {
    signalResponseHeld = resolve;
  });

  let deleteCount = 0;
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() !== 'DELETE') {
      return route.continue();
    }
    deleteCount += 1;
    if (deleteCount > 1) {
      return route.continue();
    }
    const response = await route.fetch();
    signalResponseHeld();
    await oldDeleteGate;
    return route.fulfill({ response });
  });

  await page.getByTestId('reset-button').click();
  await responseHeld;
  // Release the real 204 *before* starting, preserving response order.
  releaseOldDelete();
  await expect(page.getByTestId('start-button')).toBeVisible();

  const postResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/demo/session') &&
      response.request().method() === 'POST'
  );
  await page.getByTestId('start-button').click();
  const created = await postResponsePromise;
  expect(created.status()).toBe(201);
  expect(await setCookieToken(created)).toBeTruthy();

  await expect
    .poll(async () => (await page.request.get('/api/v1/demo/session')).status())
    .toBe(200);
});

test('an ordered reset then fresh session keeps the new cookie (control)', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);

  await page.getByTestId('reset-button').click();
  await expect(page.getByTestId('start-button')).toBeVisible();

  const postResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/demo/session') &&
      response.request().method() === 'POST'
  );
  await page.getByTestId('start-button').click();
  const created = await postResponsePromise;
  expect(created.status()).toBe(201);
  expect(await setCookieToken(created)).toBeTruthy();

  await expect
    .poll(async () => (await page.request.get('/api/v1/demo/session')).status())
    .toBe(200);
});

// ── transport reservation: a mutation must be reserved synchronously, so an
//    operation that is merely *queued* still blocks a later operation ────────
//
// The tests above drive the app UI. These drive the real production client
// transport directly in a browser (transpiled from src/demo/client.ts and
// injected into a blank same-origin harness page) so they can issue cookie
// mutations in the same tick — the exact interleaving the UI cannot produce.
// They still use the genuine same-origin proxy, the real browser cookie jar and
// real Set-Cookie responses.

async function openRaceHarness(page) {
  await page.route('**/__demo_race_harness__', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body></body></html>',
    });
  });
  await page.goto('/__demo_race_harness__');
  await injectDemoClient(page);
}

test('a same-tick reset then fresh start is not cleared by the queued DELETE (real cookie)', async ({
  page,
}) => {
  await openRaceHarness(page);

  const csrf = await page.evaluate(async () => {
    const created = await /** @type {any} */ (window).__demoClient.createSession();
    return created.csrf_token;
  });
  expect(typeof csrf).toBe('string');
  expect(csrf.length).toBeGreaterThan(0);

  let signalDeleteSeen = () => {};
  const deleteSeen = new Promise((resolve) => {
    signalDeleteSeen = resolve;
  });
  let releaseDelete = () => {};
  const deleteGate = new Promise((resolve) => {
    releaseDelete = resolve;
  });

  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'DELETE') {
      signalDeleteSeen();
      await deleteGate;
    }
    return route.continue();
  });

  try {
    // Positive-control probe: if the POST is sent while the DELETE is still held
    // (the pre-repair reservation race) this resolves; otherwise it times out and
    // the mutation was correctly ordered behind the DELETE.
    const postWhileDeleteHeld = page.waitForRequest(
      (request) =>
        request.url().includes('/api/v1/demo/session') && request.method() === 'POST',
      { timeout: 1_200 }
    );

    await page.evaluate((token) => {
      const client = /** @type {any} */ (window).__demoClient;
      client.resetSession(token).catch(() => undefined);
      /** @type {any} */ (window).__raceCreate = client.createSession();
    }, csrf);
    await deleteSeen;

    const postSentTooEarly = await postWhileDeleteHeld.then(
      () => true,
      () => false
    );
    expect(postSentTooEarly).toBe(false);
  } finally {
    releaseDelete();
  }

  await page.evaluate(async () => {
    await /** @type {any} */ (window).__raceCreate;
  });

  // The browser cookie is the fresh capability, not the one the DELETE cleared.
  await expect
    .poll(async () => (await page.request.get('/api/v1/demo/session')).status())
    .toBe(200);
});

test('a reset queued behind an in-flight POST is honored before the next start (real cookie)', async ({
  page,
}) => {
  await openRaceHarness(page);

  const csrf = await page.evaluate(async () => {
    const created = await /** @type {any} */ (window).__demoClient.createSession();
    return created.csrf_token;
  });

  const events = [];
  let releasePost = () => {};
  const postGate = new Promise((resolve) => {
    releasePost = resolve;
  });
  let releaseDelete = () => {};
  const deleteGate = new Promise((resolve) => {
    releaseDelete = resolve;
  });
  let signalDeleteSeen = () => {};
  const deleteSeen = new Promise((resolve) => {
    signalDeleteSeen = resolve;
  });

  await page.route('**/api/v1/demo/session', async (route) => {
    const method = route.request().method();
    events.push(method);
    if (method === 'POST') {
      await postGate;
    }
    if (method === 'DELETE') {
      signalDeleteSeen();
      await deleteGate;
    }
    return route.continue();
  });

  // Start a POST and hold it before it reaches the server.
  await page.evaluate(() => {
    /** @type {any} */ (window).__pendingCreate = /** @type {any} */ (
      window
    ).__demoClient.createSession();
  });
  await expect.poll(() => events.includes('POST')).toBe(true);

  // A reset now queues behind the pending POST.
  await page.evaluate((token) => {
    /** @type {any} */ (window).__pendingReset = /** @type {any} */ (
      window
    ).__demoClient.resetSession(token).catch(() => undefined);
  }, csrf);

  releasePost();
  await page.evaluate(async () => {
    await /** @type {any} */ (window).__pendingCreate;
  });
  await deleteSeen;

  // A fresh start must wait for the DELETE rather than crossing it.
  await page.evaluate(() => {
    /** @type {any} */ (window).__nextCreate = /** @type {any} */ (
      window
    ).__demoClient.createSession();
  });

  releaseDelete();
  await page.evaluate(async () => {
    await Promise.all([
      /** @type {any} */ (window).__pendingReset,
      /** @type {any} */ (window).__nextCreate,
    ]);
  });

  const firstPost = events.indexOf('POST');
  const deleteAt = events.indexOf('DELETE');
  const lastPost = events.lastIndexOf('POST');
  expect(firstPost).toBeGreaterThanOrEqual(0);
  expect(deleteAt).toBeGreaterThan(firstPost);
  expect(lastPost).toBeGreaterThan(deleteAt);

  await expect
    .poll(async () => (await page.request.get('/api/v1/demo/session')).status())
    .toBe(200);
});
