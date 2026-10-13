/**
 * Same-origin demo client. It never imports lib/auth, never attaches an
 * Authorization header and never talks to production API routes.
 */

import type {
  DocumentSummary,
  Explanation,
  Handoff,
  InboxName,
  InboxResponse,
  PageText,
  SessionCreated,
  SessionView,
} from './contracts';

const BASE = '/api/v1/demo';

export class DemoApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'DemoApiError';
    this.status = status;
    this.code = code;
  }
}

async function toError(response: Response): Promise<DemoApiError> {
  let code = `HTTP_${response.status}`;
  let message = response.statusText || 'Request failed';
  try {
    const data = await response.json();
    if (data && data.error) {
      code = data.error.code ?? code;
      message = data.error.message ?? message;
    }
  } catch {
    /* non-JSON error body */
  }
  return new DemoApiError(response.status, code, message);
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  csrf?: string | null;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, csrf, idempotencyKey, signal } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['X-Demo-CSRF'] = csrf;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ── shared cookie-mutation serialization ─────────────────────────────────
//
// The demo capability lives in a single cookie (`coverai_demo_session`) that the
// browser shares across the whole origin. Only two demo calls mutate it through
// their *responses*: `POST /session` (sets a new capability) and
// `DELETE /session` (clears it). Those response headers are applied by the
// browser itself, outside React. If the responses can be observed out of order,
// an older DELETE can clear the cookie the browser just received from a newer
// POST — silently signing the tab out of a session it still holds a CSRF
// capability for. A JS generation/abort guard only discards the stale *body*;
// it cannot un-clobber the cookie the browser already wrote.
//
// The queue below orders those response writes. Every mutation *reserves* a slot
// synchronously when it is enqueued — before it starts waiting — so a mutation
// that is merely queued is already visible to anything enqueued after it:
//
//   * a creation waits for every DELETE reserved before it;
//   * a DELETE waits for the creation reserved before it (there is at most one,
//     because creations coalesce);
//   * DELETEs do not wait for each other: clearing the same cookie is idempotent
//     and order-independent, so concurrent clears are safe and let a second
//     reset proceed while an earlier one is still in flight.
//
// The wait graph stays acyclic: a DELETE can only wait for a creation that
// precedes it, and a creation can only wait for deletes that precede it.
//
// Limitation (documented, not solved here): this queue is per browsing context
// (per tab). Two tabs share the cookie jar but not this module state, and there
// is no globally shared account or cross-tab broker (e.g. BroadcastChannel).
// The demo has no global shared accounts, so that residual cross-tab race is
// accepted; global shared-tab safety is explicitly NOT claimed.
interface MutationTicket {
  readonly settled: Promise<void>;
  settle: () => void;
}

function createTicket(): MutationTicket {
  let settle: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { settled, settle };
}

// Every DELETE reserved (enqueued) but not yet settled. A creation snapshots
// this set so it waits only for deletes reserved before it; a delete reserved
// later waits for the creation instead.
const pendingDeletes = new Set<MutationTicket>();

// The creation reserved right now: queued behind outstanding deletes or already
// executing. At most one exists because overlapping `start()` attempts coalesce.
let pendingSessionCreation: Promise<SessionCreated> | null = null;

export function createSession(signal?: AbortSignal): Promise<SessionCreated> {
  // Coalesce overlapping creations: a second `start()` while one is reserved —
  // even while it is still queued behind a DELETE — shares the single POST.
  if (pendingSessionCreation) return pendingSessionCreation;

  // Reserve synchronously so a DELETE enqueued after this point must wait for
  // this creation, even though no POST has been sent yet.
  const deletesAhead = Array.from(pendingDeletes, (ticket) => ticket.settled);
  const creation = Promise.all(deletesAhead)
    .then(() => request<SessionCreated>('/session', { method: 'POST', body: {}, signal }))
    .finally(() => {
      pendingSessionCreation = null;
    });
  pendingSessionCreation = creation;
  return creation;
}

export function getSession(signal?: AbortSignal): Promise<SessionView> {
  return request<SessionView>('/session', { signal });
}

export function resetSession(csrf: string, signal?: AbortSignal): Promise<void> {
  // Reserve synchronously so a creation enqueued after this point snapshots this
  // ticket and waits for the DELETE to settle.
  const ticket = createTicket();
  pendingDeletes.add(ticket);

  // Snapshot the creation outstanding at reservation time; the DELETE response
  // must not be able to land before that creation's Set-Cookie. A creation
  // enqueued later waits for this DELETE instead, so the wait stays acyclic.
  const createAhead = pendingSessionCreation;
  const deleteRequest = (createAhead
    ? createAhead.then(
        () => undefined,
        () => undefined
      )
    : Promise.resolve()
  ).then(() => request<void>('/session', { method: 'DELETE', csrf, signal }));

  return deleteRequest.then(
    () => {
      pendingDeletes.delete(ticket);
      ticket.settle();
    },
    (error) => {
      pendingDeletes.delete(ticket);
      ticket.settle();
      throw error;
    }
  );
}

export async function uploadPolicy(
  file: File,
  csrf: string,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<DocumentSummary> {
  const form = new FormData();
  form.append('file', file, file.name);
  const response = await fetch(`${BASE}/policies`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { 'X-Demo-CSRF': csrf, 'Idempotency-Key': idempotencyKey },
  });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as DocumentSummary;
}

export function explain(
  documentId: string,
  documentRevision: number,
  narrative: string,
  csrf: string,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<Explanation> {
  return request<Explanation>('/explanations', {
    method: 'POST',
    csrf,
    idempotencyKey,
    signal,
    body: {
      document_id: documentId,
      document_revision: documentRevision,
      narrative,
      mode: 'deterministic',
    },
  });
}

export function getPage(
  documentId: string,
  page: number,
  signal?: AbortSignal
): Promise<PageText> {
  return request<PageText>(`/policies/${documentId}/pages/${page}`, { signal });
}

export function createHandoff(
  explanationId: string,
  csrf: string,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<Handoff> {
  return request<Handoff>('/handoffs', {
    method: 'POST',
    csrf,
    idempotencyKey,
    signal,
    body: { explanation_id: explanationId },
  });
}

export function getInbox(recipient: InboxName, signal?: AbortSignal): Promise<InboxResponse> {
  return request<InboxResponse>(`/inboxes/${recipient}`, { signal });
}
