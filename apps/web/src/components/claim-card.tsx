import React from 'react';
import Link from 'next/link';
import { Calendar, AlertCircle } from 'lucide-react';
import { StatusBadge } from './status-badge';

interface ClaimCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claim: any; // Accept flexible formats
}

export function ClaimCard({ claim }: ClaimCardProps) {
  // Resolve camelCase or snake_case attributes
  const claimId = claim.id;
  const claimNumber = claim.claim_number || claim.claimNumber || 'CLM-UNKNOWN';
  const claimType = claim.claim_type || claim.claimType || 'own_damage';
  const estimatedAmount = claim.estimated_amount !== undefined ? claim.estimated_amount : (claim.estimatedAmount || 0);
  const incidentDateStr = claim.incident_date || claim.incidentDate;
  const status = claim.status || 'submitted';

  const formattedDate = incidentDateStr 
    ? new Date(incidentDateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown Date';

  return (
    <Link href={`/claims/${claimId}`} className="block group">
      <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-[#1B4FD8]/40 hover:bg-slate-900/80 transition-all duration-300 shadow-lg shadow-black/25 group-hover:scale-[1.01]">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center border border-violet-500/10 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base group-hover:text-blue-400 transition-colors line-clamp-1">
                {claimNumber}
              </h3>
              <p className="text-[11px] font-semibold text-slate-500 font-sans tracking-wide uppercase mt-0.5">
                {claimType.replace('_', ' ')}
              </p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Incident: {formattedDate}</span>
            </div>
            <div className="font-semibold text-slate-200 text-sm">
              ₹ {estimatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
