'use client';

import React, { useState } from 'react';
import { Shield, Cpu, Clock, ShieldCheck } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import VaultTab from './vault/page';
import AIAdvisorTab from './ai-advisor/page';
import ClaimsTab from './claims/page';
import PrivacyTab from './privacy/page';
import { cn } from '@coverai/ui';

type TabId = 'vault' | 'ai' | 'claims' | 'privacy';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'vault', label: 'Policy Vault', icon: Shield },
  { id: 'ai', label: 'AI Policy Advisor', icon: Cpu },
  { id: 'claims', label: 'Claim Center', icon: Clock },
  { id: 'privacy', label: 'DPDP Privacy Panel', icon: ShieldCheck },
];

export default function DashboardPage() {
  const { user } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabId>('vault');
  const name = user?.full_name?.split(' ')[0] || 'User';

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* ── Editorial Welcome Hero ────────────────────────────────────────── */}
      <section className="bg-[#F3EFE6] border border-[#E2DDD4] rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#D2654A] block">
              Overview
            </span>
            <h1 className="font-serif-heading text-2xl sm:text-3xl lg:text-4xl font-normal text-[#191919] tracking-tight">
              Welcome back, {name}
            </h1>
            <p className="text-[#6E6862] text-xs sm:text-sm max-w-2xl leading-relaxed">
              Explore your active insurance policies, analyze exclusion terms with your AI Policy Advisor, or manage your DPDP statutory privacy rights.
            </p>
          </div>
        </div>
      </section>

      {/* ── Anthropic-Style Tab Navigation ────────────────────────────────── */}
      <section className="flex gap-2 border-b border-[#E2DDD4] overflow-x-auto scrollbar-none pb-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 -mb-px cursor-pointer',
                isActive
                  ? 'border-[#191919] text-[#191919]'
                  : 'border-transparent text-[#6E6862] hover:text-[#191919] hover:border-[#E2DDD4]'
              )}
            >
              <Icon className={cn('w-4 h-4', isActive ? 'text-[#191919]' : 'text-[#8C847B]')} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </section>

      {/* ── Active Tab Panel Content ──────────────────────────────────────── */}
      <div className="w-full">
        {activeTab === 'vault' && <VaultTab />}
        {activeTab === 'ai' && <AIAdvisorTab />}
        {activeTab === 'claims' && <ClaimsTab />}
        {activeTab === 'privacy' && <PrivacyTab />}
      </div>
    </div>
  );
}
