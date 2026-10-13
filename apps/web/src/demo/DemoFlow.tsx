'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';

import CitationPanel from './CitationPanel';
import SimulatedInboxes from './SimulatedInboxes';
import {
  AMBIGUOUS_METADATA_DISPLAY,
  METADATA_FIELD_LABELS,
  METADATA_FIELD_ORDER,
  SIMULATION_WARNING,
  UNKNOWN_METADATA_DISPLAY,
} from './contracts';
import { useDemoSession } from './useDemoSession';

function formatCountdown(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export default function DemoFlow() {
  const session = useDemoSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const { resetNonce } = session;
  const initialisedRef = useRef(false);

  useEffect(() => {
    // Do not clear the selection on first mount; only when the user resets.
    if (!initialisedRef.current) {
      initialisedRef.current = true;
      return;
    }
    setFile(null);
    setAcknowledged(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [resetNonce]);

  const canUpload = Boolean(file) && acknowledged && session.status === 'ready' && !session.uploading;
  const canExplain =
    Boolean(session.document) && session.narrative.trim().length >= 20 && !session.explaining;
  const canHandoff = Boolean(session.explanation) && !session.handoffBusy;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#191919]">
      <header className="border-b border-[#E2DDD4] bg-[#FAF8F5]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#D2654A]" />
            <span className="font-serif-heading font-bold text-lg">CoverAI · Anonymous demo</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#6E6862]">
            <span data-testid="expiry-countdown" aria-live="polite">
              Session expires in {formatCountdown(session.secondsLeft)}
            </span>
            <button
              type="button"
              data-testid="reset-button"
              onClick={() => void session.reset()}
              className="inline-flex items-center gap-1 rounded-full border border-[#E2DDD4] px-3 py-1.5 hover:bg-[#F1EDE4]"
            >
              <RefreshCw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6 space-y-6">
        <div
          data-testid="simulation-warning"
          role="note"
          className="rounded-2xl border border-[#D2654A]/40 bg-[#FDEDE8] px-4 py-3 text-sm text-[#8A3B27]"
        >
          <strong>Simulation only.</strong> {SIMULATION_WARNING}
        </div>

        {session.error && (
          <div
            data-testid="error-message"
            role="alert"
            className="rounded-2xl border border-[#E2DDD4] bg-[#FEF3C7] px-4 py-3 text-sm text-[#92400E]"
          >
            {session.error}
          </div>
        )}

        {session.resetError && (
          <div
            data-testid="reset-unconfirmed"
            role="alert"
            className="rounded-2xl border border-[#D2654A]/40 bg-[#FDEDE8] px-4 py-3 text-sm text-[#8A3B27] space-y-3"
          >
            <p>{session.resetError}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="reset-retry-button"
                onClick={() => void session.reset()}
                className="rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-[#FAF8F5]"
              >
                Retry deletion
              </button>
              <button
                type="button"
                data-testid="reset-discard-button"
                onClick={() => session.discardReset()}
                className="rounded-full border border-[#E2DDD4] px-4 py-2 text-xs font-semibold"
              >
                Discard and start fresh
              </button>
            </div>
          </div>
        )}

        {session.status === 'starting' && (
          <p data-testid="session-starting" className="text-sm text-[#6E6862]">
            Preparing a private, anonymous demo session…
          </p>
        )}

        {session.status === 'expired' && (
          <div data-testid="session-expired" role="alert" className="rounded-2xl border border-[#E2DDD4] bg-[#F1EDE4] p-4 text-sm">
            This demo session expired in this browser and your local selection and rendered content were
            cleared. Start a new session to continue.{' '}
            <button
              type="button"
              data-testid="restart-button"
              onClick={() => void session.start()}
              className="underline decoration-[#D2654A] underline-offset-2"
            >
              Start a new session
            </button>
          </div>
        )}

        {/* Step 1 — policy upload */}
        <section className="rounded-3xl border border-[#E2DDD4] bg-[#F7F4EE] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#D2654A]" />
            <h2 className="font-serif-heading text-xl">1. Upload your policy PDF</h2>
          </div>

          <div className="rounded-xl border border-[#E2DDD4] bg-[#FAF8F5] p-3 text-xs text-[#6E6862] leading-relaxed">
            <p>
              Your PDF is processed locally by this demo and its text is used only for this anonymous
              session. Do not upload documents containing unnecessary personal details. Content is
              discarded on reset, expiry or server restart.
            </p>
          </div>

          <input
            ref={fileInputRef}
            data-testid="upload-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />

          <label className="flex items-start gap-2 text-xs text-[#6E6862]">
            <input
              type="checkbox"
              data-testid="upload-ack"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              I understand this is a local, anonymous simulation and I acknowledge processing of my
              selected PDF.
            </span>
          </label>

          <button
            type="button"
            data-testid="upload-button"
            disabled={!canUpload}
            onClick={() => file && void session.upload(file)}
            className="inline-flex items-center gap-2 rounded-full bg-[#191919] px-5 py-2.5 text-xs font-semibold text-[#FAF8F5] disabled:opacity-40"
          >
            {session.uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            Upload policy
          </button>

          {session.document && (
            <div data-testid="document-summary" className="rounded-2xl border border-[#E2DDD4] bg-[#FAF8F5] p-4 space-y-3">
              <p className="text-sm">
                <span className="font-semibold">{session.document.filename}</span> ·{' '}
                {session.document.page_count} pages · revision {session.document.revision}
              </p>

              {session.document.unreadable_pages.length > 0 && (
                <p
                  data-testid="partial-warning"
                  className="text-xs text-[#B45309] bg-[#FEF3C7] border border-[#FDE68A] rounded-lg p-2"
                >
                  Partial extraction: pages {session.document.unreadable_pages.join(', ')} could not be
                  read as text and were not analysed.
                </p>
              )}

              <dl className="grid sm:grid-cols-2 gap-2 text-xs">
                {METADATA_FIELD_ORDER.map((fieldName) => {
                  const field = session.document?.metadata[fieldName];
                  if (!field) return null;
                  let display: string;
                  if (field.status === 'found') display = field.value ?? '';
                  else if (field.status === 'unknown') display = UNKNOWN_METADATA_DISPLAY;
                  else display = AMBIGUOUS_METADATA_DISPLAY;
                  return (
                    <div key={fieldName} className="flex justify-between gap-2 border-b border-[#E2DDD4]/70 pb-1">
                      <dt className="text-[#6E6862]">{METADATA_FIELD_LABELS[fieldName]}</dt>
                      <dd
                        data-testid={`metadata-${fieldName}`}
                        data-status={field.status}
                        className={field.status === 'found' ? 'text-[#191919]' : 'text-[#8C847B]'}
                      >
                        {display}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
        </section>

        {/* Step 2 — narrative */}
        <section className="rounded-3xl border border-[#E2DDD4] bg-[#F7F4EE] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#D2654A]" />
            <h2 className="font-serif-heading text-xl">2. Describe the incident</h2>
          </div>
          <p className="text-xs text-[#6E6862]">
            Your own words are used only to find potentially relevant wording. They are not evidence
            of policy wording.
          </p>
          <textarea
            data-testid="narrative-input"
            value={session.narrative}
            onChange={(event) => session.setNarrative(event.target.value)}
            rows={4}
            placeholder="e.g. My parked car suffered accidental external damage in a collision."
            className="w-full rounded-xl border border-[#E2DDD4] bg-[#FAF8F5] p-3 text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#8C847B]">
              {session.narrative.trim().length} characters (minimum 20)
            </span>
            <button
              type="button"
              data-testid="explain-button"
              disabled={!canExplain}
              onClick={() => void session.runExplain()}
              className="inline-flex items-center gap-2 rounded-full bg-[#191919] px-5 py-2.5 text-xs font-semibold text-[#FAF8F5] disabled:opacity-40"
            >
              {session.explaining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Find relevant excerpts
            </button>
          </div>
        </section>

        {/* Step 3 — explanation */}
        {session.explanation && (
          <section
            data-testid="explanation-panel"
            className="rounded-3xl border border-[#E2DDD4] bg-[#F7F4EE] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-[#D2654A]" />
              <h2 className="font-serif-heading text-xl">3. Document-grounded explanation</h2>
            </div>
            <p
              data-testid="deterministic-label"
              className="inline-block rounded-full border border-[#E2DDD4] bg-[#F1EDE4] px-3 py-1 text-[11px] font-semibold text-[#6E6862]"
            >
              Document excerpts — deterministic, not AI-generated.
            </p>

            <div className="rounded-xl border border-[#E2DDD4] bg-[#FAF8F5] p-3">
              <p className="text-[11px] font-semibold text-[#6E6862]">Your description (user-reported)</p>
              <p data-testid="submitted-narrative" className="text-sm whitespace-pre-wrap break-words">
                {session.explanation.narrative}
              </p>
            </div>

            <ul className="space-y-3">
              {session.explanation.findings.map((finding, index) => (
                <li
                  key={index}
                  data-testid="finding"
                  data-kind={finding.kind}
                  className="rounded-2xl border border-[#E2DDD4] bg-[#FAF8F5] p-4"
                >
                  <p className="text-sm text-[#191919]">{finding.text}</p>
                  {finding.citations.map((citation, citationIndex) => (
                    <div key={citationIndex} className="mt-3">
                      <button
                        type="button"
                        data-testid="citation-button"
                        onClick={() => void session.openCitation(citation)}
                        className="text-left w-full rounded-xl border border-[#E2DDD4] bg-[#F1EDE4] p-3 hover:border-[#8C847B]"
                      >
                        <span className="block text-[11px] font-semibold text-[#D2654A]">
                          Page {citation.page}
                        </span>
                        <span data-testid="citation-quote-text" className="block text-xs text-[#191919] mt-1">
                          “{citation.quote}”
                        </span>
                      </button>
                    </div>
                  ))}
                </li>
              ))}
            </ul>

            <div>
              <p className="text-[11px] font-semibold text-[#6E6862] mb-1">Limitations</p>
              <ul data-testid="limitations" className="list-disc pl-5 text-xs text-[#6E6862] space-y-1">
                {session.explanation.limitations.map((limitation, index) => (
                  <li key={index}>{limitation}</li>
                ))}
              </ul>
            </div>

            {/* Step 4 — simulated handoff */}
            <div className="pt-2 border-t border-[#E2DDD4] space-y-3">
              <h3 className="font-serif-heading text-lg">4. Simulated handoff</h3>
              <p className="text-xs text-[#6E6862]">
                This creates two clearly-labelled simulated inbox entries inside this session. No real
                party is contacted.
              </p>
              <button
                type="button"
                data-testid="handoff-button"
                disabled={!canHandoff}
                onClick={() => void session.runHandoff()}
                className="inline-flex items-center gap-2 rounded-full bg-[#191919] px-5 py-2.5 text-xs font-semibold text-[#FAF8F5] disabled:opacity-40"
              >
                {session.handoffBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Create simulated handoff
              </button>
            </div>
          </section>
        )}

        {/* Restored or newly created simulated handoffs. Rendered independently
            of the explanation so a reload resumes the session's inboxes. */}
        {(session.mechanic.length > 0 || session.officer.length > 0) && (
          <section
            data-testid="simulated-handoffs"
            className="rounded-3xl border border-[#E2DDD4] bg-[#F7F4EE] p-6 space-y-4"
          >
            <h2 className="font-serif-heading text-xl">Simulated handoffs</h2>
            <p className="text-xs text-[#6E6862]">
              These simulated inbox entries belong to this anonymous session and were restored from
              it. No real party has been contacted.
            </p>
            <SimulatedInboxes
              mechanic={session.mechanic}
              officer={session.officer}
              onOpenCitation={(citation) => void session.openCitation(citation)}
            />
          </section>
        )}

        {session.status === 'idle' && (
          <button
            type="button"
            data-testid="start-button"
            onClick={() => void session.start()}
            className="rounded-full bg-[#191919] px-5 py-2.5 text-xs font-semibold text-[#FAF8F5]"
          >
            Start demo session
          </button>
        )}

        <p className="text-[11px] text-[#8C847B] flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Unknown policy details stay unknown. Nothing here estimates coverage, payout or liability.
        </p>
      </main>

      <CitationPanel
        active={session.activeCitation}
        partialPages={session.document?.unreadable_pages ?? []}
        onClose={session.closeCitation}
      />
    </div>
  );
}
