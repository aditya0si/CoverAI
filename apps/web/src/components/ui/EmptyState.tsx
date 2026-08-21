import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@coverai/ui';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border border-[#E2DDD4] bg-[#F1EDE4] rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto transition-all',
        className
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#6E6862] mb-4 shadow-sm">
        <Icon className="w-6 h-6" />
      </div>
      <h4 className="font-serif-heading font-bold text-[#191919] text-base mb-1.5">{title}</h4>
      <p className="text-xs text-[#6E6862] max-w-sm leading-relaxed mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-5 py-2.5 bg-[#191919] hover:bg-[#2C2C2C] text-[#FAF8F5] rounded-full text-xs font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
