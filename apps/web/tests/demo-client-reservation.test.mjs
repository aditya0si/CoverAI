// @ts-check
/**
 * Deterministic transport-layer acceptance for the demo cookie-mutation
 * serialization in `apps/web/src/demo/client.ts`.
 *
 * The anonymous demo capability lives in one shared `coverai_demo_session`
 * cookie, and only the `POST /session` / `DELETE /session` responses write it.
 * If a DELETE response can be applied after a newer POST, the newer capability
 * is silently cleared. This suite drives the *real* production module with a
 * controlled `fetch` and asserts the ordering invariant using promise gates
 * only (no sleeps, no fake helpers).
 *
 * Run from the repository root:
 *
 *   node --test apps/web/tests/demo-client-reservation.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';

let moduleCounter = 0;

/**
 * Import a fresh instance of the production module so each case starts with no
 * residual queue state. Type stripping runs the TypeScript source directly.
 */
async function loadClient() {
  moduleCounter += 1;
  return import(`../src/demo/client.ts?case=${moduleCounter}`);
}

function sessionBody() {
  return {
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    csrf_token: 'csrf-test',
    mode: 'deterministic',
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Yield to the macrotask queue so every pending microtask chain runs. */
function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

function installFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

test('a fresh create never starts its POST while an earlier DELETE is outstanding', async () => {
  const { createSession, resetSession } = await loadClient();
  const events = [];
  let releaseDelete = () => {};
  const deleteGate = new Promise((resolve) => {
    releaseDelete = resolve;
  });

  const restore = installFetch(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    events.push(`start:${method}`);
    if (method === 'DELETE') {
      await deleteGate;
      events.push('end:DELETE');
      return new Response(null, { status: 204 });
    }
    if (method === 'POST') {
      events.push('end:POST');
      return jsonResponse(201, sessionBody());
    }
    throw new Error(`unexpected ${method} ${url}`);
  });

  try {
    // Same synchronous tick: a reset (DELETE) is reserved first, then a fresh
    // start (POST). The reservation must be visible immediately, so the POST is
    // ordered behind the DELETE even though neither fetch has been sent yet.
    const reset = resetSession('csrf-test').catch(() => undefined);
    const created = createSession();
    await flushAsync();

    assert.ok(
      !events.includes('start:POST'),
      `POST must not start while the DELETE is outstanding; observed ${events.join(', ')}`
    );

    releaseDelete();
    await Promise.all([reset, created]);

    assert.ok(events.includes('start:DELETE'), `expected a DELETE; observed ${events.join(', ')}`);
    assert.ok(events.includes('end:DELETE'), `expected the DELETE to settle; observed ${events.join(', ')}`);
    assert.ok(
      events.indexOf('start:POST') > events.indexOf('end:DELETE'),
      `POST must start only after the DELETE settles; observed ${events.join(', ')}`
    );
  } finally {
    releaseDelete();
    restore();
  }
});

test('overlapping creations coalesce and a queued delete is counted before a later create', async () => {
  const { createSession, resetSession } = await loadClient();
  const events = [];
  let releaseCreate = () => {};
  let releaseDelete = () => {};
  const createGate = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  const deleteGate = new Promise((resolve) => {
    releaseDelete = resolve;
  });

  const restore = installFetch(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    if (method === 'POST') {
      events.push('start:POST');
      await createGate;
      events.push('end:POST');
      return jsonResponse(201, sessionBody());
    }
    if (method === 'DELETE') {
      events.push('start:DELETE');
      await deleteGate;
      events.push('end:DELETE');
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected ${method} ${url}`);
  });

  const postStarts = () => events.filter((event) => event === 'start:POST').length;

  try {
    const first = createSession();
    await flushAsync();
    assert.equal(postStarts(), 1, `expected one POST; observed ${events.join(', ')}`);

    // A reset enqueued behind the outstanding creation must wait for it.
    const reset = resetSession('csrf-test').catch(() => undefined);
    await flushAsync();
    assert.ok(
      !events.includes('start:DELETE'),
      `DELETE must wait for the outstanding POST; observed ${events.join(', ')}`
    );

    // Overlapping starts share the reserved creation rather than adding a POST.
    assert.equal(createSession(), first, 'overlapping creations must coalesce');

    releaseCreate();
    await first;
    await flushAsync();
    assert.ok(events.includes('start:DELETE'), `DELETE must run after the POST settles`);

    // The DELETE is now the outstanding mutation. A later create must reserve
    // behind it and must not send a POST before the DELETE settles.
    const later = createSession();
    await flushAsync();
    assert.equal(
      postStarts(),
      1,
      `a create must not cross an outstanding DELETE; observed ${events.join(', ')}`
    );

    releaseDelete();
    await Promise.all([reset, later]);
    assert.equal(postStarts(), 2, `the later create should send exactly one POST`);
    assert.ok(
      events.lastIndexOf('start:POST') > events.indexOf('end:DELETE'),
      `the later POST must start after the DELETE settles; observed ${events.join(', ')}`
    );
  } finally {
    releaseCreate();
    releaseDelete();
    restore();
  }
});
