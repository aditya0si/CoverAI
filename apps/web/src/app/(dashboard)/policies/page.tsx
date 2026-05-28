'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Plus, FileText } from 'lucide-react';
import { getPolicies } from '@/lib/api-client';
import { PolicyCard } from '@/components/policy-card';
import { UploadModal } from './upload-modal';

export default function PoliciesPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: policies = [], isLoading, refetch } = useQuery({
    queryKey: ['policies'],
    queryFn: () => getPolicies(),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header Block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-[#1B4FD8]" />
            <span>My Policies</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Review active covers, premiums, vehicle details, and ask questions about your coverages.</p>
        </div>

        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-semibold shadow-lg shadow-[#1B4FD8]/25 transition-colors cursor-pointer"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>Upload New Policy</span>
        </button>
      </div>

      {/* Main Grid Panel */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse p-5 flex flex-col justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-slate-800 rounded w-1/2" />
                  <div className="h-3 bg-slate-800 rounded w-1/3" />
                </div>
              </div>
              <div className="h-px bg-slate-800 w-full my-3" />
              <div className="h-4 bg-slate-800 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="border border-dashed border-slate-800 bg-slate-900/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto mt-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center border border-slate-800 text-slate-500 mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-white text-base">No policies loaded</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-sm leading-normal">
            Upload your auto insurance policy PDF to start filing claims and query exclusions with our intelligent co-pilot.
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            className="mt-6 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
          >
            Upload Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {policies.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} />
          ))}
        </div>
      )}

      {/* Modal Dialog */}
      <UploadModal 
        isOpen={uploadOpen} 
        onClose={() => setUploadOpen(false)} 
        onSuccess={refetch} 
      />

    </div>
  );
}
