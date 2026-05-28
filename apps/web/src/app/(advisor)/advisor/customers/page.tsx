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
  Calendar
} from 'lucide-react';
import { getAdvisorCustomers, AdvisorCustomer } from '@/lib/api-client';

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

  const totalOpenClaims = customers.reduce((sum: number, c: AdvisorCustomer) => sum + (c.open_claim_count || 0), 0);
  const totalPolicies = customers.reduce((sum: number, c: AdvisorCustomer) => sum + (c.active_policy_count || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-violet-400" />
            <span>Assigned Clients Deck</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isLoading ? 'Loading active client portfolio...' : `Managing ${customers.length} client profiles linked to your advisor account.`}
          </p>
        </div>

        {/* Advisor KPI Chips */}
        {!isLoading && (
          <div className="flex gap-2.5 shrink-0">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 min-w-[90px] text-center backdrop-blur">
              <span className="text-lg font-black text-white">{customers.length}</span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold mt-0.5">Clients</span>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 min-w-[90px] text-center backdrop-blur">
              <span className="text-lg font-black text-amber-400">{totalOpenClaims}</span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold mt-0.5">Pending Review</span>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-4 py-2.5 min-w-[90px] text-center backdrop-blur">
              <span className="text-lg font-black text-emerald-400">{totalPolicies}</span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold mt-0.5">Total Covers</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Search & Filter Controls ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search clients by name, email, or registration..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-300 placeholder-slate-650 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        <button
          onClick={() => setFilterPendingOnly(!filterPendingOnly)}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-2 ${
            filterPendingOnly
              ? 'bg-amber-500/10 border-amber-500/35 text-amber-400'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Pending Claims Only</span>
        </button>
      </div>

      {/* ── Customer Card-Deck Grid ─────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[210px] bg-slate-900 border border-slate-800 rounded-3xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-slate-850 bg-slate-900/10 rounded-3xl p-16 text-center flex flex-col items-center justify-center max-w-xl mx-auto">
          <Users className="w-10 h-10 text-slate-655 opacity-30 mb-3" />
          <h4 className="font-bold text-white text-sm">No Clients Found</h4>
          <p className="text-[11px] text-slate-450 mt-1">
            {search || filterPendingOnly ? 'Try adjusting your search criteria or clearing filters.' : 'Assigned policyholder accounts will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((customer: AdvisorCustomer) => {
            const hasPending = (customer.open_claim_count || 0) > 0;
            const assignedDate = new Date(customer.assigned_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric'
            });

            return (
              <div
                key={customer.customer_id}
                onClick={() => router.push(`/advisor/customers/${customer.customer_id}`)}
                className={`backdrop-blur-md bg-slate-900/60 border rounded-2xl p-5 hover:bg-slate-900/80 transition-all duration-300 shadow-lg shadow-black/25 flex flex-col justify-between h-[210px] group relative overflow-hidden cursor-pointer ${
                  hasPending 
                    ? 'border-amber-500/20 hover:border-amber-500/40 hover:shadow-amber-500/5' 
                    : 'border-slate-800 hover:border-violet-500/40 hover:shadow-violet-500/5'
                }`}
              >
                {/* Glowing subtle backdrops */}
                <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-xl pointer-events-none ${
                  hasPending ? 'bg-amber-500/5' : 'bg-violet-500/5'
                }`} />

                {/* Top: Header Info */}
                <div className="space-y-3.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        hasPending 
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                          : 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                      }`}>
                        <User className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-white line-clamp-1 group-hover:text-violet-400 transition-colors">
                          {customer.customer_name}
                        </h4>
                        <span className="text-[8px] text-slate-500 font-bold block uppercase mt-0.5 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5 text-slate-600" />
                          <span>Linked {assignedDate}</span>
                        </span>
                      </div>
                    </div>

                    {/* Flags */}
                    {hasPending && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/20 text-amber-400 text-[8px] font-black uppercase tracking-wider animate-pulse shrink-0">
                        Review Required
                      </span>
                    )}
                  </div>

                  {/* Contact Summary */}
                  <div className="space-y-1.5 pt-2 text-[10px] text-slate-400 border-t border-slate-850">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span className="truncate">{customer.customer_email}</span>
                    </div>
                    {customer.customer_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>{customer.customer_phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom: Action Metrics */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-850/60">
                  <div className="flex gap-3">
                    <div className="flex items-center gap-1 px-2 py-1 bg-slate-950 border border-slate-850 rounded-lg text-[9px] font-bold text-slate-350">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{customer.active_policy_count} Covers</span>
                    </div>
                    
                    <div className={`flex items-center gap-1 px-2 py-1 bg-slate-950 border rounded-lg text-[9px] font-bold ${
                      hasPending ? 'border-amber-500/15 text-amber-400' : 'border-slate-850 text-slate-500'
                    }`}>
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>{customer.open_claim_count || 0} Claims</span>
                    </div>
                  </div>

                  <ChevronRight className="w-4.5 h-4.5 text-slate-600 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
