import React from 'react';
import { cn } from '@coverai/ui';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase();

  const config: Record<string, { bg: string; text: string; label: string; dot: string }> = {
    // Policy Statuses
    active: {
      bg: 'bg-[#EBF7EE] border-[#C3E8CA]',
      text: 'text-[#1E7E34]',
      dot: 'bg-[#28A745]',
      label: 'Active',
    },
    expired: {
      bg: 'bg-[#FDF2F0] border-[#F2C0B7]',
      text: 'text-[#B83A26]',
      dot: 'bg-[#D2654A]',
      label: 'Expired',
    },
    cancelled: {
      bg: 'bg-[#F1EDE4] border-[#E2DDD4]',
      text: 'text-[#6E6862]',
      dot: 'bg-[#8C847B]',
      label: 'Cancelled',
    },
    draft: {
      bg: 'bg-[#F1EDE4] border-[#E2DDD4]',
      text: 'text-[#6E6862]',
      dot: 'bg-[#8C847B]',
      label: 'Draft',
    },

    // Claim Statuses
    submitted: {
      bg: 'bg-[#F0F5FD] border-[#B7D2F2]',
      text: 'text-[#1E56A0]',
      dot: 'bg-[#2C74D5]',
      label: 'Submitted',
    },
    under_review: {
      bg: 'bg-[#FEF6E9] border-[#F7DCB0]',
      text: 'text-[#9C6114]',
      dot: 'bg-[#E68A00]',
      label: 'Under Review',
    },
    approved: {
      bg: 'bg-[#EBF7EE] border-[#C3E8CA]',
      text: 'text-[#1E7E34]',
      dot: 'bg-[#28A745]',
      label: 'Approved',
    },
    rejected: {
      bg: 'bg-[#FDF2F0] border-[#F2C0B7]',
      text: 'text-[#B83A26]',
      dot: 'bg-[#D2654A]',
      label: 'Rejected',
    },
    surveyor_assigned: {
      bg: 'bg-[#F3EFE6] border-[#E2DDD4]',
      text: 'text-[#4A443E]',
      dot: 'bg-[#191919]',
      label: 'Surveyor Assigned',
    },
    settled: {
      bg: 'bg-[#EBF7EE] border-[#C3E8CA]',
      text: 'text-[#1E7E34]',
      dot: 'bg-[#28A745]',
      label: 'Settled',
    },
    disputed: {
      bg: 'bg-[#FDF2F0] border-[#F2C0B7]',
      text: 'text-[#B83A26]',
      dot: 'bg-[#D2654A]',
      label: 'Disputed',
    },
  };

  const item = config[normalized] || {
    bg: 'bg-[#F1EDE4] border-[#E2DDD4]',
    text: 'text-[#6E6862]',
    dot: 'bg-[#8C847B]',
    label: status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border tracking-wide transition-all shadow-2xs',
        item.bg,
        item.text,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5 shrink-0', item.dot)} />
      {item.label}
    </span>
  );
}
