// @ts-check
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { PDF_PATH, NARRATIVE, openDemo, uploadPolicy, explainNarrative } = require('./demo-helpers');

/**
 * coverai-r5 browser regressions — lifecycle continuation after replacement.
 *
 * The r4 finding proved a successful replacement discards a held, already
 * server-committed explanation response. It stopped at *absence* assertions and
 * therefore missed the class-level lifecycle failure: the replacement rotates
 * the generation but did not retire `explaining` / `handoffBusy`. The aborted
 * operation's `finally` then refused to clear its flag (generation mismatch), so
 * the explain/handoff controls stayed permanently disabled and the only recovery
 * was a full reload/reset.
 *
 * These tests drive the real browser, proxy and demo API and require the
 * visitor to complete a NEW narrative / explanation / handoff after a
 * replacement — without reloading — under both a real abort and an actually
 * delivered stale success and error. They also cover a failed replacement /
 * retry and multiple replacement / new-operation ownership races.
 *
 * Runs on the dedicated repair ports from playwright.demo-repair.config.js.
 */

const REPLACEMENT = {
  name: 'demo-policy-v2.pdf',
  mimeType: 'application/pdf',
  buffer: fs.readFileSync(PDF_PATH),
};
const REPLACEMENT_V3 = {
  name: 'demo-policy-v3.pdf',
  mimeType: 'application/pdf',
  buffer: fs.readFileSync(PDF_PATH),
};
const NEW_NARRATIVE = 'my parked car was struck by a falling branch during a storm';
const ANOTHER_NARRATIVE = 'the windscreen shattered while the vehicle was parked outside';

async function sessionView(page) {
  return (await page.request.get('/api/v1/demo/session')).json();
}

async function replacePolicy(page, payload = REPLACEMENT, revision = 2) {
  await page.getByTestId('upload-input').setInputFiles(payload);
  const ack = page.getByTestId('upload-ack');
  if (!(await ack.isChecked())) await ack.check();
  await page.getByTestId('upload-button').click();
  await expect(page.getByTestId('document-summary')).toContainText(`revision ${revision}`, {
    timeout: 30_000,
  });
}

async function continueWithNewExplanation(page, narrative = NEW_NARRATIVE) {
  await page.getByTestId('narrative-input').fill(narrative);
  const button = page.getByTestId('explain-button');
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
  await expect(page.getByTestId('explanation-panel')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('submitted-narrative')).toHaveText(narrative);
}

async function expectHandoffWorks(page) {
  await page.getByTestId('handoff-button').click();
  await expect(page.getByTestId('inbox-mechanic').getByTestId('inbox-entry')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('inbox-officer').getByTestId('inbox-entry')).toHaveCount(1);
}

// ── real abort: the replacement aborts the held explanation ────────────────
test('a replacement that aborts a held explanation still allows a fresh explanation and handoff', async ({
  page,
}) => {
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
          response
            .clone()
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
    const response = await route.fetch();
    signalHeld();
    await explanationGate;
    try {
      await route.fulfill({ response });
    } catch {
      // Aborted by the replacement: the intended outcome.
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
  await page.waitForFunction(
    () => /** @type {any} */ (window).__staleExplanationSettled === true
  );
  const stale = await page.evaluate(() => ({
    body: /** @type {any} */ (window).__staleExplanationBody ?? null,
    aborted: /** @type {any} */ (window).__staleExplanationAborted === true,
  }));
  expect(stale.aborted || stale.body).toBeTruthy();
  if (stale.body) expect(stale.body.document_id).toBe(oldDocumentId);
  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);

  // The continuation that r4 missed: a brand-new explanation and handoff.
  await continueWithNewExplanation(page);
  await expectHandoffWorks(page);
});

// ── held stale success actually delivered (abort signal dropped) ───────────
test('an actually delivered stale explanation is discarded and a fresh one still runs', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    let dropNextAbort = true;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input && input.url;
      const method = (init && init.method) || 'GET';
      const isExplain =
        Boolean(url) && url.includes('/api/v1/demo/explanations') && method === 'POST';
      const options = { ...(init || {}) };
      if (isExplain && dropNextAbort) {
        dropNextAbort = false;
        // Force the held body to be delivered even after the replacement, so the
        // stale-success branch (not the abort branch) is exercised.
        delete options.signal;
      }
      try {
        const response = await realFetch(input, options);
        if (isExplain) {
          response
            .clone()
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
    const response = await route.fetch();
    signalHeld();
    await explanationGate;
    try {
      await route.fulfill({ response });
    } catch {
      /* ignore */
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
  await page.waitForFunction(
    () => /** @type {any} */ (window).__staleExplanationSettled === true
  );

  // Proof this is the delivered-success branch, not the abort branch.
  const stale = await page.evaluate(() => ({
    body: /** @type {any} */ (window).__staleExplanationBody ?? null,
    aborted: /** @type {any} */ (window).__staleExplanationAborted === true,
  }));
  expect(stale.aborted).toBe(false);
  expect(stale.body).toBeTruthy();
  expect(stale.body.document_id).toBe(oldDocumentId);

  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);

  await continueWithNewExplanation(page);
  await expectHandoffWorks(page);
});

// ── held stale error delivered after replacement ──────────────────────────
test('a stale explanation error delivered after a replacement does not block a fresh explanation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    let dropNextAbort = true;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input && input.url;
      const method = (init && init.method) || 'GET';
      const isExplain =
        Boolean(url) && url.includes('/api/v1/demo/explanations') && method === 'POST';
      const options = { ...(init || {}) };
      if (isExplain && dropNextAbort) {
        dropNextAbort = false;
        delete options.signal;
      }
      const response = await realFetch(input, options);
      if (isExplain) {
        /** @type {any} */ (window).__staleExplainResponseStatus = response.status;
        /** @type {any} */ (window).__staleExplanationSettled = true;
      }
      return response;
    };
  });

  await openDemo(page);
  await uploadPolicy(page);

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

  let explanationCalls = 0;
  await page.route('**/api/v1/demo/explanations', async (route) => {
    explanationCalls += 1;
    // Only the first (stale) request is committed then answered with a held 500.
    // The continuation explanation must reach the real server.
    if (explanationCalls > 1) return route.continue();
    await route.fetch();
    signalHeld();
    await explanationGate;
    try {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'late', request_id: 't' },
        }),
      });
    } catch {
      /* ignore */
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
  await page.waitForFunction(
    () => /** @type {any} */ (window).__staleExplanationSettled === true
  );
  expect(await page.evaluate(() => /** @type {any} */ (window).__staleExplainResponseStatus)).toBe(
    500
  );

  // The stale error must not surface once the generation it belonged to is gone.
  await expect(page.getByTestId('error-message')).toHaveCount(0);
  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);

  await continueWithNewExplanation(page, ANOTHER_NARRATIVE);
});

// ── handoffBusy: a held handoff across a replacement ──────────────────────
test('a handoff held across a replacement does not leave the handoff control stuck', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);

  let releaseHandoff = () => {};
  const handoffGate = new Promise((resolve) => {
    releaseHandoff = resolve;
  });
  let signalHeld = () => {};
  const held = new Promise((resolve) => {
    signalHeld = resolve;
  });
  let signalSettled = () => {};
  const settled = new Promise((resolve) => {
    signalSettled = resolve;
  });

  await page.route('**/api/v1/demo/handoffs', async (route) => {
    const response = await route.fetch();
    signalHeld();
    await handoffGate;
    try {
      await route.fulfill({ response });
    } catch {
      /* ignore */
    } finally {
      signalSettled();
    }
  });

  const request = page.waitForRequest(
    (req) => req.url().includes('/api/v1/demo/handoffs') && req.method() === 'POST'
  );
  await page.getByTestId('handoff-button').click();
  await request;
  await held;

  await replacePolicy(page);
  releaseHandoff();
  await settled;

  await expect(page.getByTestId('simulated-handoffs')).toHaveCount(0);

  await continueWithNewExplanation(page);
  await expectHandoffWorks(page);
});

// ── failed replacement preserves the current explanation, retry succeeds ───
test('a failed replacement preserves the current explanation and a retry succeeds', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);
  await explainNarrative(page, NARRATIVE);

  let fail = true;
  await page.route('**/api/v1/demo/policies', async (route) => {
    if (route.request().method() === 'POST' && fail) {
      fail = false;
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

  await page.getByTestId('upload-input').setInputFiles(REPLACEMENT);
  await page.getByTestId('upload-button').click();

  // The failure surfaces and the prior document, explanation and narrative stay.
  await expect(page.getByTestId('error-message')).toBeVisible();
  await expect(page.getByTestId('document-summary')).toContainText('demo-policy.pdf');
  await expect(page.getByTestId('explanation-panel')).toBeVisible();
  expect(await page.getByTestId('narrative-input').inputValue()).toBe(NARRATIVE);
  await expect(page.getByTestId('explain-button')).toBeEnabled();

  // Retry (now unimpeded) replaces and clears the prior explanation.
  await page.getByTestId('upload-button').click();
  await expect(page.getByTestId('document-summary')).toContainText('revision 2', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);

  await continueWithNewExplanation(page);
});

// ── multiple replacement / new-operation ownership race ────────────────────
test('two replacements during a held explanation leave only the newest document and a usable explain', async ({
  page,
}) => {
  await openDemo(page);
  await uploadPolicy(page);

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
    const response = await route.fetch();
    signalHeld();
    await explanationGate;
    try {
      await route.fulfill({ response });
    } catch {
      /* ignore */
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

  await replacePolicy(page, REPLACEMENT, 2);
  await replacePolicy(page, REPLACEMENT_V3, 3);

  releaseExplanation();
  await settled;

  await expect(page.getByTestId('document-summary')).toContainText('demo-policy-v3.pdf');
  await expect(page.getByTestId('document-summary')).toContainText('revision 3');
  await expect(page.getByTestId('explanation-panel')).toHaveCount(0);
  await expect(page.getByTestId('error-message')).toHaveCount(0);

  await continueWithNewExplanation(page, ANOTHER_NARRATIVE);
  await expectHandoffWorks(page);
});
