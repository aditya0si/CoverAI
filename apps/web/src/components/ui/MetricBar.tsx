import React from 'react';
import { cn } from '@coverai/ui';

export interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  format?: (v: number) => string;
  colorClass?: string;
  sublabel?: string;
  className?: string;
}

export function MetricBar({
  label,
  value,
  max,
  format = (v) => v.toLocaleString(),
  colorClass = 'bg-[#191919]',
  sublabel,
  className,
}: MetricBarProps) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex justify-between items-baseline text-xs">
        <span className="text-[#6E6862] font-medium">{label}</span>
        <span className="text-[#191919] font-bold font-mono text-xs">{format(value)}</span>
      </div>
      <div className="h-2 bg-[#EAE4D8] border border-[#E2DDD4] rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {sublabel && (
        <div className="flex justify-between text-[9px] text-[#8C847B] font-medium">
          <span>{sublabel}</span>
          <span>Max: {format(max)}</span>
        </div>
      )}
    </div>
  );
}
