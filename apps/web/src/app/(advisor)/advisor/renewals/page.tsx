'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { getAdvisorCustomers, getAdvisorCustomerPolicies, AdvisorCustomer, PolicyDetail } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────

interface RenewalRow {
  customerId: string;
  customerName: string;
  policy: PolicyDetail;
  daysLeft: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function DaysLeftBadge({ days }: { days: number }) {
  const cls =
    days <= 14
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
      : days <= 30
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border tabular-nums ${cls}`}>
      {days}d left
    </span>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AdvisorRenewalsPage() {
  const router = useRouter();
  const [dayWindow, setDayWindow] = useState<30 | 60 | 90>(30);

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['advisor-customers'],
    queryFn: getAdvisorCustomers,
  });

  // Fetch all customer policies in parallel (each customer)
  const customerIds = (customers as AdvisorCustomer[]).map((c) => c.customer_id);

  const policiesQueries = useQuery({
    queryKey: ['advisor-all-policies', customerIds],
    queryFn: async () => {
      const results = await Promise.all(
        customerIds.map((id) => getAdvisorCustomerPolicies(id).then((ps) => ({ id, ps })))
      );
      return results;
    },
    enabled: customerIds.length > 0,
  });

  const isLoading = customersLoading || policiesQueries.isLoading;

  const renewals: RenewalRow[] = useMemo(() => {
    if (!policiesQueries.data) return [];
    const now = new Date();
    const cutoff = dayWindow * 24 * 60 * 60 * 1000;

    const rows: RenewalRow[] = [];
    for (const { id, ps } of policiesQueries.data) {
      const customer = (customers as AdvisorCustomer[]).find((c) => c.customer_id === id);
      if (!customer) continue;
      for (const policy of ps) {
        if (policy.status !== 'active') continue;
        const end = new Date(policy.end_date);
        const diff = end.getTime() - now.getTime();
        const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (daysLeft >= 0 && diff <= cutoff) {
          rows.push({
            customerId: id,
            customerName: customer.customer_name,
            policy,
            daysLeft,
          });
        }
      }
    }
    return rows.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [policiesQueries.data, customers, dayWindow]);

  const urgentCount = renewals.filter((r) => r.daysLeft <= 14).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[#191919] tracking-tight">Renewals Due</h1>
          <p className="text-[#6E6862] text-sm mt-1">
            Policies expiring soon across your assigned customers.
          </p>
        </div>

        {/* Window toggle */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
          {([30, 60, 90] as const).map((w) => (
            <button
              key={w}
              onClick={() => setDayWindow(w)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                dayWindow === w
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {w} days
            </button>
          ))}
        </div>
      </div>

      {/* Urgent Alert Strip */}
      {!isLoading && urgentCount > 0 && (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 px-5 py-3.5 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <p className="text-xs text-slate-300">
            <span className="font-bold text-rose-400">{urgentCount} policy</span>
            {urgentCount > 1 ? ' policies expire' : ' expires'} within the next{' '}
            <span className="font-semibold text-white">14 days</span> — contact those customers promptly.
          </p>
        </div>
      )}

      {/* Summary KPI */}
      {!isLoading && (
        <div className="flex gap-3 flex-wrap">
          {[
            { label: `Due in ${dayWindow}d`, value: renewals.length, color: 'text-white' },
            { label: '≤ 14 days', value: renewals.filter((r) => r.daysLeft <= 14).length, color: 'text-rose-400' },
            { label: '15–30 days', value: renewals.filter((r) => r.daysLeft > 14 && r.daysLeft <= 30).length, color: 'text-amber-400' },
            { label: '31+ days', value: renewals.filter((r) => r.daysLeft > 30).length, color: 'text-emerald-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-center min-w-[90px]">
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        {/* Table Head */}
        <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>Customer</span>
          <span>Policy No.</span>
          <span>Insurer</span>
          <span>Expiry Date</span>
          <span>Days Left</span>
          <span />
        </div>

        {/* Skeleton */}
        {isLoading && (
          <div className="divide-y divide-slate-800/60">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-4 px-5 py-4 items-center animate-pulse">
                <div className="h-3 w-28 bg-slate-800 rounded" />
                <div className="h-3 w-24 bg-slate-800 rounded" />
                <div className="h-3 w-20 bg-slate-800 rounded" />
                <div className="h-3 w-20 bg-slate-800 rounded" />
                <div className="h-5 w-14 bg-slate-800 rounded-full" />
                <div className="h-3 w-4 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && renewals.length === 0 && (
          <div className="py-20 flex flex-col items-center gap-4 text-slate-500">
            <CalendarClock className="w-10 h-10 opacity-30" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-400">No renewals due in {dayWindow} days</p>
              <p className="text-xs mt-1">All your customers&apos; policies are well within their coverage period.</p>
            </div>
          </div>
        )}

        {/* Rows */}
        {!isLoading && renewals.length > 0 && (
          <div className="divide-y divide-slate-800/60">
            {renewals.map((row) => (
              <button
                key={`${row.customerId}-${row.policy.id}`}
                onClick={() => router.push(`/advisor/customers/${row.customerId}`)}
                className="w-full grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-4 px-5 py-3.5 items-center hover:bg-slate-800/30 transition-colors text-left cursor-pointer"
              >
                <span className="text-xs font-semibold text-slate-200 truncate">{row.customerName}</span>
                <span className="text-xs font-mono text-slate-400">{row.policy.policy_number}</span>
                <span className="text-xs text-slate-400 truncate">{row.policy.insurer_name}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(row.policy.end_date).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
                <DaysLeftBadge days={row.daysLeft} />
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
