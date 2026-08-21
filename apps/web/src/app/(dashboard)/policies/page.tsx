'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Plus, FileText, ArrowRight } from 'lucide-react';
import { getPolicies } from '@/lib/api-client';
import { PolicyCard } from '@/components/policy-card';
import { UploadModal } from './upload-modal';
import { EmptyState } from '@/components/ui/EmptyState';

export default function PoliciesPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: policies = [], isLoading, refetch } = useQuery({
    queryKey: ['policies'],
    queryFn: () => getPolicies(),
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header Block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-heading text-2xl font-normal text-[#191919] tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#D2654A]" />
            <span>My Policies</span>
          </h1>
          <p className="text-xs text-[#6E6862] mt-0.5">
            Review active covers, sum insured limits, vehicle info, and clause extracts.
          </p>
        </div>

        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 px-4.5 py-2.5 bg-[#191919] hover:bg-[#2D2D2D] text-[#FAF8F5] rounded-full text-xs font-semibold shadow-2xs transition-all cursor-pointer group"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Policy</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Main Grid Panel */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-44 bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl animate-pulse p-5"
            />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Insurance Policies Uploaded"
          description="Upload your vehicle insurance policy document to extract coverages, exclusions, and enable AI claim assessments."
          action={{
            label: 'Upload Policy Document',
            onClick: () => setUploadOpen(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {policies.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} />
          ))}
        </div>
      )}

      {/* Upload Modal Dialog */}
      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
