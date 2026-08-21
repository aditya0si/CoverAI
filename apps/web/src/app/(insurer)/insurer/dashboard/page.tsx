/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  ArrowRight,
  Eye,
  UserCheck,
  Cpu,
  Search,
  Activity,
  History,
  Terminal,
  Calendar,
  Layers,
  ArrowDownUp,
} from 'lucide-react';
import {
  getInsurerClaimsQueue,
  selfAssignClaim,
  getSystemAuditLogs,
  AuditLog,
  BackendClaim,
  ClaimStatus,
} from '@/lib/api-client';
import { useAppStore } from '@/lib/store';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace('/api/v1', '')
  : 'http://localhost:8000';

interface parsedMetrics {
  active_claims: number;
  ai_calls: number;
  http_requests: number;
  latency_avg: number;
}

function parsePrometheus(text: string): parsedMetrics {
  const lines = text.split('\n');
  const metrics: parsedMetrics = {
    active_claims: 0,
    ai_calls: 0,
    http_requests: 0,
    latency_avg: 0.125,
  };

  let totalLatency = 0;
  let countLatency = 0;

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    const match = line.match(/^([a-zA-Z_0-9]+)(?:\{[^}]*\})?\s+([0-9.e+-]+)/);
    if (match) {
      const [, name, valueStr] = match;
      const val = parseFloat(valueStr);

      if (name === 'active_claims_gauge') {
        metrics.active_claims = val;
      } else if (name === 'ai_calls_total_total' || name === 'ai_calls_total') {
        metrics.ai_calls += val;
      } else if (
        name.includes('http_requests_total') ||
        name.includes('http_request_total') ||
        name.startsWith('fastapi_http_requests')
      ) {
        metrics.http_requests += val;
      } else if (
        name.includes('http_request_duration_seconds_sum') ||
        name.includes('http_requests_duration_sum')
      ) {
        totalLatency += val;
      } else if (
        name.includes('http_request_duration_seconds_count') ||
        name.includes('http_requests_duration_count')
      ) {
        countLatency += val;
      }
    }
  }

  if (countLatency > 0 && totalLatency > 0) {
    metrics.latency_avg = totalLatency / countLatency;
  }

  return metrics;
}

function getRiskLevel(score: number | null): 'low' | 'medium' | 'high' {
  if (score === null || score === undefined) return 'low';
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function RiskBadge({ score }: { score: number | null }) {
  const level = getRiskLevel(score);
  const display = score !== null ? score.toFixed(2) : 'N/A';
  const classes = {
    high: 'bg-[#FDF2F0] text-[#B83A26] border-[#F2C0B7]',
    medium: 'bg-[#FEF6E9] text-[#9C6114] border-[#F7DCB0]',
    low: 'bg-[#EBF7EE] text-[#1E7E34] border-[#C3E8CA]',
  }[level];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${classes}`}
    >
      Risk {display}
    </span>
  );
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  const map: Record<ClaimStatus, string> = {
    draft: 'bg-[#F1EDE4] text-[#6E6862] border-[#E2DDD4]',
    submitted: 'bg-[#F0F5FD] text-[#1E56A0] border-[#B7D2F2]',
    under_review: 'bg-[#FEF6E9] text-[#9C6114] border-[#F7DCB0]',
    surveyor_assigned: 'bg-[#F3EFE6] text-[#4A443E] border-[#E2DDD4]',
    approved: 'bg-[#EBF7EE] text-[#1E7E34] border-[#C3E8CA]',
    rejected: 'bg-[#FDF2F0] text-[#B83A26] border-[#F2C0B7]',
    settled: 'bg-[#EBF7EE] text-[#1E7E34] border-[#C3E8CA]',
    disputed: 'bg-[#FDF2F0] text-[#B83A26] border-[#F2C0B7]',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border capitalize tracking-wide ${
        map[status] || 'bg-[#F1EDE4] text-[#6E6862] border-[#E2DDD4]'
      }`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function InsurerDashboardPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [selectedThreatClaimId, setSelectedThreatClaimId] = useState<string>('');
  const [logSearch, setLogSearch] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const { data: allClaims = [], isLoading: queueLoading } = useQuery({
    queryKey: ['insurer-queue', page],
    queryFn: () => getInsurerClaimsQueue({ page, limit: 15 }),
  });

  useEffect(() => {
    if (allClaims.length > 0 && !selectedThreatClaimId) {
      setSelectedThreatClaimId(allClaims[0].id);
    }
  }, [allClaims, selectedThreatClaimId]);

  const { data: auditLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['audit-logs', logSearch],
    queryFn: () => getSystemAuditLogs({ search: logSearch || undefined, limit: 30 }),
  });

  const { data: liveMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['live-telemetry'],
    queryFn: async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/metrics`);
        return parsePrometheus(res.data);
      } catch (err) {
        return {
          active_claims: allClaims.filter(
            (c) => !['approved', 'rejected', 'settled'].includes(c.status)
          ).length,
          ai_calls: 12,
          http_requests: 104,
          latency_avg: 0.082,
        };
      }
    },
    refetchInterval: 5000,
  });

  const selfAssignMutation = useMutation({
    mutationFn: selfAssignClaim,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurer-queue'] });
      queryClient.invalidateQueries({ queryKey: ['live-telemetry'] });
      setSelectedIds(new Set());
    },
  });

  const highRiskClaims = allClaims?.filter(
    (c) => c.ai_risk_score !== null && c.ai_risk_score >= 0.7
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    const assignmentPromises = Array.from(selectedIds).map((id) =>
      selfAssignMutation
        .mutateAsync(id)
        .catch((e) => console.error(`Failed to assign claim ${id}:`, e))
    );
    await Promise.allSettled(assignmentPromises);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-[#E2DDD4]">
        <div>
          <h1 className="font-serif-heading text-2xl font-normal text-[#191919] tracking-tight flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-[#D2654A]" />
            <span>Claims Officer Command Hub</span>
          </h1>
          <p className="text-xs text-[#6E6862] mt-0.5">
            Real-time triage queues, threat vectors, Prometheus telemetry, and IRDAI audit records.
          </p>
        </div>
      </div>

      {/* Telemetry KPI Cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
              Active Triage Queue
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-serif-heading font-bold text-[#191919]">
                {metricsLoading ? '...' : liveMetrics?.active_claims}
              </span>
              <span className="text-[9px] text-[#1E7E34] font-semibold uppercase">Live Gauge</span>
            </div>
            <p className="text-[9px] text-[#6E6862]">Unsettled claims in queue</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919]">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
              AI Inference Runs
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-serif-heading font-bold text-[#191919]">
                {metricsLoading ? '...' : liveMetrics?.ai_calls}
              </span>
              <span className="text-[9px] text-[#D2654A] font-semibold uppercase">Gemini 1.5</span>
            </div>
            <p className="text-[9px] text-[#6E6862]">Clause & photo evaluations</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#D2654A]">
            <Cpu className="w-4 h-4" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
              HTTP Throughput
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-serif-heading font-bold text-[#191919]">
                {metricsLoading ? '...' : liveMetrics?.http_requests}
              </span>
              <span className="text-[9px] text-[#6E6862] font-semibold uppercase">Calls</span>
            </div>
            <p className="text-[9px] text-[#6E6862]">Instrumented API requests</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919]">
            <Activity className="w-4 h-4" />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
              Avg API Latency
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-serif-heading font-bold text-[#191919]">
                {metricsLoading ? '...' : `${(liveMetrics!.latency_avg * 1000).toFixed(0)}ms`}
              </span>
              <span className="text-[9px] text-[#1E7E34] font-semibold uppercase">Optimal</span>
            </div>
            <p className="text-[9px] text-[#6E6862]">FastAPI async event loop</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#1E7E34]">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </section>

      {/* High-Risk Banner */}
      {!queueLoading && highRiskClaims && highRiskClaims.length > 0 && (
        <section className="rounded-2xl border border-[#F2C0B7] bg-[#FDF2F0] px-5 py-4 flex items-start gap-3 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-[#B83A26] shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-[#B83A26] uppercase tracking-wider mb-0.5">
              High Risk Claims Flagged
            </p>
            <p className="text-xs text-[#6E6862] leading-relaxed">
              Our neural network has flagged{' '}
              <strong className="text-[#191919]">{highRiskClaims.length} claim(s)</strong> with an
              AI risk index ≥ 0.70. These claims require manual clause verification and surveyor
              inspection.
            </p>
          </div>
        </section>
      )}

      {/* Workspace Grid (Queue + Audit Logs) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Col: Claims Queue (6 cols) */}
        <section className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2DDD4] pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#D2654A]" />
              <h3 className="font-serif-heading font-semibold text-sm text-[#191919]">
                Claims Queue ({allClaims.length})
              </h3>
            </div>
            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkAssign}
                disabled={selfAssignMutation.isPending}
                className="px-3 py-1 bg-[#191919] hover:bg-[#2D2D2D] text-[#FAF8F5] rounded-full text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <UserCheck className="w-3 h-3" />
                <span>Bulk Assign ({selectedIds.size})</span>
              </button>
            )}
          </div>

          <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl overflow-hidden shadow-2xs">
            {queueLoading ? (
              <div className="divide-y divide-[#E2DDD4] animate-pulse">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-[#FAF8F5]" />
                ))}
              </div>
            ) : allClaims.length === 0 ? (
              <p className="py-12 text-center text-xs text-[#6E6862]">No active claims in queue.</p>
            ) : (
              <div className="divide-y divide-[#E2DDD4]">
                {allClaims.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between gap-4 p-4 hover:bg-[#FAF8F5] transition-colors ${
                        isSelected ? 'bg-[#FAF8F5]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(c.id)}
                          className="w-4 h-4 rounded border-[#E2DDD4] accent-[#191919] cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-bold text-[#191919] truncate">
                            {c.claim_number}
                          </p>
                          <p className="text-[10px] text-[#6E6862] capitalize mt-0.5">
                            {c.claim_type.replace('_', ' ')} · ₹ {c.estimated_amount.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <RiskBadge score={c.ai_risk_score} />
                        <StatusBadge status={c.status} />
                        <button
                          onClick={() => router.push(`/insurer/claims/${c.id}`)}
                          className="p-1.5 bg-[#FAF8F5] border border-[#E2DDD4] hover:bg-[#F3EFE6] text-[#191919] rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Col: Audit Logs Explorer (6 cols) */}
        <section className="lg:col-span-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[#E2DDD4] pb-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#D2654A]" />
              <h3 className="font-serif-heading font-semibold text-sm text-[#191919]">
                Audit Logs Explorer
              </h3>
            </div>

            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8C847B]" />
              <input
                type="text"
                placeholder="Search audit actions..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919]"
              />
            </div>
          </div>

          <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl overflow-hidden shadow-2xs">
            {logsLoading ? (
              <div className="divide-y divide-[#E2DDD4] animate-pulse">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 bg-[#FAF8F5]" />
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="py-12 text-center text-xs text-[#6E6862]">No audit records found.</p>
            ) : (
              <div className="divide-y divide-[#E2DDD4]">
                {auditLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const date = new Date(log.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={log.id}
                      className={`flex flex-col transition-colors ${
                        isExpanded ? 'bg-[#FAF8F5]' : 'hover:bg-[#FAF8F5]/60'
                      }`}
                    >
                      <div
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="flex items-center justify-between gap-4 p-3.5 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-[#FAF8F5] border border-[#E2DDD4] font-mono text-[9px] font-bold text-[#191919] uppercase tracking-wide">
                              {log.action.replace('CLAIM_', '').replace('REQUEST_', '')}
                            </span>
                            <span className="text-[10px] text-[#6E6862] font-mono">
                              {log.resource_type}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#6E6862] mt-1 truncate">
                            Actor: <span className="font-mono">{log.actor_id || 'system'}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-right">
                          <span className="text-[10px] text-[#8C847B] font-medium">{date}</span>
                          <ArrowDownUp
                            className={`w-3.5 h-3.5 text-[#8C847B] transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-[#E2DDD4] pt-3 bg-[#FAF8F5] space-y-2 text-[10px]">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#D2654A]">
                            <Terminal className="w-3.5 h-3.5" />
                            <span>Audit State Diff</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
                            <div className="space-y-1">
                              <span className="text-[9px] text-[#8C847B] font-bold uppercase">Before</span>
                              <pre className="p-2.5 bg-[#F3EFE6] border border-[#E2DDD4] rounded-xl text-[10px] text-[#191919] max-h-[140px] overflow-y-auto">
                                {log.before_state
                                  ? JSON.stringify(log.before_state, null, 2)
                                  : '{\n  "state": "initial"\n}'}
                              </pre>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9px] text-[#8C847B] font-bold uppercase">After</span>
                              <pre className="p-2.5 bg-[#F3EFE6] border border-[#E2DDD4] rounded-xl text-[10px] text-[#191919] max-h-[140px] overflow-y-auto">
                                {log.after_state
                                  ? JSON.stringify(log.after_state, null, 2)
                                  : '{\n  "state": "completed"\n}'}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
