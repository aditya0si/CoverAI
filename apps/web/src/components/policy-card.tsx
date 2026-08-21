import React from 'react';
import Link from 'next/link';
import { Calendar, Shield, Car } from 'lucide-react';
import { PolicyDetail } from '@/lib/api-client';
import { StatusBadge } from './status-badge';

interface PolicyCardProps {
  policy: PolicyDetail;
}

export function PolicyCard({ policy }: PolicyCardProps) {
  const pObj = policy as unknown as Record<string, unknown>;
  const insurerName = policy?.insurer_name || (pObj?.insurerName as string) || 'Unknown Insurer';
  const policyNumber = policy?.policy_number || (pObj?.policyNumber as string) || '';
  const vehicleRegistration = policy?.vehicle_registration || (pObj?.vehicleRegistration as string) || 'N/A';
  const vehicleYear = policy?.vehicle_year || (pObj?.vehicleYear as number) || 2024;
  const vehicleMake = policy?.vehicle_make || (pObj?.vehicleMake as string) || '';
  const vehicleModel = policy?.vehicle_model || (pObj?.vehicleModel as string) || '';
  const startDate = policy?.start_date || (pObj?.startDate as string);
  const endDate = policy?.end_date || (pObj?.endDate as string);
  const status = policy?.status || (pObj?.status as string) || 'active';

  const formattedStartDate = startDate
    ? new Date(startDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown';
  const formattedEndDate = endDate
    ? new Date(endDate).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown';

  return (
    <Link href={`/policies/${policy.id}`} className="block group">
      <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 hover:border-[#8C847B] transition-all duration-200 shadow-2xs">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] text-[#191919] flex items-center justify-center shrink-0">
              <Shield className="w-4.5 h-4.5 text-[#191919]" />
            </div>
            <div>
              <h3 className="font-serif-heading font-semibold text-base text-[#191919] group-hover:text-[#D2654A] transition-colors line-clamp-1">
                {insurerName}
              </h3>
              <p className="text-[10px] text-[#8C847B] font-mono mt-0.5 uppercase tracking-wider">
                {policyNumber}
              </p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="space-y-2.5 pt-3 border-t border-[#E2DDD4]">
          <div className="flex items-center gap-2 text-xs text-[#4A443E]">
            <Car className="w-3.5 h-3.5 text-[#8C847B] shrink-0" />
            <span className="font-mono font-semibold uppercase text-[11px] px-1.5 py-0.5 rounded bg-[#FAF8F5] border border-[#E2DDD4] text-[#191919]">
              {vehicleRegistration}
            </span>
            <span className="text-[#8C847B]">·</span>
            <span className="text-xs text-[#6E6862] truncate">
              {vehicleYear} {vehicleMake} {vehicleModel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#8C847B]">
            <Calendar className="w-3.5 h-3.5 text-[#8C847B] shrink-0" />
            <span>
              {formattedStartDate} — {formattedEndDate}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
