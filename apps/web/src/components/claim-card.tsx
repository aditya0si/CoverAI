import React from 'react';
import Link from 'next/link';
import { Calendar, AlertCircle } from 'lucide-react';
import { StatusBadge } from './status-badge';

interface ClaimCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claim: any;
}

export function ClaimCard({ claim }: ClaimCardProps) {
  const claimId = claim.id;
  const claimNumber = claim.claim_number || claim.claimNumber || 'CLM-UNKNOWN';
  const claimType = claim.claim_type || claim.claimType || 'own_damage';
  const estimatedAmount = claim.estimated_amount !== undefined ? claim.estimated_amount : (claim.estimatedAmount || 0);
  const incidentDateStr = claim.incident_date || claim.incidentDate;
  const status = claim.status || 'submitted';

  const formattedDate = incidentDateStr 
    ? new Date(incidentDateStr).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown Date';

  return (
    <Link href={`/claims/${claimId}`} className="block group">
      <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 hover:border-[#8C847B] transition-all duration-200 shadow-2xs">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] text-[#191919] flex items-center justify-center shrink-0">
              <AlertCircle className="w-4.5 h-4.5 text-[#D2654A]" />
            </div>
            <div>
              <h3 className="font-mono font-bold text-[#191919] text-sm group-hover:text-[#D2654A] transition-colors line-clamp-1">
                {claimNumber}
              </h3>
              <p className="text-[10px] font-semibold text-[#8C847B] uppercase tracking-wider mt-0.5">
                {claimType.replace('_', ' ')}
              </p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="space-y-2.5 pt-3 border-t border-[#E2DDD4]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-[#6E6862]">
              <Calendar className="w-3.5 h-3.5 text-[#8C847B] shrink-0" />
              <span>Incident: {formattedDate}</span>
            </div>
            <div className="font-bold text-[#191919] text-xs">
              ₹ {estimatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
