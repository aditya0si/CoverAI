'use client';

/**
 * Demo session state machine. All rendered state is in memory only; nothing is
 * written to localStorage/sessionStorage. A monotonically increasing generation
 * guard discards late responses that belong to a reset/expired session.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DemoApiError,
  createHandoff,
  createSession,
  explain as explainRequest,
  getInbox,
  getPage,
  getSession,
  newIdempotencyKey,
  resetSession,
  uploadPolicy,
} from './client';
import type {
  Citation,
  DocumentSummary,
  Explanation,
  Handoff,
  InboxEntry,
  PageText,
} from './contracts';

export type DemoStatus = 'idle' | 'starting' | 'ready' | 'expired' | 'reset_failed';

export interface ActiveCitation {
  citation: Citation;
  page: PageText | null;
  loading: boolean;
}

function messageFor(error: unknown): string {
  if (error instanceof DemoApiError) {
    if (error.code === 'OCR_NOT_AVAILABLE') {
      return 'No selectable text was found. Upload a text-readable PDF; OCR is not available in this demo.';
    }
    if (error.code === 'PAYLOAD_TOO_LARGE') {
      return 'That PDF is larger than the 10 MiB demo limit.';
    }
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function useDemoSession() {
  const [status, setStatus] = useState<DemoStatus>('idle');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [mechanic, setMechanic] = useState<InboxEntry[]>([]);
  const [officer, setOfficer] = useState<InboxEntry[]>([]);
  const [narrative, setNarrative] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [activeCitation, setActiveCitation] = useState<ActiveCitation | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);

  const csrfRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const keysRef = useRef<Map<string, string>>(new Map());
  const startedRef = useRef(false);
  // True while a DELETE failed and the server session may still exist. Starting
  // a brand-new session is blocked until the deletion is retried or discarded.
  const pendingResetRef = useRef(false);
  // One AbortController per generation. Rotating the generation aborts every
  // request that belonged to the previous one, so a successful replacement,
  // reset or expiry cancels in-flight work instead of merely ignoring its body.
  const abortRef = useRef<AbortController | null>(null);
  // Initialize on mount (not during render): requests read abortRef.current?.signal
  // and rotateGeneration() replaces the controller per generation. Declared before
  // the resume effect below, so the controller exists before any request starts.
  useEffect(() => {
    if (!abortRef.current) abortRef.current = new AbortController();
  }, []);

  const clearState = useCallback(() => {
    setDocument(null);
    setExplanation(null);
    setHandoff(null);
    setMechanic([]);
    setOfficer([]);
    setNarrative('');
    setActiveCitation(null);
    setError(null);
    setResetError(null);
    setSecondsLeft(null);
    setUploading(false);
    setExplaining(false);
    setHandoffBusy(false);
  }, []);

  const keyFor = useCallback((signature: string): string => {
    const map = keysRef.current;
    let key = map.get(signature);
    if (!key) {
      key = newIdempotencyKey();
      map.set(signature, key);
    }
    return key;
  }, []);

  const rotateGeneration = useCallback(() => {
    // Invalidate the current generation and cancel every in-flight request that
    // captured it. A fresh controller serves the new generation.
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
  }, []);

  const expire = useCallback(() => {
    // A client-clock expiry or a server 410 invalidates every pending request
    // and clears local sensitive state (including the selected file via the
    // resetNonce effect). It must not claim the server confirmed deletion: the
    // server TTL may be unchanged when the client clock is ahead.
    rotateGeneration();
    keysRef.current.clear();
    csrfRef.current = null;
    pendingResetRef.current = false;
    clearState();
    setExpiresAt(null);
    setResetNonce((value) => value + 1);
    setStatus('expired');
  }, [clearState, rotateGeneration]);

  const handleError = useCallback(
    (caught: unknown) => {
      if (caught instanceof DemoApiError && caught.status === 401) {
        // Missing capability: same safe local cleanup, but the user may start a
        // fresh session immediately (no server deletion is pending).
        rotateGeneration();
        keysRef.current.clear();
        csrfRef.current = null;
        pendingResetRef.current = false;
        clearState();
        setExpiresAt(null);
        setResetNonce((value) => value + 1);
        setStatus('idle');
        setError('Your demo session is missing. Start a new session.');
        return;
      }
      if (caught instanceof DemoApiError && caught.status === 410) {
        expire();
        return;
      }
      setError(messageFor(caught));
    },
    [clearState, expire, rotateGeneration]
  );

  const start = useCallback(async () => {
    if (pendingResetRef.current) {
      setError('Finish deleting the previous session before starting a new one.');
      return;
    }
    const generation = generationRef.current;
    // Cookie-mutating session creation is deliberately NOT bound to the rotating
    // generation signal: the transport queue must still be able to reserve it
    // behind an in-flight DELETE, and aborting a DELETE would defeat that.
    setStatus('starting');
    setError(null);
    try {
      const created = await createSession();
      if (generationRef.current !== generation) return;
      csrfRef.current = created.csrf_token;
      setExpiresAt(created.expires_at);
      setStatus('ready');
    } catch (caught) {
      if (generationRef.current !== generation) return;
      setStatus('idle');
      setError(messageFor(caught));
    }
  }, []);

  const resume = useCallback(async () => {
    // On mount/reload/shared tab, resume the existing capability with a GET.
    // A new session is only created with an explicit POST when the resume finds
    // no capability (401), so a shared cookie is never reset out from under
    // another tab.
    const generation = generationRef.current;
    const signal = abortRef.current?.signal;
    setStatus('starting');
    setError(null);

    let view;
    try {
      view = await getSession(signal);
    } catch (caught) {
      if (generationRef.current !== generation) return;
      if (caught instanceof DemoApiError && caught.status === 401) {
        await start();
        return;
      }
      if (caught instanceof DemoApiError && caught.status === 410) {
        expire();
        return;
      }
      setStatus('idle');
      setError(messageFor(caught));
      return;
    }

    if (generationRef.current !== generation) return;
    csrfRef.current = view.csrf_token;
    setExpiresAt(view.expires_at);
    setDocument(view.document);
    setStatus('ready');

    if (view.document) {
      try {
        const [mechanicInbox, officerInbox] = await Promise.all([
          getInbox('mechanic', signal),
          getInbox('officer', signal),
        ]);
        if (generationRef.current !== generation) return;
        setMechanic(mechanicInbox.entries);
        setOfficer(officerInbox.entries);
      } catch {
        // Simulated inboxes are non-critical; keep the resumed document.
      }
    }
  }, [expire, start]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void resume();
  }, [resume]);

  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) expire();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, expire]);

  const upload = useCallback(
    async (file: File) => {
      const csrf = csrfRef.current;
      if (!csrf) {
        setError('Your demo session is not ready yet.');
        return;
      }
      const generation = generationRef.current;
      const signal = abortRef.current?.signal;
      setUploading(true);
      setError(null);
      let succeeded = false;
      try {
        const signature = `upload:${file.name}:${file.size}:${file.lastModified}`;
        const uploaded = await uploadPolicy(file, csrf, keyFor(signature), signal);
        if (generationRef.current !== generation) return;
        succeeded = true;
        // A successful replacement (or first upload) is a new generation: it
        // cancels any in-flight request for the prior document and clears all
        // prior accident state, including the narrative and any open citation.
        rotateGeneration();
        setDocument(uploaded);
        setExplanation(null);
        setHandoff(null);
        setMechanic([]);
        setOfficer([]);
        setNarrative('');
        setActiveCitation(null);
        // A successful replacement retires *every* operation flag owned by the
        // previous generation. Each operation's `finally` only clears its flag
        // while the generation still matches, so without retiring them here an
        // aborted in-flight explain/handoff would leave `explaining`/
        // `handoffBusy` stuck true forever and permanently disable the controls.
        // The generation guard still prevents an old `finally` from clearing a
        // newer operation's flag.
        setExplaining(false);
        setHandoffBusy(false);
      } catch (caught) {
        // A failed replacement leaves the prior document/explanation intact.
        if (generationRef.current === generation) handleError(caught);
      } finally {
        if (succeeded || generationRef.current === generation) setUploading(false);
      }
    },
    [handleError, keyFor, rotateGeneration]
  );

  const runExplain = useCallback(async () => {
    const csrf = csrfRef.current;
    const currentDocument = document;
    if (!csrf || !currentDocument) return;
    const trimmed = narrative.trim();
    if (trimmed.length < 20) {
      setError('Please describe the incident using at least 20 characters.');
      return;
    }
    const generation = generationRef.current;
    const signal = abortRef.current?.signal;
    setExplaining(true);
    setError(null);
    try {
      const signature = `explain:${currentDocument.id}:${currentDocument.revision}:${trimmed}`;
      const result = await explainRequest(
        currentDocument.id,
        currentDocument.revision,
        trimmed,
        csrf,
        keyFor(signature),
        signal
      );
      if (generationRef.current !== generation) return;
      setExplanation(result);
      setHandoff(null);
      setMechanic([]);
      setOfficer([]);
    } catch (caught) {
      if (generationRef.current === generation) handleError(caught);
    } finally {
      if (generationRef.current === generation) setExplaining(false);
    }
  }, [document, handleError, keyFor, narrative]);

  const runHandoff = useCallback(async () => {
    const csrf = csrfRef.current;
    const currentExplanation = explanation;
    if (!csrf || !currentExplanation) return;
    const generation = generationRef.current;
    const signal = abortRef.current?.signal;
    setHandoffBusy(true);
    setError(null);
    try {
      const signature = `handoff:${currentExplanation.id}`;
      const created = await createHandoff(
        currentExplanation.id,
        csrf,
        keyFor(signature),
        signal
      );
      if (generationRef.current !== generation) return;
      setHandoff(created);
      const [mechanicInbox, officerInbox] = await Promise.all([
        getInbox('mechanic', signal),
        getInbox('officer', signal),
      ]);
      if (generationRef.current !== generation) return;
      setMechanic(mechanicInbox.entries);
      setOfficer(officerInbox.entries);
    } catch (caught) {
      if (generationRef.current === generation) handleError(caught);
    } finally {
      if (generationRef.current === generation) setHandoffBusy(false);
    }
  }, [explanation, handleError, keyFor]);

  const openCitation = useCallback(
    async (citation: Citation) => {
      const generation = generationRef.current;
      setActiveCitation({ citation, page: null, loading: true });
      if (!document) {
        setActiveCitation((previous) =>
          previous && previous.citation === citation
            ? { citation, page: null, loading: false }
            : previous
        );
        return;
      }
      try {
        const page = await getPage(document.id, citation.page, abortRef.current?.signal);
        if (generationRef.current !== generation) return;
        setActiveCitation((previous) =>
          previous && previous.citation === citation
            ? { citation, page, loading: false }
            : previous
        );
      } catch (caught) {
        if (generationRef.current !== generation) return;
        // Resolve the loading state first, then route the failure through the
        // same safe lifecycle handler used by the mutation paths. A 401/410 must
        // clear local sensitive state (file, input, acknowledgement, rendered
        // content); swallowing the status here was the class-5 gap.
        setActiveCitation((previous) =>
          previous && previous.citation === citation
            ? { citation, page: null, loading: false }
            : previous
        );
        handleError(caught);
      }
    },
    [document, handleError]
  );

  const closeCitation = useCallback(() => setActiveCitation(null), []);

  const reset = useCallback(async () => {
    const csrf = csrfRef.current;
    // Invalidate every pending operation and clear local sensitive state
    // immediately, but retain the capability needed to retry the DELETE.
    rotateGeneration();
    const generation = generationRef.current;
    keysRef.current.clear();
    clearState();
    setExpiresAt(null);
    setResetNonce((value) => value + 1);

    if (!csrf) {
      pendingResetRef.current = false;
      csrfRef.current = null;
      setStatus('idle');
      return;
    }

    try {
      // The DELETE is a cookie mutation and must not be aborted by a later
      // generation rotation, or the response-write ordering guarantee breaks.
      await resetSession(csrf);
      // A newer reset/expiry superseded this response: never let it overwrite
      // fresher state.
      if (generationRef.current !== generation) return;
      csrfRef.current = null;
      pendingResetRef.current = false;
      setStatus('idle');
      setError(null);
    } catch {
      if (generationRef.current !== generation) return;
      // Keep the csrf token so the user can retry the same DELETE with the
      // still-present HttpOnly cookie. Never claim server state was cleared.
      csrfRef.current = csrf;
      pendingResetRef.current = true;
      setStatus('reset_failed');
      setResetError(
        'We could not confirm that the server deleted this demo session. Your local content and selected file were cleared, but the server may still hold the session. Retry deletion to finish.'
      );
    }
  }, [clearState, rotateGeneration]);

  const discardReset = useCallback(() => {
    // Explicit user choice to abandon the unconfirmed deletion and start fresh.
    pendingResetRef.current = false;
    setResetError(null);
    setStatus('idle');
  }, []);

  return {
    status,
    expiresAt,
    secondsLeft,
    document,
    explanation,
    handoff,
    mechanic,
    officer,
    narrative,
    setNarrative,
    error,
    setError,
    resetError,
    uploading,
    explaining,
    handoffBusy,
    busy: uploading || explaining || handoffBusy,
    activeCitation,
    resetNonce,
    start,
    upload,
    runExplain,
    runHandoff,
    openCitation,
    closeCitation,
    reset,
    discardReset,
  };
}
