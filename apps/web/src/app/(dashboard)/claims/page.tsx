'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileText, Plus, FileQuestion } from 'lucide-react';
import { getClaims } from '@/lib/api-client';
import { ClaimCard } from '@/components/claim-card';
import { ClaimStatus } from '@coverai/shared-types';

export default function ClaimsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | ClaimStatus>('all');

  // Fetch Claims
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
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header Block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-[#1B4FD8]" />
            <span>My Claims</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track status updates, assessor comments, audit trails, and review AI triage reports.
          </p>
        </div>

        <button
          onClick={() => router.push('/claims/new')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-semibold shadow-lg shadow-[#1B4FD8]/25 transition-colors cursor-pointer"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>File a Claim</span>
        </button>
      </div>

      {/* Filter Tabs Stepper */}
      <section className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-slate-900 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
              activeTab === t.id
                ? 'bg-slate-900 border-slate-800 text-white shadow-sm'
                : 'bg-transparent border-transparent text-slate-500 hover:text-slate-350 hover:bg-slate-950/40'
            }`}
          >
            {t.label}
          </button>
        ))}
      </section>

      {/* Claims Listing Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : claims.length === 0 ? (
        <div className="border border-dashed border-slate-800 bg-slate-900/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto mt-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center border border-slate-800 text-slate-500 mb-4">
            <FileQuestion className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-white text-base">No claims found</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-sm leading-normal">
            There are no claims matching the &apos;{activeTab.replace('_', ' ')}&apos; category.
          </p>
          {activeTab === 'all' && (
            <button
              onClick={() => router.push('/claims/new')}
              className="mt-6 px-4 py-2.5 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-semibold shadow-lg transition-colors cursor-pointer"
            >
              File a Claim Now
            </button>
          )}
        </div>
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
