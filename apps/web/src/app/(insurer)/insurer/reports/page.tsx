'use client';

import { BarChart3, Construction } from 'lucide-react';

export default function InsurerReportsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-extrabold text-[#191919] tracking-tight">Reports</h1>
        <p className="text-[#6E6862] text-sm mt-1">Analytics and performance metrics for claims processing.</p>
      </div>

      {/* Coming Soon */}
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <BarChart3 className="w-12 h-12 text-amber-400" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
            <Construction className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="text-center space-y-2 max-w-sm">
          <h2 className="text-xl font-extrabold text-[#191919]">Coming Soon</h2>
          <p className="text-[#6E6862] text-sm leading-relaxed">
            The reports module is under development. It will include claim settlement rates,
            officer performance metrics, risk distribution charts, and monthly trend analysis.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg opacity-40 pointer-events-none select-none">
          {['Settlement Rate', 'Avg Decision Time', 'High Risk %', 'Claims This Month'].map((label) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="h-8 w-12 bg-slate-800 rounded-lg mx-auto mb-2" />
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
