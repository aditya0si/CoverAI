'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  FileText,
  AlertTriangle,
  ChevronRight,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import {
  getAdvisorCustomers,
  getAdvisorCustomerClaims,
  AdvisorCustomer,
} from '@/lib/api-client';
import { BackendClaim, ClaimStatus } from '@coverai/shared-types';

// ── Helpers ────────────────────────────────────────────────────────────────

interface AggregatedClaim extends BackendClaim {
  customer_name: string;
  customer_id: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-700/50 text-slate-400 border-slate-700',
    submitted: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    under_review: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    surveyor_assigned: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    settled: 'bg-teal-500/15 text-teal-400 border-teal-500/25',
    disputed: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border capitalize tracking-wide ${map[status] ?? 'bg-slate-700/50 text-slate-400 border-slate-700'}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const OPEN_STATUSES: ClaimStatus[] = ['submitted', 'under_review', 'surveyor_assigned'];

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdvisorClaimsOverviewPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 1. Fetch all assigned customers
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['advisor-customers'],
    queryFn: getAdvisorCustomers,
  });

  const customerIds = (customers as AdvisorCustomer[]).map((c) => c.customer_id);

  // 2. Fetch claims for every customer in parallel
  const claimsQuery = useQuery({
    queryKey: ['advisor-all-claims', customerIds],
    queryFn: async () => {
      const results = await Promise.all(
        customerIds.map((id) =>
          getAdvisorCustomerClaims(id).then((claims) => ({ id, claims }))
        )
      );
      return results;
    },
    enabled: customerIds.length > 0,
  });

  const isLoading = customersLoading || claimsQuery.isLoading;

  // 3. Flatten claims with customer metadata
  const allClaims: AggregatedClaim[] = useMemo(() => {
    if (!claimsQuery.data) return [];
    const flat: AggregatedClaim[] = [];
    for (const { id, claims } of claimsQuery.data) {
      const customer = (customers as AdvisorCustomer[]).find((c) => c.customer_id === id);
      if (!customer) continue;
      for (const claim of claims) {
        flat.push({
          ...claim,
          customer_name: customer.customer_name,
          customer_id: id,
        });
      }
    }
    return flat.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [claimsQuery.data, customers]);

  // 4. Derive KPIs
  const openCount = allClaims.filter((c) => OPEN_STATUSES.includes(c.status as ClaimStatus)).length;
  const approvedCount = allClaims.filter((c) => c.status === 'approved').length;
  const rejectedCount = allClaims.filter((c) => c.status === 'rejected').length;

  // 5. Filter
  const filtered = allClaims.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      c.claim_number?.toLowerCase().includes(q) ||
      c.customer_name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const STATUS_OPTIONS = [
    { value: 'all', label: 'All Claims' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'surveyor_assigned', label: 'Surveyor Assigned' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'settled', label: 'Settled' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#191919] tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-violet-400" />
            <span>Claims Overview</span>
          </h1>
          <p className="text-xs text-[#6E6862] mt-1">
            {isLoading
              ? 'Loading claims across your portfolio…'
              : `${allClaims.length} total claims across ${customers.length} assigned clients.`}
          </p>
        </div>

        {/* KPI chips */}
        {!isLoading && (
          <div className="flex gap-2.5 shrink-0 flex-wrap">
            <div className="bg-slate-900/80 border border-amber-500/20 rounded-2xl px-4 py-2.5 min-w-[90px] text-center backdrop-blur">
              <span className="text-lg font-black text-amber-400">{openCount}</span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold mt-0.5">Open</span>
            </div>
            <div className="bg-slate-900/80 border border-emerald-500/20 rounded-2xl px-4 py-2.5 min-w-[90px] text-center backdrop-blur">
              <span className="text-lg font-black text-emerald-400">{approvedCount}</span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold mt-0.5">Approved</span>
            </div>
            <div className="bg-slate-900/80 border border-rose-500/20 rounded-2xl px-4 py-2.5 min-w-[90px] text-center backdrop-blur">
              <span className="text-lg font-black text-rose-400">{rejectedCount}</span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold mt-0.5">Rejected</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search claim number or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-300 focus:outline-none focus:border-violet-500 transition-colors cursor-pointer"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        {/* Head */}
        <div className="hidden sm:grid grid-cols-[1.5fr_1.2fr_1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>Customer</span>
          <span>Claim No.</span>
          <span>Type</span>
          <span>Estimated ₹</span>
          <span>Status</span>
          <span />
        </div>

        {/* Skeleton */}
        {isLoading && (
          <div className="divide-y divide-slate-800/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr_auto_auto] gap-4 px-5 py-4 items-center animate-pulse">
                <div className="h-3 w-32 bg-slate-800 rounded" />
                <div className="h-3 w-24 bg-slate-800 rounded" />
                <div className="h-3 w-20 bg-slate-800 rounded" />
                <div className="h-3 w-16 bg-slate-800 rounded" />
                <div className="h-5 w-20 bg-slate-800 rounded-full" />
                <div className="h-3 w-4 bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div className="py-20 flex flex-col items-center gap-4 text-slate-500">
            <FileText className="w-10 h-10 opacity-25" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-400">
                {allClaims.length === 0 ? 'No claims found across your portfolio.' : 'No claims match the selected filters.'}
              </p>
              <p className="text-xs mt-1">Try adjusting your search or filter criteria.</p>
            </div>
          </div>
        )}

        {/* Rows */}
        {!isLoading && filtered.length > 0 && (
          <div className="divide-y divide-slate-800/60">
            {filtered.map((claim) => {
              const isOpen = OPEN_STATUSES.includes(claim.status as ClaimStatus);
              return (
                <button
                  key={claim.id}
                  onClick={() => router.push(`/advisor/customers/${claim.customer_id}`)}
                  className="w-full grid grid-cols-1 sm:grid-cols-[1.5fr_1.2fr_1fr_1fr_auto_auto] gap-2 sm:gap-4 px-5 py-3.5 items-center hover:bg-slate-800/30 transition-colors text-left cursor-pointer group"
                >
                  {/* Mobile layout: stacked */}
                  <div className="sm:contents flex justify-between items-start sm:flex-none gap-2">
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {claim.customer_name}
                    </span>
                    <span className="sm:hidden">
                      <StatusBadge status={claim.status} />
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{claim.claim_number}</span>
                  <span className="text-xs text-slate-400 capitalize hidden sm:block">
                    {claim.claim_type?.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-slate-300 font-semibold hidden sm:block">
                    ₹ {Number(claim.estimated_amount).toLocaleString('en-IN')}
                  </span>
                  <span className="hidden sm:inline-flex">
                    <StatusBadge status={claim.status} />
                  </span>
                  <span className="flex items-center gap-1">
                    {isOpen && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    {claim.status === 'approved' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    {claim.status === 'rejected' && (
                      <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    {!isOpen && claim.status !== 'approved' && claim.status !== 'rejected' && (
                      <Clock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
