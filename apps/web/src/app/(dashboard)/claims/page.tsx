'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileText, Plus, FileQuestion, ArrowRight } from 'lucide-react';
import { getClaims } from '@/lib/api-client';
import { ClaimCard } from '@/components/claim-card';
import { ClaimStatus } from '@coverai/shared-types';
import { cn } from '@coverai/ui';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ClaimsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | ClaimStatus>('all');

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ['claims', activeTab],
    queryFn: () => getClaims(activeTab === 'all' ? undefined : activeTab),
  });

  const tabs: { id: 'all' | ClaimStatus; label: string }[] = [
    { id: 'all', label: 'All Claims' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'under_review', label: 'Under Review' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header Block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-heading text-2xl font-normal text-[#191919] tracking-tight flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-[#D2654A]" />
            <span>My Claims</span>
          </h1>
          <p className="text-xs text-[#6E6862] mt-0.5">
            Track status progressions, assessor remarks, evidence photos, and review AI triage reports.
          </p>
        </div>

        <button
          onClick={() => router.push('/claims/new')}
          className="inline-flex items-center gap-1.5 px-4.5 py-2.5 bg-[#191919] hover:bg-[#2D2D2D] text-[#FAF8F5] rounded-full text-xs font-semibold shadow-2xs transition-all cursor-pointer group"
        >
          <Plus className="w-4 h-4" />
          <span>File a Claim</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Filter Tabs */}
      <section className="flex gap-2 overflow-x-auto scrollbar-none border-b border-[#E2DDD4] shrink-0 pb-0">
        {tabs.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-px cursor-pointer',
                isActive
                  ? 'border-[#191919] text-[#191919]'
                  : 'border-transparent text-[#6E6862] hover:text-[#191919] hover:border-[#E2DDD4]'
              )}
            >
              {t.label}
            </button>
          );
        })}
      </section>

      {/* Claims Listing Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : claims.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No claims matching this category"
          description={
            activeTab === 'all'
              ? "You haven't filed any claims yet. File a claim to start tracking AI triage, review, and settlement here."
              : `There are currently no claims with status '${activeTab.replace('_', ' ')}'.`
          }
          action={
            activeTab === 'all'
              ? {
                  label: 'File a Claim Now',
                  onClick: () => router.push('/claims/new'),
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {claims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}
    </div>
  );
}
