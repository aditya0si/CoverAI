'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Filter,
  ArrowUpDown,
  Eye,
  UserCheck,
  Search,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  getInsurerClaimsQueue,
  selfAssignClaim,
  ClaimType,
  RiskLevel,
  InsurerQueueFilters,
} from '@/lib/api-client';
import { BackendClaim, ClaimStatus } from '@coverai/shared-types';

// ── Reusable Badges ────────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number | null | undefined }) {
  const s = score ?? null;
  const level = s === null ? 'low' : s >= 0.7 ? 'high' : s >= 0.4 ? 'medium' : 'low';
  const display = s !== null ? s.toFixed(2) : 'N/A';
  const classes = {
    high: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  }[level];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${classes}`}>
      {display}
    </span>
  );
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  const map: Record<ClaimStatus, string> = {
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${map[status] || ''}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Sort header ─────────────────────────────────────────────────────────────

type SortKey = 'claim_number' | 'claim_type' | 'created_at' | 'ai_risk_score' | 'status';

function SortHeader({
  label,
  colKey,
  currentSort,
  onSort,
}: {
  label: string;
  colKey: SortKey;
  currentSort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
}) {
  const active = currentSort.key === colKey;
  return (
    <button
      onClick={() => onSort(colKey)}
      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
    >
      {label}
      {active ? (
        currentSort.dir === 'asc' ? <ChevronUp className="w-3 h-3 text-amber-400" /> : <ChevronDown className="w-3 h-3 text-amber-400" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

function InsurerClaimsQueueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Filter state — initialise from query string so deep links work
  const [filters, setFilters] = useState<InsurerQueueFilters>({
    status: (searchParams.get('status') as ClaimStatus) || undefined,
    claim_type: (searchParams.get('claim_type') as ClaimType) || undefined,
    risk_level: (searchParams.get('risk_level') as RiskLevel) || undefined,
    date_from: searchParams.get('date_from') || undefined,
    date_to: searchParams.get('date_to') || undefined,
    page: 1,
    limit: 25,
  });

  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ['insurer-queue-full', filters],
    queryFn: () => getInsurerClaimsQueue(filters),
  });

  const selfAssignMutation = useMutation({
    mutationFn: selfAssignClaim,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurer-queue-full'] });
      setSelectedIds(new Set());
    },
  });

  const handleSort = (key: SortKey) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'desc',
    }));
  };

  const filteredSorted = useMemo(() => {
    let data = [...claims];

    // Local search
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        (c) =>
          c.claim_number?.toLowerCase().includes(q) ||
          c.claim_type?.toLowerCase().includes(q)
      );
    }

    // Sort
    data.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sort.key] ?? '';
      const bVal = (b as unknown as Record<string, unknown>)[sort.key] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });

    return data;
  }, [claims, search, sort]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredSorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSorted.map((c) => c.id)));
    }
  };

  const handleBulkAssign = async () => {
    for (const id of Array.from(selectedIds)) {
      await selfAssignMutation.mutateAsync(id);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#191919] tracking-tight">Claim Queue</h1>
        <p className="text-[#6E6862] text-sm mt-1">All submitted and active claims awaiting review.</p>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Filters</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Status */}
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value as ClaimStatus) || undefined, page: 1 }))}
            className="bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="surveyor_assigned">Surveyor Assigned</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Claim Type */}
          <select
            value={filters.claim_type || ''}
            onChange={(e) => setFilters((f) => ({ ...f, claim_type: (e.target.value as ClaimType) || undefined, page: 1 }))}
            className="bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="">All Types</option>
            <option value="own_damage">Own Damage</option>
            <option value="third_party">Third Party</option>
            <option value="theft">Theft</option>
            <option value="natural_calamity">Natural Calamity</option>
            <option value="fire">Fire</option>
          </select>

          {/* Risk Level */}
          <select
            value={filters.risk_level || ''}
            onChange={(e) => setFilters((f) => ({ ...f, risk_level: (e.target.value as RiskLevel) || undefined, page: 1 }))}
            className="bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
          >
            <option value="">All Risk Levels</option>
            <option value="low">Low (&lt;0.4)</option>
            <option value="medium">Medium (0.4–0.7)</option>
            <option value="high">High (&gt;0.7)</option>
          </select>

          {/* Date From */}
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value || undefined, page: 1 }))}
            className="bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
          />

          {/* Date To */}
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value || undefined, page: 1 }))}
            className="bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search claim number or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl">
          <span className="text-xs font-semibold text-amber-300">
            {selectedIds.size} claim{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleBulkAssign}
            disabled={selfAssignMutation.isPending}
            className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5" />
            {selfAssignMutation.isPending ? 'Assigning…' : 'Assign to Me'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredSorted.length && filteredSorted.length > 0}
                  onChange={selectAll}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3"><SortHeader label="Claim No" colKey="claim_number" currentSort={sort} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Type" colKey="claim_type" currentSort={sort} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Submitted" colKey="created_at" currentSort={sort} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Risk Score" colKey="ai_risk_score" currentSort={sort} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Status" colKey="status" currentSort={sort} onSort={handleSort} /></th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3"><div className="w-4 h-4 bg-slate-800 rounded" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-28 bg-slate-800 rounded" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-800 rounded" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-24 bg-slate-800 rounded" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-12 bg-slate-800 rounded" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-20 bg-slate-800 rounded" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-10 bg-slate-800 rounded" /></td>
                </tr>
              ))}

            {!isLoading && filteredSorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center text-xs text-slate-500">
                  No claims match the current filters.
                </td>
              </tr>
            )}

            {!isLoading &&
              filteredSorted.map((claim) => {
                const c = claim as BackendClaim;
                const isSelected = selectedIds.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-800/30 transition-colors ${isSelected ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(c.id)}
                        className="w-4 h-4 accent-amber-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-semibold text-slate-200">{c.claim_number}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 capitalize">
                      {c.claim_type?.replace(/_/g, ' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(c.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge score={c.ai_risk_score} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/insurer/claims/${c.id}`)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Eye className="w-3 h-3" /> Review
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page || 1) - 1) }))}
          disabled={(filters.page || 1) === 1}
          className="px-3 py-1 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-400 disabled:opacity-40 hover:border-slate-700 transition-colors cursor-pointer"
        >
          ← Prev
        </button>
        <span className="px-3 py-1 text-xs text-slate-500 flex items-center">Page {filters.page || 1}</span>
        <button
          onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))}
          disabled={claims.length < (filters.limit || 25)}
          className="px-3 py-1 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-400 disabled:opacity-40 hover:border-slate-700 transition-colors cursor-pointer"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export default function InsurerClaimsPage() {
  return (
    <React.Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-800 border-t-amber-500" />
      </div>
    }>
      <InsurerClaimsQueueContent />
    </React.Suspense>
  );
}
