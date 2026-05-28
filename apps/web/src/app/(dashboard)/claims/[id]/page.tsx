'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { 
  Calendar, 
  MapPin, 
  ArrowLeft, 
  Cpu,
  CheckCircle,
  HelpCircle,
  Maximize2,
  X,
  FileQuestion,
  Zap
} from 'lucide-react';
import { getClaim } from '@/lib/api-client';
import { StatusBadge } from '@/components/status-badge';
import { useAppStore } from '@/lib/store';

export default function ClaimDetailPage() {
  const { id: claimId } = useParams() as { id: string };
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { showToast } = useAppStore();

  const [activeImage, setActiveImage] = useState<string | null>(null);

  // Fetch Claim Detail
  const { data: claim, isLoading, error } = useQuery({
    queryKey: ['claim', claimId],
    queryFn: () => getClaim(claimId),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-900 rounded" />
        <div className="h-16 bg-slate-900 border border-slate-800 rounded-3xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-slate-900 border border-slate-800 rounded-3xl" />
          <div className="h-96 bg-slate-900 border border-slate-800 rounded-3xl" />
        </div>
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/10 mx-auto">
          <FileQuestion className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white">Claim Not Found</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          The claim you are looking for does not exist or you do not have permission to view it.
        </p>
        <button onClick={() => router.push('/claims')} className="text-xs font-semibold text-blue-400 hover:underline">
          Return to Claims
        </button>
      </div>
    );
  }

  const createdDate = new Date(claim.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const incidentDate = new Date(claim.incident_date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Calculate Risk Score mappings
  const riskScore = claim.ai_risk_score !== null ? claim.ai_risk_score : (claim.ai_summary?.risk_score ?? 0);
  const percentScore = Math.round(riskScore * 100);

  let riskColor = 'bg-emerald-500';
  let riskTextColor = 'text-emerald-400';
  let riskLevel = 'Low Risk';

  if (riskScore > 0.35 && riskScore <= 0.70) {
    riskColor = 'bg-[#D97706]';
    riskTextColor = 'text-[#D97706]';
    riskLevel = 'Medium Risk';
  } else if (riskScore > 0.70) {
    riskColor = 'bg-[#DC2626]';
    riskTextColor = 'text-[#DC2626]';
    riskLevel = 'High Risk';
  }

  // Customer rephrased summary from summary_for_officer
  const rawSummary = claim.ai_summary?.summary_for_officer || '';
  const customerFriendlySummary = rawSummary
    ? `Our co-pilot verified details of this incident: ${rawSummary.replace(/The claimant|The insured/i, 'You')}`
    : "Our AI systems are running checks on this claim. We cross-reference the damage photos and incident description to automatically confirm coverage scope for fast-track approvals.";

  const activeImgObj = claim.images.find(img => img.signed_url === activeImage);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Back navigation */}
      <div>
        <button 
          onClick={() => router.push('/claims')} 
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white font-semibold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Claims</span>
        </button>
      </div>

      {/* Main Claim Header */}
      <section className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-md shadow-black/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">{claim.claim_number}</h1>
            <StatusBadge status={claim.status} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Filed on {createdDate} • Class: <span className="uppercase">{claim.claim_type.replace('_', ' ')}</span></p>
        </div>

        <div className="flex gap-3">
          <div className="text-right">
            <span className="text-[9px] text-slate-500 block uppercase tracking-wider font-bold">Estimated Damages</span>
            <span className="font-bold text-sm text-slate-200">
              ₹ {claim.estimated_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          {claim.approved_amount !== null && (
            <div className="text-right border-l border-slate-800 pl-4">
              <span className="text-[9px] text-[#16A34A] block uppercase tracking-wider font-bold">Approved Payout</span>
              <span className="font-black text-sm text-[#16A34A]">
                ₹ {claim.approved_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Main Grid Splitting Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Details + Evidence (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Incident Details Card */}
          <section className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/25 space-y-4">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-white border-b border-slate-800 pb-3">
              Incident Specifications
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>Occurrence Date</span>
                </span>
                <p className="font-semibold text-slate-200">{incidentDate}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-600" />
                  <span>Location Location</span>
                </span>
                <p className="font-semibold text-slate-200 truncate">{claim.incident_location}</p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 text-xs">
              <span className="text-[10px] text-slate-500 block">Accident Narrative Description</span>
              <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl leading-relaxed text-slate-300 font-normal whitespace-pre-wrap">
                {claim.incident_description}
              </div>
            </div>
          </section>

          {/* Evidence Attachments Grid */}
          <section className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/25 space-y-4">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-white border-b border-slate-800 pb-3">
              Evidence Attachments ({claim.images.length})
            </h3>

            {claim.images.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No files uploaded.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {claim.images.map((img) => (
                  <div 
                    key={img.id} 
                    onClick={() => setActiveImage(img.signed_url)}
                    className="relative group aspect-square rounded-xl overflow-hidden bg-slate-950 border border-slate-850 cursor-pointer shadow-md shadow-black/10 hover:border-blue-500/55 transition-all"
                  >
                    <Image src={img.signed_url} alt="Damage evidence" fill className="object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* AI Assessment Panel */}
          {claim.ai_summary && (
            <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-tr from-slate-950 to-slate-900 p-5 shadow-lg shadow-black/25 space-y-5">
              <div className="absolute -top-10 -right-10 w-44 h-44 bg-[#1B4FD8]/5 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Cpu className="w-4.5 h-4.5 text-blue-400" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-white">
                  Intelligent Co-Pilot Assessment
                </h3>
              </div>

              {/* Grid split */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs items-center">
                
                {/* Risk score */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-slate-500">
                    <span>Risk Evaluation</span>
                    <span className={riskTextColor}>{riskLevel}</span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${riskColor}`} style={{ width: `${percentScore}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 block">{percentScore}% match variation</span>
                </div>

                {/* Coverage status */}
                <div className="space-y-1 sm:border-l sm:border-slate-800 sm:pl-5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Coverage Match</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#16A34A]/10 border border-[#16A34A]/25 text-[#16A34A] tracking-wider uppercase mt-1">
                    {claim.ai_summary.coverage_assessment}
                  </span>
                </div>

                {/* Key matching rules */}
                <div className="space-y-1 sm:border-l sm:border-slate-800 sm:pl-5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Active Clauses Matches</span>
                  <p className="text-slate-350 mt-1 font-medium truncate max-w-full">
                    {claim.ai_summary.key_policy_clauses?.slice(0, 2).join(', ') || 'Standard vehicle policy'}
                  </p>
                </div>

              </div>

              {/* Summary narrative */}
              <div className="p-3.5 bg-slate-900 border border-slate-800/80 rounded-xl text-xs space-y-1.5 leading-normal">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-blue-400" />
                  <span>Verified Damage Exclusions Checklist</span>
                </span>
                <p className="text-slate-300 font-normal leading-relaxed">
                  {customerFriendlySummary}
                </p>
              </div>
            </section>
          )}

        </div>

        {/* Right Column: Status Timeline & Action (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Status Timeline History Stepper */}
          <section className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/25 space-y-5">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-white border-b border-slate-800 pb-3">
              Status Timeline
            </h3>

            {claim.status_history && claim.status_history.length > 0 ? (
              <div className="relative pl-6 space-y-6 text-xs before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-900">
                {claim.status_history.map((log) => {
                  const logDate = new Date(log.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  const afterState = log.after_state as Record<string, string> | null;
                  const remarks = afterState?.remarks;

                  return (
                    <div key={log.id} className="relative space-y-1 animate-in fade-in duration-300">
                      <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[#1B4FD8] border-2 border-slate-950 flex items-center justify-center shadow shadow-[#1B4FD8]/20 z-10 shrink-0" />
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white capitalize leading-normal">
                          {log.action.replace('CLAIM_', '').replace('_', ' ').toLowerCase()}
                        </span>
                        <span className="text-[9px] text-slate-500 font-medium">{logDate}</span>
                      </div>
                      {remarks && (
                        <p className="text-slate-400 text-[11px] bg-slate-950/40 p-2 rounded-lg border border-slate-850 mt-1 italic font-normal">
                          &quot;{remarks}&quot;
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs">
                No history log registered yet.
              </div>
            )}
          </section>

          {/* Help Co-Pilot Action Card */}
          <section className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/25 text-center space-y-3.5">
            <HelpCircle className="w-8 h-8 text-[#1B4FD8] mx-auto opacity-90" />
            <div>
              <h3 className="font-extrabold text-sm text-white">Need Help?</h3>
              <p className="text-[10px] text-slate-400 mt-1 leading-normal">Have a question regarding your payout amounts or claim triage outcomes? Chat with our co-pilot.</p>
            </div>
            <button
              onClick={() => router.push(`/policies/${claim.policy_id}`)}
              className="w-full py-2 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-semibold shadow-md shadow-[#1B4FD8]/15 transition-colors cursor-pointer"
            >
              Ask Insurance Assistant
            </button>
          </section>

        </div>

      </div>

      {/* Lightbox dialog for enlarge thumbnail viewing */}
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

            {/* Left Hand: Image */}
            <div className="flex-1 aspect-square rounded-2xl overflow-hidden bg-slate-950">
              <Image src={activeImage!} alt="Enlarged damage preview" fill className="object-contain" />
            </div>

            {/* Right Hand: AI Tags if present */}
            {activeImgObj?.ai_damage_tags && (
              <div className="w-full md:w-64 flex flex-col justify-between py-2 pr-2 text-xs space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    <span className="font-extrabold text-xs text-white uppercase tracking-wider">AI Photo Verification</span>
                  </div>
                  
                  {/* AI Tags details */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Vision Tags Detected</span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(activeImgObj.ai_damage_tags).map(([tag, val]) => (
                          <span key={tag} className="px-2 py-0.5 rounded bg-slate-800 text-slate-350 text-[10px] font-semibold border border-slate-850">
                            {tag}: {String(val)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1 pt-1.5">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Assessor Confidence</span>
                      <p className="font-bold text-white text-xs mt-1">
                        {activeImgObj.ai_damage_confidence !== null 
                          ? `${Math.round(activeImgObj.ai_damage_confidence * 100)}% Match Accuracy`
                          : 'Standard Verification'
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[#16A34A]/5 border border-[#16A34A]/15 text-[#16A34A] rounded-xl flex items-start gap-2 leading-relaxed text-[11px] font-medium">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Image securely encrypted and hashed in audit record.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
