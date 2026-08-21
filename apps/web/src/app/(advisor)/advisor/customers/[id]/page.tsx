/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  ShieldCheck,
  FileText,
  Info,
  Zap,
  Maximize2,
  Cpu,
  Calendar,
  MapPin,
  X,
} from 'lucide-react';
import {
  getAdvisorCustomers,
  getAdvisorCustomerPolicies,
  getAdvisorCustomerClaims,
  PolicyDetail,
  ClaimImage,
  getClaim,
  ClaimDetail
} from '@/lib/api-client';
import { useAppStore } from '@/lib/store';
import Image from 'next/image';

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const claimMap: Record<string, string> = {
    draft: 'bg-slate-700/50 text-slate-400 border-slate-700',
    submitted: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    under_review: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    surveyor_assigned: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    settled: 'bg-teal-500/15 text-teal-400 border-teal-500/25',
    disputed: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  };
  const policyMap: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    expired: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    cancelled: 'bg-slate-700/50 text-slate-400 border-slate-700',
  };
  const cls = claimMap[status] || policyMap[status] || 'bg-slate-700/50 text-slate-400 border-slate-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border capitalize tracking-wide ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function AdvisorCustomerDetailPage() {
  const { id: customerId } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useAppStore();

  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  const [activeImage, setActiveImage] = useState<string | null>(null);

  // ── 1. Fetch Customers Profile ─────────────────────────────────────────────
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['advisor-customers'],
    queryFn: getAdvisorCustomers,
  });

  const customer = customers.find((c) => c.customer_id === customerId);

  // ── 2. Fetch Client Policies and Claims ────────────────────────────────────
  const { data: policies = [], isLoading: policiesLoading } = useQuery({
    queryKey: ['advisor-customer-policies', customerId],
    queryFn: () => getAdvisorCustomerPolicies(customerId),
    enabled: !!customerId,
  });

  const { data: claims = [], isLoading: claimsLoading, refetch: refetchClaims } = useQuery({
    queryKey: ['advisor-customer-claims', customerId],
    queryFn: () => getAdvisorCustomerClaims(customerId),
    enabled: !!customerId,
  });

  // Set default selected claim if present
  React.useEffect(() => {
    if (claims.length > 0 && !selectedClaimId) {
      setSelectedClaimId(claims[0].id);
    }
  }, [claims, selectedClaimId]);

  // Selected claim derivation
  const selectedClaim = claims.find((c) => c.id === selectedClaimId) as any;
  const aiSummary = selectedClaim?.ai_summary as any;



  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Back button */}
      <div>
        <button
          onClick={() => router.push('/advisor/customers')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> 
          <span>Back to Client Deck</span>
        </button>
      </div>

      {/* ── Customer Profile Card Header ──────────────────────────────────────── */}
      {customersLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 animate-pulse" />
      ) : customer ? (
        <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-3xl p-5 shadow-lg shadow-black/10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                <User className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white leading-normal">{customer.customer_name}</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assigned customer since{' '}
                  {new Date(customer.assigned_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Contacts details */}
            <div className="flex flex-wrap gap-2.5">
              <div className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-350">
                <Mail className="w-3.5 h-3.5 text-slate-650 shrink-0" />
                <span>{customer.customer_email}</span>
              </div>
              {customer.customer_phone && (
                <div className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-350">
                  <Phone className="w-3.5 h-3.5 text-slate-655 shrink-0" />
                  <span>{customer.customer_phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500 text-sm">Customer profile not found.</div>
      )}

      {/* ── CLAIM REVIEW SPLIT-SCREEN WORKSPACE ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Customer Policies context (50% / 6 cols) */}
        <section className="lg:col-span-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-900 pb-2 shrink-0">
            <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-400">Policy Coverage Vault ({policies.length})</h3>
          </div>

          {policiesLoading ? (
            <div className="space-y-4 animate-pulse">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-40 bg-slate-900 border border-slate-800 rounded-3xl" />
              ))}
            </div>
          ) : policies.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl py-12 text-center text-xs text-slate-500">
              No policies registered for this customer.
            </div>
          ) : (
            <div className="space-y-4">
              {(policies as PolicyDetail[]).map((p) => {
                const endDate = new Date(p.end_date);
                const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-md shadow-black/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                    
                    <div className="flex items-start justify-between gap-2 border-b border-slate-850 pb-2.5">
                      <div>
                        <p className="text-xs font-bold text-slate-200 font-mono">{p.policy_number}</p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">{p.insurer_name}</p>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-3.5 text-[10px]">
                      <div>
                        <p className="text-slate-500 uppercase tracking-wider font-bold text-[8px]">Vehicle Year & Specification</p>
                        <p className="text-slate-300 mt-1 font-semibold">
                          {p.vehicle_year} {p.vehicle_make} {p.vehicle_model}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 uppercase tracking-wider font-bold text-[8px]">Registration No</p>
                        <p className="text-slate-300 mt-1 font-mono font-bold uppercase">{p.vehicle_registration}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 uppercase tracking-wider font-bold text-[8px]">Sum Insured Paid Cover</p>
                        <p className="text-slate-200 mt-1 font-extrabold text-xs">₹ {p.sum_insured.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 uppercase tracking-wider font-bold text-[8px]">Premium Amount</p>
                        <p className="text-slate-200 mt-1 font-extrabold text-xs">₹ {p.premium_amount.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-850/60 text-[9px] text-slate-550">
                      <span>Inception: {new Date(p.start_date).toLocaleDateString()}</span>
                      <span className={`font-semibold ${daysLeft <= 30 ? 'text-amber-400' : 'text-slate-500'}`}>
                        Expires {endDate.toLocaleDateString()} {daysLeft <= 30 && `(${daysLeft}d left)`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Interactive Claim Review Workspace (50% / 6 cols) */}
        <section className="lg:col-span-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4.5 h-4.5 text-violet-400" />
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-400">Claim Review Workspace ({claims.length})</h3>
            </div>
            
            {/* Direct selector of active claims */}
            {claims.length > 0 && (
              <select
                value={selectedClaimId}
                onChange={(e) => setSelectedClaimId(e.target.value)}
                className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-300 focus:outline-none cursor-pointer"
              >
                {claims.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.claim_number} ({c.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {claimsLoading ? (
            <div className="h-96 bg-slate-900 border border-slate-800 rounded-3xl animate-pulse" />
          ) : !selectedClaim ? (
            <div className="border border-slate-850 bg-slate-900/10 rounded-3xl p-12 text-center text-xs text-slate-500">
              No claims submitted by this customer.
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-300">
              
              {/* Claim Profile Overview */}
              <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg shadow-black/10">
                <div className="flex justify-between items-start border-b border-slate-850 pb-3">
                  <div>
                    <h4 className="font-extrabold text-sm text-white font-mono leading-none">{selectedClaim.claim_number}</h4>
                    <span className="text-[9px] text-slate-550 block mt-1 uppercase font-semibold">
                      Class: {selectedClaim.claim_type.replace('_', ' ')}
                    </span>
                  </div>
                  <StatusBadge status={selectedClaim.status} />
                </div>

                <div className="grid grid-cols-2 gap-3.5 text-[10px]">
                  <div>
                    <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px] flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-655" />
                      <span>Occurrence Date</span>
                    </span>
                    <p className="text-slate-300 font-semibold mt-1">
                      {new Date(selectedClaim.incident_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-655" />
                      <span>Incident Location</span>
                    </span>
                    <p className="text-slate-300 font-semibold mt-1 truncate max-w-[150px]">
                      {selectedClaim.incident_location}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Estimated Damages</span>
                    <p className="text-slate-200 font-extrabold text-xs mt-1">₹ {selectedClaim.estimated_amount.toLocaleString()}</p>
                  </div>
                  {selectedClaim.approved_amount !== null && (
                    <div>
                      <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Approved Amount</span>
                      <p className="text-emerald-400 font-extrabold text-xs mt-1">₹ {selectedClaim.approved_amount.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-850/60 text-[10px]">
                  <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Incident Description Narrative</span>
                  <div className="p-3 bg-slate-950 border border-slate-855 rounded-xl leading-relaxed text-slate-350 font-normal whitespace-pre-wrap">
                    {selectedClaim.incident_description}
                  </div>
                </div>
              </div>

              {/* Photos & Visual Evidence Panel */}
              <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg shadow-black/10">
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-white border-b border-slate-850 pb-2">
                  Uploaded Evidence Attachments ({selectedClaim.images?.length || 0})
                </h4>

                {!selectedClaim.images || selectedClaim.images.length === 0 ? (
                  <p className="text-[10.5px] text-slate-550 py-3 text-center">No visual damage evidence photos uploaded.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5">
                    {selectedClaim.images.map((img: ClaimImage) => (
                      <div
                        key={img.id}
                        onClick={() => setActiveImage(img.signed_url)}
                        className="relative group aspect-square rounded-xl overflow-hidden bg-slate-950 border border-slate-850 cursor-pointer hover:border-violet-500 transition-colors"
                      >
                        <Image src={img.signed_url} alt="Evidence thumbnail" fill className="object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                          <Maximize2 className="w-4 h-4 text-white" />
                          {img.ai_damage_confidence !== null && (
                            <span className="text-[8px] font-black bg-blue-500 px-1 rounded text-white">
                              {Math.round(img.ai_damage_confidence * 100)}% Match
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI assessment evaluations triage */}
              {aiSummary && (
                <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-tr from-slate-950 to-slate-900 p-5 space-y-4 shadow-lg shadow-black/25">
                  <div className="absolute -top-10 -right-10 w-36 h-36 bg-[#1B4FD8]/5 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
                    <Cpu className="w-4.5 h-4.5 text-blue-400" />
                    <h4 className="font-extrabold text-xs uppercase tracking-wider text-white">Co-Pilot Risk & Coverage Assessment</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5 text-[10px] items-center">
                    <div className="space-y-1">
                      <span className="text-slate-550 font-bold uppercase tracking-wider block text-[8px]">AI Risk Score</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-black text-xs ${
                          (selectedClaim.ai_risk_score ?? aiSummary.risk_score) >= 0.7 
                            ? 'text-rose-400' 
                            : (selectedClaim.ai_risk_score ?? aiSummary.risk_score) >= 0.4 
                              ? 'text-amber-400' 
                              : 'text-emerald-400'
                        }`}>
                          {((selectedClaim.ai_risk_score ?? aiSummary.risk_score) * 100).toFixed(0)}% Match Deviation
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-slate-550 font-bold uppercase tracking-wider block text-[8px]">Coverage Review</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#16A34A]/10 border border-[#16A34A]/25 text-[#16A34A] uppercase tracking-wide">
                        {aiSummary.coverage_assessment}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 border border-slate-855 rounded-xl text-[10px] space-y-1 shadow-inner">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400 block flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-blue-400" />
                      <span>Triage Narrative for Assessors</span>
                    </span>
                    <p className="text-slate-350 leading-relaxed font-normal">
                      {aiSummary.summary_for_officer}
                    </p>
                  </div>
                </div>
              )}

              {/* Read-Only Mode Notice */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-900 shrink-0">
                <Info className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-[10px] text-slate-500 font-medium">You have read-only access as an advisor. Only the insurer officer can approve or reject claims.</span>
              </div>

            </div>
          )}
        </section>

      </div>

      {/* ── Lightbox preview modal dialogue ──────────────────────────────────── */}
      {activeImage && (
        <div
          onClick={() => setActiveImage(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-3 shadow-2xl flex flex-col md:flex-row gap-5 animate-in zoom-in-95 duration-200 overflow-hidden"
          >
            <button
              onClick={() => setActiveImage(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-black/60 border border-white/10 cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex-1 aspect-square rounded-2xl overflow-hidden bg-slate-950 relative">
              <Image src={activeImage} alt="Damage details preview" fill className="object-contain" />
            </div>

            {/* Check Vision Tags details */}
            {selectedClaim?.images?.find((i: any) => i.signed_url === activeImage)?.ai_damage_tags && (
              <div className="w-full md:w-64 flex flex-col justify-between py-2 pr-2 text-xs space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    <span className="font-extrabold text-xs text-white uppercase tracking-wider">AI Photo Verification</span>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Vision Tags Detected</span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(selectedClaim.images.find((i: any) => i.signed_url === activeImage)!.ai_damage_tags!).map(([tag, val]) => (
                          <span key={tag} className="px-2 py-0.5 rounded bg-slate-850 text-slate-350 text-[10px] font-semibold border border-slate-800">
                            {tag}: {String(val)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}



    </div>
  );
}
