'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

import type { ActiveCitation } from './useDemoSession';

interface CitationPanelProps {
  active: ActiveCitation | null;
  partialPages: number[];
  onClose: () => void;
}

export default function CitationPanel({ active, partialPages, onClose }: CitationPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) closeRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onClose]);

  if (!active) return null;
  const { citation, page, loading } = active;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#191919]/40 backdrop-blur-sm p-0 sm:p-4"
      data-testid="citation-panel-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Citation source page ${citation.page}`}
        data-testid="citation-panel"
        className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-[#FAF8F5] border border-[#E2DDD4] rounded-t-3xl sm:rounded-3xl shadow-xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2DDD4] sticky top-0 bg-[#FAF8F5]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#D2654A]">
              Source citation
            </p>
            <h3 className="font-serif-heading text-lg text-[#191919]" data-testid="citation-page">
              Page {citation.page}
            </h3>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#F1EDE4] text-[#6E6862]"
            aria-label="Close citation panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-[#6E6862] mb-1">Exact quoted wording</p>
            <blockquote
              data-testid="citation-quote"
              className="border-l-2 border-[#D2654A] pl-3 text-sm text-[#191919] leading-relaxed"
            >
              {citation.quote}
            </blockquote>
          </div>

          <div>
            <p className="text-xs font-semibold text-[#6E6862] mb-1">Source page text</p>
            {loading ? (
              <p className="text-sm text-[#6E6862]">Loading page text…</p>
            ) : page ? (
              <pre
                data-testid="citation-source-text"
                className="whitespace-pre-wrap break-words text-xs text-[#191919] bg-[#F1EDE4] border border-[#E2DDD4] rounded-xl p-3"
              >
                {page.text}
              </pre>
            ) : (
              <p className="text-sm text-[#6E6862]">Page text is unavailable.</p>
            )}
          </div>

          {(partialPages.length > 0 || (page && !page.readable)) && (
            <p
              data-testid="citation-partial-warning"
              className="text-xs text-[#B45309] bg-[#FEF3C7] border border-[#FDE68A] rounded-xl p-3"
            >
              Partial extraction: some pages could not be read as text
              {partialPages.length > 0 ? ` (pages ${partialPages.join(', ')})` : ''}. This excerpt is
              from the readable text only.
            </p>
          )}

          <p className="text-[11px] text-[#8C847B]">
            Quoted wording is lexical relevance, not an exhaustive review or a coverage decision.
          </p>
        </div>
      </div>
    </div>
  );
}
