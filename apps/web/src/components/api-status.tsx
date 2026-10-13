import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@coverai/ui';

interface OfflineNoticeProps {
  className?: string;
}

export function OfflineNotice({ className }: OfflineNoticeProps) {
  return (
    <div
      role="status"
      className={cn(
        'w-full bg-[#FEF6E9] border border-[#F7DCB0] text-[#9C6114] rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-2xs transition-all',
        className
      )}
    >
      <div className="w-8 h-8 rounded-xl bg-[#FAF8F5] border border-[#F7DCB0] flex items-center justify-center shrink-0 mt-0.5 text-[#E68A00]">
        <AlertCircle className="w-4.5 h-4.5" />
      </div>
      <div className="space-y-1 text-xs leading-relaxed">
        <h4 className="font-serif-heading font-semibold text-sm text-[#191919]">
          API Unreachable
        </h4>
        <p className="text-[#6E6862]">
          The backend API is currently unreachable and this page is unable to display live data.
        </p>
        <p className="text-[11px] text-[#8C847B]">
          The backend service may be waking up from sleep. Please wait a moment and retry.
        </p>
      </div>
    </div>
  );
}

interface LoadingRowsProps {
  n?: number;
  className?: string;
}

export function LoadingRows({ n = 3, className }: LoadingRowsProps) {
  return (
    <div className={cn('space-y-3 w-full', className)}>
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="h-16 bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl animate-pulse p-4 flex items-center justify-between"
        >
          <div className="space-y-2 flex-1 max-w-sm">
            <div className="h-3 bg-[#E2DDD4] rounded-md w-3/5" />
            <div className="h-2 bg-[#E2DDD4] rounded-md w-2/5" />
          </div>
          <div className="h-6 w-16 bg-[#E2DDD4] rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}
