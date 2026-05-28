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
  const insurerName = policy?.insurer_name || (pObj?.insurerName as string) || "Unknown";
  const policyNumber = policy?.policy_number || (pObj?.policyNumber as string) || "";
  const vehicleRegistration = policy?.vehicle_registration || (pObj?.vehicleRegistration as string) || "Unknown";
  const vehicleYear = policy?.vehicle_year || (pObj?.vehicleYear as number) || 2024;
  const vehicleMake = policy?.vehicle_make || (pObj?.vehicleMake as string) || "";
  const vehicleModel = policy?.vehicle_model || (pObj?.vehicleModel as string) || "";
  const startDate = policy?.start_date || (pObj?.startDate as string);
  const endDate = policy?.end_date || (pObj?.endDate as string);
  const status = policy?.status || (pObj?.status as string) || "active";

  const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) : "Unknown";
  const formattedEndDate = endDate ? new Date(endDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) : "Unknown";

  return (
    <Link href={`/policies/${policy.id}`} className="block group">
      <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-[#1B4FD8]/40 hover:bg-slate-900/80 transition-all duration-300 shadow-lg shadow-black/25 group-hover:scale-[1.01]">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1B4FD8]/10 text-blue-400 flex items-center justify-center border border-[#1B4FD8]/10 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base group-hover:text-blue-400 transition-colors line-clamp-1">
                {insurerName}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {policyNumber}
              </p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-800/60">
          <div className="flex items-center gap-2.5 text-sm text-slate-300">
            <Car className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="font-semibold tracking-wide uppercase text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
              {vehicleRegistration}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-400 truncate">
              {vehicleYear} {vehicleMake} {vehicleModel}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              {formattedStartDate} — {formattedEndDate}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
