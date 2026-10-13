'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  X,
  Bot,
  Info,
} from 'lucide-react';
import { getClaim, patchClaimStatus, selfAssignClaim } from '@/lib/api-client';
import { AuditLog, ClaimImage, AITriageAssessment } from '@/lib/api-client';
import { ClaimStatus } from '@coverai/shared-types';
import { useAppStore } from '@/lib/store';

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Partial<Record<ClaimStatus, ClaimStatus[]>> = {
  submitted: ['under_review'],
  under_review: ['approved', 'rejected', 'surveyor_assigned'],
  surveyor_assigned: ['approved', 'rejected'],
};

function getRiskColor(score: number): string {
  if (score >= 0.7) return '#F87171'; // red-400
  if (score >= 0.4) return '#FBBF24'; // amber-400
  return '#34D399'; // emerald-400
}

// SVG arc gauge (0–1 score)
function RiskGauge({ score }: { score: number }) {
  const pct = Math.min(1, Math.max(0, score));
  const angle = pct * 180; // 0° = left, 180° = right (semicircle)
  const r = 42;
  const cx = 60;
  const cy = 60;
  const startAngle = 180;
  const endAngle = startAngle + angle;
  const toRad = (a: number) => (a * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = angle > 180 ? 1 : 0;
  const color = getRiskColor(pct);
  const label = pct >= 0.7 ? 'High Risk' : pct >= 0.4 ? 'Medium Risk' : 'Low Risk';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 120 70" className="w-36 h-auto">
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {pct > 0 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
          />
        )}
        {/* Score text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="bold" fill="white">
          {pct.toFixed(2)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="7" fill="#94a3b8">
          Risk Score
        </text>
      </svg>
      <span
        className="text-[11px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full border"
        style={{ color, borderColor: `${color}40`, backgroundColor: `${color}15` }}
      >
        {label}
      </span>
    </div>
  );
}

// Status badge
function StatusBadge({ status }: { status: ClaimStatus }) {
  const map: Partial<Record<ClaimStatus, string>> = {
    draft: 'bg-slate-700/50 text-slate-400 border-slate-700',
    submitted: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    under_review: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    surveyor_assigned: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    settled: 'bg-teal-500/15 text-teal-400 border-teal-500/25',
    disputed: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border capitalize ${map[status] || 'bg-slate-700/50 text-slate-400 border-slate-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// Image gallery with modal
function ImageGallery({ images }: { images: ClaimImage[] }) {
  const [active, setActive] = useState<ClaimImage | null>(null);
  if (!images || images.length === 0) {
    return <p className="text-xs text-slate-500 italic py-4">No images attached to this claim.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((img) => (
          <div key={img.id} className="space-y-2">
            <button
              onClick={() => setActive(img)}
              className="w-full aspect-video rounded-xl overflow-hidden border border-slate-800 hover:border-amber-500/40 transition-colors cursor-pointer block"
            >
              {img.signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.signed_url}
                  alt="Claim damage"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-500">
                  Image unavailable
                </div>
              )}
            </button>
            {/* AI Damage Tags */}
            {img.ai_damage_tags && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(img.ai_damage_tags).map(([tag, conf]) => (
                  <span
                    key={tag}
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  >
                    {tag} {typeof conf === 'number' ? `${Math.round(conf * 100)}%` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {active && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setActive(null)}
              className="absolute -top-10 right-0 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            {active.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.signed_url}
                alt="Enlarged damage"
                className="w-full rounded-2xl max-h-[80vh] object-contain"
              />
            ) : (
              <div className="w-full h-64 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400">
                Image unavailable
              </div>
            )}
            {active.ai_damage_tags && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.entries(active.ai_damage_tags).map(([tag, conf]) => (
                  <span
                    key={tag}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  >
                    {tag} {typeof conf === 'number' ? `${Math.round(conf * 100)}%` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// AI Triage Summary Card
function AITriageCard({ summary, score }: { summary: AITriageAssessment | null; score: number | null }) {
  const [clausesOpen, setClausesOpen] = useState(false);

  if (!summary && score === null) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 text-center py-8">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin mx-auto mb-2" />
        <p className="text-xs text-slate-500">AI analysis is running in the background…</p>
      </div>
    );
  }

  const displayScore = score ?? summary?.risk_score ?? 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Advisory label */}
      <div className="flex items-center gap-2 px-5 py-3 bg-amber-500/8 border-b border-amber-500/15">
        <Bot className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">AI-Assisted Analysis</p>
          <p className="text-[9px] text-slate-500">Final decision is with the officer. This is advisory only.</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Risk Gauge */}
        <div className="flex justify-center">
          <RiskGauge score={displayScore} />
        </div>

        {summary && (
          <>
            {/* Coverage Assessment */}
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Coverage Assessment</p>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${
                summary.coverage_assessment?.toLowerCase().includes('covered')
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : summary.coverage_assessment?.toLowerCase().includes('partial')
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}>
                {summary.coverage_assessment || 'Unknown'}
              </span>
            </div>

            {/* Key Policy Clauses */}
            {summary.key_policy_clauses?.length > 0 && (
              <div className="space-y-1.5">
                <button
                  onClick={() => setClausesOpen((o) => !o)}
                  className="flex items-center justify-between w-full text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  <span>Key Policy Clauses ({summary.key_policy_clauses.length})</span>
                  {clausesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {clausesOpen && (
                  <ul className="space-y-1 pl-3 border-l border-slate-800">
                    {summary.key_policy_clauses.map((clause, i) => (
                      <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                        <span className="text-amber-400 mt-0.5 shrink-0">·</span>
                        {clause}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Red Flags */}
            {summary.red_flags?.length > 0 && (
              <div className="bg-rose-500/8 border border-rose-500/15 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Red Flags</span>
                </div>
                <ul className="space-y-1">
                  {summary.red_flags.map((flag, i) => (
                    <li key={i} className="text-xs text-rose-300 flex items-start gap-2">
                      <span className="text-rose-500 mt-0.5 shrink-0">⚠</span>
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended Action */}
            {summary.recommended_action && (
              <div className="bg-[#1B4FD8]/8 border border-[#1B4FD8]/20 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1.5">Recommended Action</p>
                <p className="text-xs text-slate-300 leading-relaxed">{summary.recommended_action}</p>
              </div>
            )}

            {/* Summary for Officer */}
            {summary.summary_for_officer && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Officer Summary</p>
                <p className="text-xs text-slate-400 leading-relaxed border-l-2 border-slate-700 pl-3">
                  {summary.summary_for_officer}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Status History Timeline
function StatusTimeline({ history }: { history: AuditLog[] }) {
  if (!history || history.length === 0) {
    return <p className="text-xs text-slate-500 italic">No status history available.</p>;
  }
  return (
    <div className="relative pl-5 space-y-4">
      <div className="absolute left-1.5 top-1 bottom-0 w-px bg-slate-800" />
      {history.map((log, i) => (
        <div key={log.id || i} className="relative">
          <div className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full bg-slate-700 border-2 border-slate-600" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                {log.action?.replace(/_/g, ' ')}
              </span>
              {log.after_state && typeof log.after_state === 'object' && 'status' in log.after_state && (
                <span className="text-[9px] text-slate-500">
                  → {String(log.after_state.status).replace(/_/g, ' ')}
                </span>
              )}
            </div>
            {log.after_state && typeof log.after_state === 'object' && 'remarks' in log.after_state && (
              <p className="text-[10px] text-slate-500 mt-0.5 italic">
                &ldquo;{String(log.after_state.remarks)}&rdquo;
              </p>
            )}
            <p className="text-[9px] text-slate-600 mt-0.5">
              {new Date(log.created_at).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function InsurerClaimReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useAppStore();

  const { data: claim, isLoading } = useQuery({
    queryKey: ['claim', id],
    queryFn: () => getClaim(id),
    enabled: !!id,
  });

  const [newStatus, setNewStatus] = useState<ClaimStatus | ''>('');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [remarks, setRemarks] = useState('');

  const patchMutation = useMutation({
    mutationFn: (data: { status: ClaimStatus; remarks: string; approved_amount?: number }) =>
      patchClaimStatus(id, data),
    onSuccess: () => {
      showToast('Decision saved successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['claim', id] });
      queryClient.invalidateQueries({ queryKey: ['insurer-queue'] });
      setNewStatus('');
      setRemarks('');
      setApprovedAmount('');
    },
    onError: () => showToast('Failed to save decision. Please try again.', 'error'),
  });

  const selfAssignMutation = useMutation({
    mutationFn: () => selfAssignClaim(id),
    onSuccess: () => {
      showToast('Claim assigned to you.', 'success');
      queryClient.invalidateQueries({ queryKey: ['claim', id] });
    },
  });

  const handleSaveDecision = () => {
    if (!newStatus) return;
    if (!remarks.trim()) {
      showToast('Please add remarks before saving.', 'error');
      return;
    }
    const payload: { status: ClaimStatus; remarks: string; approved_amount?: number } = {
      status: newStatus as ClaimStatus,
      remarks: remarks.trim(),
    };
    if (newStatus === 'approved' && approvedAmount) {
      payload.approved_amount = parseFloat(approvedAmount);
    }
    patchMutation.mutate(payload);
  };

  const validNextStatuses = claim ? (VALID_TRANSITIONS[claim.status] || []) : [];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="h-8 w-48 bg-slate-800 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
            ))}
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="text-center py-24 text-slate-500">
        <p className="text-sm">Claim not found.</p>
        <button onClick={() => router.back()} className="mt-4 text-amber-400 text-xs hover:text-amber-300 cursor-pointer">
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Back + Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-extrabold text-[#191919] tracking-tight">{claim.claim_number}</h1>
            <StatusBadge status={claim.status} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Filed {new Date(claim.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {/* Self-assign if not yet assigned */}
        {!claim.assigned_officer_id && (
          <button
            onClick={() => selfAssignMutation.mutate()}
            disabled={selfAssignMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            {selfAssignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Assign to Me
          </button>
        )}
      </div>

      {/* 3-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── LEFT PANEL: Policy Context (4 cols) ─────────────────────────── */}
        <div className="lg:col-span-4 space-y-5">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              Policy Context
            </h2>

            {claim.policy ? (
              <div className="space-y-4">
                {/* Policy Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Policy Number</span>
                    <span className="text-xs font-bold text-white">{claim.policy.policy_number}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Insurer</span>
                    <span className="text-xs font-bold text-blue-400">{claim.policy.insurer_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Policy Type</span>
                    <span className="text-xs font-semibold text-slate-300 capitalize">{claim.policy.policy_type?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border capitalize ${
                      claim.policy.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                      'bg-rose-500/15 text-rose-400 border-rose-500/25'
                    }`}>{claim.policy.status}</span>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vehicle Details</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] text-slate-600 block">Registration</span>
                      <span className="text-xs text-slate-300 font-semibold">{claim.policy.vehicle_registration}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-600 block">Make</span>
                      <span className="text-xs text-slate-300 font-semibold">{claim.policy.vehicle_make}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-600 block">Model</span>
                      <span className="text-xs text-slate-300 font-semibold">{claim.policy.vehicle_model}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-600 block">Year</span>
                      <span className="text-xs text-slate-300 font-semibold">{claim.policy.vehicle_year}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Coverage Details</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[10px] text-slate-500">Sum Insured</span>
                      <span className="text-xs font-bold text-emerald-400">₹{Number(claim.policy.sum_insured).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-slate-500">Premium</span>
                      <span className="text-xs font-semibold text-slate-300">₹{Number(claim.policy.premium_amount).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-slate-500">Valid From</span>
                      <span className="text-xs text-slate-300">{new Date(claim.policy.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-slate-500">Valid Until</span>
                      <span className="text-xs text-slate-300">{new Date(claim.policy.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Policy details unavailable.</p>
            )}
          </section>

          {/* Extracted Policy Text Viewer */}
          {claim.policy?.extracted_text && (
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Extracted Policy Text</h2>
              <div className="max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                <pre className="text-[10px] text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
                  {claim.policy.extracted_text}
                </pre>
              </div>
            </section>
          )}
        </div>

        {/* ── CENTER PANEL: Evidence (4 cols) ────────────────────────────── */}
        <div className="lg:col-span-4 space-y-5">
          {/* Claim Details Summary */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Claim Details</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ['Claim Type', claim.claim_type?.replace(/_/g, ' ')],
                ['Incident Date', new Date(claim.incident_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })],
                ['Location', claim.incident_location],
                ['Estimated Amount', `₹${Number(claim.estimated_amount).toLocaleString('en-IN')}`],
                ['Approved Amount', claim.approved_amount ? `₹${Number(claim.approved_amount).toLocaleString('en-IN')}` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className="text-xs text-slate-200 capitalize">{value || '—'}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Incident Description */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer Incident Description</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{claim.incident_description}</p>
          </section>

          {/* Image Gallery */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Damage Images ({claim.images?.length || 0})
            </h2>
            <ImageGallery images={claim.images || []} />
          </section>
        </div>

        {/* ── RIGHT PANEL: AI + Decision (4 cols) ───────────────────────── */}
        <div className="lg:col-span-4 space-y-5">
          {/* AI Triage Summary */}
          <AITriageCard
            summary={typeof claim.ai_summary === 'object' ? claim.ai_summary as AITriageAssessment : null}
            score={claim.ai_risk_score ?? null}
          />

          {/* Decision Panel */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Decision Panel</h2>

            {validNextStatuses.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/50 rounded-xl p-3">
                <Info className="w-4 h-4 shrink-0" />
                <span>This claim has no further status transitions available.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Status dropdown */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Update Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as ClaimStatus | '')}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-3 py-2.5 focus:outline-none focus:border-amber-500 transition-colors"
                  >
                    <option value="">Select next status…</option>
                    {validNextStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Approved amount (only when approving) */}
                {newStatus === 'approved' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Approved Amount (₹) <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">₹</span>
                      <input
                        type="number"
                        min="0"
                        value={approvedAmount}
                        onChange={(e) => setApprovedAmount(e.target.value)}
                        placeholder={claim.estimated_amount ? String(claim.estimated_amount) : '0.00'}
                        className="w-full pl-7 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Remarks */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Remarks <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Add your decision rationale…"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                  />
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveDecision}
                  disabled={!newStatus || !remarks.trim() || patchMutation.isPending || (newStatus === 'approved' && !approvedAmount)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  {patchMutation.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                  ) : newStatus === 'approved' ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Approve Claim</>
                  ) : newStatus === 'rejected' ? (
                    <><XCircle className="w-3.5 h-3.5" /> Reject Claim</>
                  ) : (
                    <><Clock className="w-3.5 h-3.5" /> Save Decision</>
                  )}
                </button>
              </div>
            )}
          </section>

          {/* Status History Timeline */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Status History</h2>
            <StatusTimeline history={claim.status_history || []} />
          </section>
        </div>
      </div>
    </div>
  );
}
