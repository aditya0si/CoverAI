import React from 'react';
import { cn } from '@coverai/ui';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase();

  const config: Record<string, { bg: string; text: string; label: string }> = {
    // Policy Statuses
    active: { bg: 'bg-[#16A34A]/10 border-[#16A34A]/25', text: 'text-[#16A34A]', label: 'Active' },
    expired: { bg: 'bg-[#DC2626]/10 border-[#DC2626]/25', text: 'text-[#DC2626]', label: 'Expired' },
    cancelled: { bg: 'bg-slate-800 border-slate-700', text: 'text-slate-400', label: 'Cancelled' },
    draft: { bg: 'bg-slate-800 border-slate-700', text: 'text-slate-400', label: 'Draft' },

    // Claim Statuses
    submitted: { bg: 'bg-[#1B4FD8]/10 border-[#1B4FD8]/25', text: 'text-[#1B4FD8]', label: 'Submitted' },
    under_review: { bg: 'bg-[#D97706]/10 border-[#D97706]/25', text: 'text-[#D97706]', label: 'Under Review' },
    approved: { bg: 'bg-[#16A34A]/10 border-[#16A34A]/25', text: 'text-[#16A34A]', label: 'Approved' },
    rejected: { bg: 'bg-[#DC2626]/10 border-[#DC2626]/25', text: 'text-[#DC2626]', label: 'Rejected' },
    surveyor_assigned: { bg: 'bg-cyan-500/10 border-cyan-500/25', text: 'text-cyan-400', label: 'Surveyor Assigned' },
  };

  const item = config[normalized] || {
    bg: 'bg-slate-800 border-slate-700',
    text: 'text-slate-400',
    label: status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border tracking-wide transition-all shadow-sm',
        item.bg,
        item.text,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 bg-current opacity-85" />
      {item.label}
    </span>
  );
}
