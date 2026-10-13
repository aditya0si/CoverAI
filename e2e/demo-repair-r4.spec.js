// @ts-check
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const {
  PDF_PATH,
  NARRATIVE,
  openDemo,
  uploadPolicy,
  explainNarrative,
} = require('./demo-helpers');

/**
 * coverai independent-review repair — RED browser regressions (r4).
 *
 * These run against a real browser, the real same-origin proxy and the real demo
 * API; they are expected to FAIL on the current tree and pass only after the
 * GREEN repair. Findings covered here:
 *
 *   1  a successful PDF replacement must invalidate the browser generation,
 *      clear narrative/explanation/citation/inboxes, and a held, already
 *      server-committed explanation response must never reappear (asserted only
 *      after explicit evidence that the stale response was delivered/parsed).
 *   5  a startup failure/401 must leave a usable retry / new-session control.
 * Proof gaps:
 *      reload and shared tabs must GET/resume the existing session instead of
 *      POSTing a new one that invalidates another tab; refresh preserves the
 *      document and simulated handoffs; the narrative is never persisted.
 *
 * Runs on the dedicated repair ports via playwright.demo-repair.config.js.
 */

const REPLACEMENT = {
  name: 'demo-policy-v2.pdf',
  mimeType: 'application/pdf',
  buffer: fs.readFileSync(PDF_PATH),
};

async function sessionView(page) {
  return (await page.request.get('/api/v1/demo/session')).json();
}

async function replacePolicy(page) {
  await page.getByTestId('upload-input').setInputFiles(REPLACEMENT);
  const ack = page.getByTestId('upload-ack');
  if (!(await ack.isChecked())) await ack.check();
  await page.getByTestId('upload-button').click();
  await expect(page.getByTestId('document-summary')).toContainText('revision 2', {
    timeout: 30_000,
  });
}

async function uploadReplacementWhileModalOpen(page) {
  await page.getByTestId('upload-input').setInputFiles(REPLACEMENT);
  await page.getByTestId('upload-ack').evaluate((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    if (!input.checked) {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.getByTestId('upload-button').dispatchEvent('click');
}

function retryControl(page) {
  return page
    .getByTestId('start-button')
    .or(page.getByTestId('retry-button'))
    .or(page.getByTestId('restart-button'));
}

// ── finding 1: replacement clears local state ──────────────────────────────
test('successful replacement clears narrative, explanation and simulated inboxes', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);
  await page.getByTestId('handoff-button').click();
  await expect(page.getByTestId('inbox-mechanic').getByTestId('inbox-entry')).toHaveCount(1);
  expect(await page.getByTestId('narrative-input').inputValue()).toBe(NARRATIVE);

  await replacePolicy(page);

  await expect(page.getByTestId('document-summary')).toContainText('demo-policy-v2.pdf');
  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);
  await expect(page.getByTestId('simulated-inboxes')).toHaveCount(0);
  await expect(page.getByTestId('citation-panel')).toHaveCount(0);
  expect(await page.getByTestId('narrative-input').inputValue()).toBe('');
});

test('successful replacement closes an open citation panel', async ({ page }) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);
  await page.getByTestId('citation-button').first().click();
  await expect(page.getByTestId('citation-panel')).toBeVisible();

  await uploadReplacementWhileModalOpen(page);

  await expect(page.getByTestId('document-summary')).toContainText('revision 2', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('citation-panel')).toHaveCount(0);
});

test('a held already-committed explanation cannot reappear after a successful replacement', async ({
  page,
}) => {
  // Record, in the page, that the explanation fetch actually completed and what
  // body it carried. This makes the later negative assertions wait for real
  // application handling instead of passing on premature absence.
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const input = args[0];
      const url = typeof input === 'string' ? input : input && input.url;
      const method = (args[1] && args[1].method) || 'GET';
      const isExplain =
        Boolean(url) && url.includes('/api/v1/demo/explanations') && method === 'POST';
      try {
        const response = await originalFetch(...args);
        if (isExplain) {
          const clone = response.clone();
          clone
            .json()
            .then((body) => {
              /** @type {any} */ (window).__staleExplanationBody = body;
            })
            .catch(() => undefined)
            .finally(() => {
              /** @type {any} */ (window).__staleExplanationSettled = true;
            });
        }
        return response;
      } catch (error) {
        // A cancellation is a valid outcome of the repair; record it as handled.
        if (isExplain) {
          /** @type {any} */ (window).__staleExplanationAborted = true;
          /** @type {any} */ (window).__staleExplanationSettled = true;
        }
        throw error;
      }
    };
  });

  await openDemo(page);
  await uploadPolicy(page);
  const oldDocumentId = (await sessionView(page)).document.id;

  let releaseExplanation = () => {};
  const explanationGate = new Promise((resolve) => {
    releaseExplanation = resolve;
  });
  let signalHeld = () => {};
  const held = new Promise((resolve) => {
    signalHeld = resolve;
  });
  let signalSettled = () => {};
  const settled = new Promise((resolve) => {
    signalSettled = resolve;
  });

  await page.route('**/api/v1/demo/explanations', async (route) => {
    // The real server commits and answers; the response is then withheld.
    const response = await route.fetch();
    signalHeld();
    await explanationGate;
    try {
      await route.fulfill({ response });
    } catch {
      // The client may have aborted the request once the replacement landed;
      // that cancellation is the intended outcome, not a test failure.
    } finally {
      signalSettled();
    }
  });

  await page.getByTestId('narrative-input').fill(NARRATIVE);
  const request = page.waitForRequest(
    (req) => req.url().includes('/api/v1/demo/explanations') && req.method() === 'POST'
  );
  await page.getByTestId('explain-button').click();
  await request;
  await held;

  await replacePolicy(page);

  releaseExplanation();
  await settled;
  // Explicit evidence the stale request was actually handled: either the body
  // was delivered (and must be the OLD document's, then discarded) or the
  // request was aborted as the replacement invalidated its generation.
  await page.waitForFunction(
    () => /** @type {any} */ (window).__staleExplanationSettled === true
  );
  const stale = await page.evaluate(() => ({
    body: /** @type {any} */ (window).__staleExplanationBody ?? null,
    aborted: /** @type {any} */ (window).__staleExplanationAborted === true,
  }));
  expect(stale.aborted || stale.body).toBeTruthy();
  if (stale.body) {
    expect(stale.body.document_id).toBe(oldDocumentId);
  }
  // Let React flush the completion of the fetch/abort.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );

  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);
  await expect(page.getByTestId('document-summary')).toContainText('demo-policy-v2.pdf');
});

// ── finding 5: startup failure / 401 leaves a usable retry ─────────────────
test('a failed initial session creation leaves a usable retry control', async ({ page }) => {
  let fail = true;
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'POST' && fail) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'boom', request_id: 't' },
        }),
      });
    }
    return route.continue();
  });

  await openDemo(page);
  await expect(page.getByTestId('error-message')).toBeVisible();

  const retry = retryControl(page);
  await expect(retry).toBeVisible();

  fail = false;
  await retry.click();
  await expect(page.getByTestId('expiry-countdown')).not.toContainText('—', {
    timeout: 15_000,
  });
});

test('a 401 initial session creation leaves a usable retry control', async ({ page }) => {
  let fail = true;
  await page.route('**/api/v1/demo/session', async (route) => {
    if (route.request().method() === 'POST' && fail) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SESSION_MISSING', message: 'missing', request_id: 't' },
        }),
      });
    }
    return route.continue();
  });

  await openDemo(page);
  await expect(page.getByTestId('error-message')).toBeVisible();

  const retry = retryControl(page);
  await expect(retry).toBeVisible();

  fail = false;
  await retry.click();
  await expect(page.getByTestId('expiry-countdown')).not.toContainText('—', {
    timeout: 15_000,
  });
});

// ── proof gaps: reload / shared tabs resume rather than recreate ───────────
test('reload resumes the existing document and handoffs without a new session', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);
  await page.getByTestId('handoff-button').click();
  await expect(page.getByTestId('inbox-mechanic').getByTestId('inbox-entry')).toHaveCount(1);
  const documentId = (await sessionView(page)).document.id;

  let createPosts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/v1/demo/session')) {
      createPosts += 1;
    }
  });

  await page.reload();
  await expect(page.getByTestId('simulation-warning')).toBeVisible();

  await expect(page.getByTestId('document-summary')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('document-summary')).toContainText('demo-policy.pdf');
  expect((await sessionView(page)).document?.id).toBe(documentId);
  expect(createPosts).toBe(0);

  // Handoffs are resumed honestly; the narrative is never persisted client-side.
  await expect(page.getByTestId('inbox-mechanic').getByTestId('inbox-entry')).toHaveCount(1);
  expect(await page.getByTestId('narrative-input').inputValue()).toBe('');
});

test('a second tab resumes the shared session without invalidating the first', async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const page1 = await context.newPage();
    await openDemo(page1);
    await uploadPolicy(page1);
    const firstViewBefore = await (await page1.request.get('/api/v1/demo/session')).json();
    const firstDocumentId = firstViewBefore.document.id;

    const page2 = await context.newPage();
    await openDemo(page2);
    await expect(page2.getByTestId('document-summary')).toBeVisible({ timeout: 15_000 });
    await expect(page2.getByTestId('document-summary')).toContainText('demo-policy.pdf');

    const firstView = await (await page1.request.get('/api/v1/demo/session')).json();
    expect(firstView.document?.id).toBe(firstDocumentId);
  } finally {
    await context.close();
  }
});

test('explicit restart invalidates the previous capability (control)', async ({
  page,
  context,
  request,
}) => {
  await openDemo(page);
  await uploadPolicy(page);
  const documentId = (await sessionView(page)).document.id;
  const oldCookie = (await context.cookies()).find(
    (cookie) => cookie.name === 'coverai_demo_session'
  );
  expect(oldCookie?.value).toBeTruthy();

  await page.getByTestId('reset-button').click();
  await expect(page.getByTestId('start-button')).toBeVisible();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('expiry-countdown')).not.toContainText('—', {
    timeout: 15_000,
  });

  // The previous capability is invalidated server-side: presenting the old
  // token returns 401 (session missing), not merely a hidden page.
  const oldView = await request.get('/api/v1/demo/session', {
    headers: { Cookie: `coverai_demo_session=${oldCookie?.value}` },
  });
  expect(oldView.status()).toBe(401);

  await expect
    .poll(async () => {
      const response = await page.request.get(
        `/api/v1/demo/policies/${documentId}/pages/1`
      );
      return [401, 404, 410].includes(response.status());
    })
    .toBe(true);
  await expect(page.getByTestId('document-summary')).toHaveCount(0);
});
