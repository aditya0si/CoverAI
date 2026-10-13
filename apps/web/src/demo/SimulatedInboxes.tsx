'use client';

import React from 'react';
import { Inbox } from 'lucide-react';

import type { Citation, InboxEntry } from './contracts';

interface SimulatedInboxesProps {
  mechanic: InboxEntry[];
  officer: InboxEntry[];
  onOpenCitation: (citation: Citation) => void;
}

function InboxColumn({
  title,
  testId,
  entries,
  onOpenCitation,
}: {
  title: string;
  testId: string;
  entries: InboxEntry[];
  onOpenCitation: (citation: Citation) => void;
}) {
  return (
    <section
      data-testid={testId}
      className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5"
      aria-label={title}
    >
      <h3 className="font-serif-heading text-base text-[#191919] mb-3 flex items-center gap-2">
        <Inbox className="w-4 h-4 text-[#D2654A]" />
        {title}
      </h3>
      {entries.length === 0 ? (
        <p data-testid={`${testId}-empty`} className="text-xs text-[#6E6862]">
          No simulated entries yet.
        </p>
      ) : (
        <ul className="space-y-3" data-testid={`${testId}-entries`}>
          {entries.map((entry) => (
            <li
              key={entry.id}
              data-testid="inbox-entry"
              data-inbox={testId}
              className="bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl p-3"
            >
              <p className="text-xs font-semibold text-[#191919]" data-testid="inbox-entry-title">
                {entry.title}
              </p>
              <p className="text-xs text-[#6E6862] mt-1 leading-relaxed">{entry.narrative}</p>
              {entry.citations.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {entry.citations.map((citation, index) => (
                    <li key={`${entry.id}-${index}`}>
                      <button
                        type="button"
                        onClick={() => onOpenCitation(citation)}
                        className="text-left text-[11px] text-[#191919] underline decoration-[#D2654A] underline-offset-2"
                      >
                        Page {citation.page}: “{citation.quote.slice(0, 90)}
                        {citation.quote.length > 90 ? '…' : ''}”
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SimulatedInboxes({
  mechanic,
  officer,
  onOpenCitation,
}: SimulatedInboxesProps) {
  return (
    <div className="grid md:grid-cols-2 gap-4" data-testid="simulated-inboxes">
      <InboxColumn
        title="Simulated mechanic inbox"
        testId="inbox-mechanic"
        entries={mechanic}
        onOpenCitation={onOpenCitation}
      />
      <InboxColumn
        title="Simulated insurance officer inbox"
        testId="inbox-officer"
        entries={officer}
        onOpenCitation={onOpenCitation}
      />
    </div>
  );
}
