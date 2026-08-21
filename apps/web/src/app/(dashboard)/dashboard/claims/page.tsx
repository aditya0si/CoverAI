/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, FilePlus, UploadCloud, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { getClaims } from '@/lib/api-client';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/status-badge';

export default function ClaimsTab() {
  const router = useRouter();
  const { showToast } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);

  const { data: claims = [], isLoading: claimsLoading } = useQuery({
    queryKey: ['claims'],
    queryFn: () => getClaims(),
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      showToast('Files loaded. Opening your claim creation wizard...', 'info');
      router.push('/claims/new');
    }
  };

  const renderClaimTimeline = (status: string) => {
    const steps = [
      { id: 'draft', label: 'Draft' },
      { id: 'submitted', label: 'Submitted' },
      { id: 'under_review', label: 'Review' },
      { id: 'surveyor_assigned', label: 'Surveyor' },
      { id: 'approved', label: 'Decision' },
    ];

    const currentIdx = steps.findIndex((s) => s.id === status);
    const isApproved = ['approved', 'settled'].includes(status);
    const isRejected = status === 'rejected';

    return (
      <div className="flex items-center justify-between w-full relative py-2">
        <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-[#E2DDD4] -translate-y-1/2 z-0" />
        {steps.map((step, idx) => {
          const isPassed = idx <= currentIdx;
          const isCurrent = idx === currentIdx;

          let circleColor = 'bg-[#FAF8F5] border-[#E2DDD4] text-[#8C847B]';
          if (isPassed) {
            circleColor = 'bg-[#191919] border-[#191919] text-[#FAF8F5]';
          }
          if (isCurrent) {
            circleColor = 'bg-[#191919] border-[#191919] text-[#FAF8F5] ring-4 ring-[#191919]/10';
          }
          if (step.id === 'approved' && isApproved) {
            circleColor = 'bg-[#1E7E34] border-[#1E7E34] text-white';
          } else if (step.id === 'approved' && isRejected) {
            circleColor = 'bg-[#B83A26] border-[#B83A26] text-white';
            step.label = 'Rejected';
          }

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-1">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border transition-all ${circleColor}`}
              >
                {step.id === 'approved' && isApproved
                  ? '✓'
                  : step.id === 'approved' && isRejected
                  ? '✗'
                  : idx + 1}
              </div>
              <span
                className={`text-[8px] font-semibold uppercase tracking-wider ${
                  isPassed ? 'text-[#191919]' : 'text-[#8C847B]'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2">
        <div>
          <h2 className="font-serif-heading text-xl font-normal text-[#191919]">
            Claim Center
          </h2>
          <p className="text-xs text-[#6E6862] mt-0.5">
            File new vehicle claims, upload photo evidence, and track AI triage status.
          </p>
        </div>
        <button
          onClick={() => router.push('/claims/new')}
          className="inline-flex items-center gap-1.5 px-4.5 py-2 bg-[#191919] hover:bg-[#2D2D2D] text-[#FAF8F5] text-xs font-semibold rounded-full shadow-2xs transition-all cursor-pointer group"
        >
          <FilePlus className="w-3.5 h-3.5" />
          <span>File a Claim</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Claims List Deck (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {claimsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-36 bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl animate-pulse"
                />
              ))}
            </div>
          ) : claims.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No Claims on Record"
              description="You haven't filed any vehicle claims yet. If your vehicle encountered an accident or damage, file a claim in minutes."
              action={{
                label: 'File a New Claim',
                onClick: () => router.push('/claims/new'),
              }}
            />
          ) : (
            <div className="space-y-4">
              {claims.map((c) => {
                const date = new Date(c.created_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });

                return (
                  <div
                    key={c.id}
                    className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-6 hover:border-[#8C847B] transition-all flex flex-col sm:flex-row justify-between gap-6 group shadow-2xs"
                  >
                    <div className="space-y-4 flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[9px] text-[#8C847B] font-mono tracking-wider block uppercase">
                            Claim ID
                          </span>
                          <h4 className="font-mono font-bold text-sm text-[#191919] mt-0.5 truncate">
                            {c.claim_number}
                          </h4>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs border-t border-[#E2DDD4] pt-3">
                        <div>
                          <span className="text-[10px] text-[#8C847B] font-medium uppercase tracking-wider block">
                            Type
                          </span>
                          <span className="text-[#191919] font-medium capitalize mt-0.5 block">
                            {c.claim_type.replace('_', ' ')}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#8C847B] font-medium uppercase tracking-wider block">
                            Estimated Loss
                          </span>
                          <span className="text-[#191919] font-bold mt-0.5 block">
                            ₹ {c.estimated_amount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Timeline Stepper */}
                      <div className="pt-2 border-t border-[#E2DDD4]">
                        {renderClaimTimeline(c.status)}
                      </div>
                    </div>

                    <div className="flex sm:flex-col justify-between sm:justify-center items-end sm:items-center gap-3 border-t sm:border-t-0 sm:border-l border-[#E2DDD4] pt-4 sm:pt-0 sm:pl-6 shrink-0 min-w-[130px]">
                      <div className="hidden sm:block text-center">
                        <span className="text-[9px] text-[#8C847B] font-medium uppercase tracking-wider block">
                          Date Filed
                        </span>
                        <span className="text-xs text-[#191919] font-medium mt-0.5 block">{date}</span>
                      </div>
                      <button
                        onClick={() => router.push(`/claims/${c.id}`)}
                        className="px-4 py-1.5 bg-[#FAF8F5] hover:bg-[#FAF8F5]/80 border border-[#E2DDD4] text-[#191919] rounded-lg text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
                      >
                        Timeline & Evidence
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fast-Track Dropzone Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-7 text-center flex flex-col items-center justify-center min-h-[220px] transition-all ${
              isDragging
                ? 'border-[#191919] bg-[#F1EDE4]'
                : 'border-[#E2DDD4] bg-[#FAF8F5] hover:border-[#8C847B]'
            }`}
          >
            <div className="w-10 h-10 rounded-2xl bg-[#F1EDE4] border border-[#E2DDD4] text-[#191919] flex items-center justify-center mb-4">
              <UploadCloud className="w-5 h-5" />
            </div>
            <h4 className="font-serif-heading font-semibold text-sm text-[#191919]">
              Fast-Track Photo Evidence
            </h4>
            <p className="text-xs text-[#6E6862] mt-1.5 max-w-[200px] mx-auto leading-relaxed">
              Drag and drop incident photographs here to launch the AI claim creation workflow.
            </p>
            <button
              onClick={() => router.push('/claims/new')}
              className="mt-5 px-4 py-2 bg-[#F1EDE4] hover:bg-[#EAE4D8] border border-[#E2DDD4] text-[#191919] rounded-full text-xs font-semibold tracking-wide transition-all cursor-pointer"
            >
              Select Images
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
