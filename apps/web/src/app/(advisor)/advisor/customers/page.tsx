/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Search,
  Users,
  Mail,
  Phone,
  ShieldCheck,
  FileText,
  ChevronRight,
  User,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { getAdvisorCustomers, AdvisorCustomer } from '@/lib/api-client';
import { EmptyState } from '@/components/ui/EmptyState';

export default function AdvisorCustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filterPendingOnly, setFilterPendingOnly] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['advisor-customers'],
    queryFn: getAdvisorCustomers,
  });

  const filtered = customers.filter((c: AdvisorCustomer) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      c.customer_name?.toLowerCase().includes(q) ||
      c.customer_email?.toLowerCase().includes(q) ||
      c.customer_phone?.toLowerCase().includes(q);

    const matchesPending = !filterPendingOnly || (c.open_claim_count || 0) > 0;
    return matchesSearch && matchesPending;
  });

  const totalOpenClaims = customers.reduce(
    (sum: number, c: AdvisorCustomer) => sum + (c.open_claim_count || 0),
    0
  );
  const totalPolicies = customers.reduce(
    (sum: number, c: AdvisorCustomer) => sum + (c.active_policy_count || 0),
    0
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2DDD4] pb-4">
        <div>
          <h1 className="font-serif-heading text-2xl font-normal text-[#191919] tracking-tight flex items-center gap-2.5">
            <Users className="w-5 h-5 text-[#D2654A]" />
            <span>Assigned Client Portfolio</span>
          </h1>
          <p className="text-xs text-[#6E6862] mt-0.5">
            Managing {customers.length} policyholders linked to your advisory mandate.
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
            Active Clients
          </span>
          <p className="text-2xl font-serif-heading font-bold text-[#191919] mt-1">
            {isLoading ? '...' : customers.length}
          </p>
          <span className="text-[10px] text-[#6E6862]">Authorized client accounts</span>
        </div>

        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
            Managed Coverages
          </span>
          <p className="text-2xl font-serif-heading font-bold text-[#191919] mt-1">
            {isLoading ? '...' : totalPolicies}
          </p>
          <span className="text-[10px] text-[#6E6862]">Active vehicle insurance policies</span>
        </div>

        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
            Open Claim Inquiries
          </span>
          <p className="text-2xl font-serif-heading font-bold text-[#191919] mt-1">
            {isLoading ? '...' : totalOpenClaims}
          </p>
          <span className="text-[10px] text-[#D2654A] font-medium">Claims in progression</span>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <section className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C847B]" />
          <input
            type="text"
            placeholder="Search by client name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#F1EDE4] border border-[#E2DDD4] rounded-full text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterPendingOnly(!filterPendingOnly)}
            className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              filterPendingOnly
                ? 'bg-[#191919] text-[#FAF8F5] border-[#191919]'
                : 'bg-[#F1EDE4] border-[#E2DDD4] text-[#191919] hover:bg-[#EAE4D8]'
            }`}
          >
            Open Claims Only
          </button>
        </div>
      </section>

      {/* Customer Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Matching Clients"
          description="No customer records match your filter criteria."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((c) => (
            <div
              key={c.customer_id}
              className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 hover:border-[#8C847B] transition-all shadow-2xs space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919]">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif-heading font-semibold text-sm text-[#191919]">
                      {c.customer_name}
                    </h3>
                    <span className="text-[10px] text-[#8C847B] font-mono block mt-0.5">
                      ID: {c.customer_id.slice(0, 8)}
                    </span>
                  </div>
                </div>

                {c.open_claim_count > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF6E9] border border-[#F7DCB0] text-[#9C6114]">
                    {c.open_claim_count} Claim{c.open_claim_count > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-xs text-[#6E6862] border-t border-[#E2DDD4] pt-3">
                <div className="flex items-center gap-2 truncate">
                  <Mail className="w-3.5 h-3.5 text-[#8C847B] shrink-0" />
                  <span className="truncate">{c.customer_email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[#8C847B] shrink-0" />
                  <span>{c.customer_phone}</span>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs border-t border-[#E2DDD4] pt-3">
                <span className="text-[#8C847B] text-[11px]">
                  Policies:{' '}
                  <strong className="text-[#191919]">{c.active_policy_count} Active</strong>
                </span>
                <button
                  onClick={() => router.push(`/advisor/customers/${c.customer_id}`)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#191919] hover:underline"
                >
                  <span>Dossier</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
