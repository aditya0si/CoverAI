/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Cpu,
  Shield,
  FileText,
  User,
  Download,
  Trash2,
  Loader2,
  Info,
  Ban,
  Lock,
} from 'lucide-react';
import {
  getConsentRecords,
  updateConsentRecord,
  requestDataExport,
  requestDataDeletion,
  cancelDataDeletion,
  getDataExportRequests,
  getDataDeletionRequests,
} from '@/lib/api-client';
import { useAppStore } from '@/lib/store';

export default function PrivacyPage() {
  const { showToast } = useAppStore();

  const { data: consents = [], refetch: refetchConsents } = useQuery({
    queryKey: ['consents'],
    queryFn: getConsentRecords,
  });

  const { data: exportRequests = [], refetch: refetchExports } = useQuery({
    queryKey: ['exports'],
    queryFn: getDataExportRequests,
    refetchInterval: 10000,
  });

  const { data: deletionRequests = [], refetch: refetchDeletions } = useQuery({
    queryKey: ['deletions'],
    queryFn: getDataDeletionRequests,
    refetchInterval: 10000,
  });

  const activeDeletion = deletionRequests.find((r) => r.status === 'pending');

  const toggleConsentMutation = useMutation({
    mutationFn: ({ type, granted }: { type: string; granted: boolean }) =>
      updateConsentRecord(type, granted),
    onSuccess: (data) => {
      refetchConsents();
      showToast(data.message || 'Consent preference updated successfully.', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || 'Failed to update consent.', 'error');
    },
  });

  const triggerExportMutation = useMutation({
    mutationFn: requestDataExport,
    onSuccess: (data) => {
      refetchExports();
      showToast(data.message || 'Personal data export generated.', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || 'Failed to initiate data export.', 'error');
    },
  });

  const triggerDeletionMutation = useMutation({
    mutationFn: requestDataDeletion,
    onSuccess: (data) => {
      refetchDeletions();
      showToast(data.message || 'Account erasure scheduled with 30-day grace period.', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || 'Failed to schedule erasure.', 'error');
    },
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: cancelDataDeletion,
    onSuccess: (data) => {
      refetchDeletions();
      showToast(data.message || 'Erasure request cancelled successfully.', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || 'Failed to cancel erasure request.', 'error');
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h2 className="font-serif-heading text-xl font-normal text-[#191919] flex items-center gap-2">
          <Lock className="w-5 h-5 text-[#D2654A]" />
          <span>Privacy & DPDP Data Control</span>
        </h2>
        <p className="text-xs text-[#6E6862] mt-0.5">
          Under India&apos;s DPDP Act 2023, you hold absolute authority to inspect, export, or revoke processing of your data.
        </p>
      </div>

      {/* Notice Banner if AI consent revoked */}
      {consents.find((c) => c.consent_type === 'ai_analysis' && !c.granted) && (
        <div className="rounded-2xl border border-[#F7DCB0] bg-[#FEF6E9] p-4 flex gap-3 animate-in slide-in-from-top duration-200">
          <Info className="w-5 h-5 text-[#9C6114] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-[#9C6114] uppercase tracking-wider block text-[10px]">
              AI Triage Consent Revoked
            </span>
            <p className="text-[#6E6862] leading-relaxed">
              Consent for AI processing is currently paused. Automated image analysis and policy clause citations will remain deactivated until re-enabled.
            </p>
          </div>
        </div>
      )}

      {/* ── Consent Preferences Grid ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
          Statutory Consent Toggles
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              type: 'ai_analysis',
              title: 'AI Vision & Triage Analysis',
              desc: 'Enables our Gemini-powered co-pilot to parse policy clauses and perform damage assessments on uploaded incident photos.',
              icon: Cpu,
            },
            {
              type: 'third_party_sharing',
              title: 'Assigned Advisor Data Sharing',
              desc: 'Permits CoverAI to share relevant policy details with your assigned human advisor for appeals and claim advocacy.',
              icon: User,
            },
            {
              type: 'data_processing',
              title: 'Core Platform Data Ingestion',
              desc: 'Authorizes encrypted storage of vehicle registration records, policy parameters, and identity hash verifications.',
              icon: Shield,
            },
            {
              type: 'marketing',
              title: 'Policy Renewal & Maintenance Reminders',
              desc: 'Opt-in notification preference for vehicle service alerts, expiring coverage notices, and motor law advisory bulletins.',
              icon: FileText,
            },
          ].map((c) => {
            const record = consents.find((r) => r.consent_type === c.type);
            const isGranted = record ? record.granted : true;
            return (
              <div
                key={c.type}
                className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 hover:border-[#8C847B] transition-all flex justify-between items-start gap-4 shadow-2xs"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6.5 h-6.5 rounded-lg bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center shrink-0 text-[#191919]">
                      <c.icon className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="font-semibold text-xs text-[#191919] leading-normal">{c.title}</h4>
                  </div>
                  <p className="text-[11px] text-[#6E6862] leading-relaxed">{c.desc}</p>
                </div>

                {/* Switch Toggle */}
                <button
                  onClick={() =>
                    toggleConsentMutation.mutate({ type: c.type, granted: !isGranted })
                  }
                  disabled={toggleConsentMutation.isPending}
                  className={`w-10 h-6 rounded-full p-0.5 transition-all duration-200 cursor-pointer shrink-0 mt-0.5 flex ${
                    isGranted ? 'bg-[#191919] justify-end' : 'bg-[#E2DDD4] justify-start'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-[#FAF8F5] shadow-xs" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Data Rights (Export & Erasure) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Data Portability (JSON Archive) */}
        <section className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[#D2654A]" />
            <h4 className="font-serif-heading font-semibold text-sm text-[#191919]">
              Right to Data Portability (JSON Archive)
            </h4>
          </div>
          <p className="text-xs text-[#6E6862] leading-relaxed">
            Generate an immutable JSON dossier containing all your user data, policy records, claim audit logs, and AI conversation transcripts.
          </p>

          <button
            onClick={() => triggerExportMutation.mutate()}
            disabled={triggerExportMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#191919] hover:bg-[#2D2D2D] disabled:bg-[#8C847B] text-[#FAF8F5] rounded-full text-xs font-semibold shadow-2xs transition-all cursor-pointer"
          >
            {triggerExportMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Generate Archive</span>
          </button>

          {/* Export Archives List */}
          {exportRequests.length > 0 && (
            <div className="space-y-2 border-t border-[#E2DDD4] pt-3.5 mt-3">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#8C847B] block">
                Generated Archives
              </span>
              <div className="divide-y divide-[#E2DDD4]">
                {exportRequests.map((req) => (
                  <div key={req.id} className="py-2 flex justify-between items-center text-xs">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-[#191919] truncate max-w-[160px]">{req.id}</p>
                      <p className="text-[9px] text-[#8C847B] font-medium capitalize mt-0.5">
                        Status: <span className="font-semibold text-[#191919]">{req.status}</span>
                      </p>
                    </div>
                    {req.status === 'completed' && req.download_url && (
                      <a
                        href={req.download_url}
                        download
                        className="px-2.5 py-1 bg-[#FAF8F5] border border-[#E2DDD4] hover:bg-[#FAF8F5]/80 text-[#191919] rounded-lg font-semibold flex items-center gap-1 text-[10px]"
                      >
                        <Download className="w-3 h-3 text-[#D2654A]" />
                        <span>Download</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right to Erasure */}
        <section className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-6 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-[#B83A26]" />
            <h4 className="font-serif-heading font-semibold text-sm text-[#191919]">
              Right to Erasure (Account Deletion)
            </h4>
          </div>
          <p className="text-xs text-[#6E6862] leading-relaxed">
            Request to anonymize personal records and purge claim files. As per DPDP §12, a <strong className="text-[#191919]">30-day grace period</strong> applies, allowing you to withdraw the request at any time.
          </p>

          {activeDeletion ? (
            <div className="space-y-3 p-4 rounded-xl bg-[#FDF2F0] border border-[#F2C0B7]">
              <div>
                <p className="text-[10px] font-bold text-[#B83A26] uppercase tracking-wider">
                  Erasure Pending
                </p>
                <p className="text-[11px] text-[#6E6862] mt-0.5">
                  Scheduled on {new Date(activeDeletion.created_at).toLocaleDateString('en-IN')}. Permanent anonymization will occur after 30 days.
                </p>
              </div>
              <button
                onClick={() => cancelDeletionMutation.mutate()}
                disabled={cancelDeletionMutation.isPending}
                className="px-3.5 py-1.5 bg-[#FAF8F5] border border-[#E2DDD4] text-[#191919] hover:bg-[#FAF8F5]/80 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                {cancelDeletionMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Ban className="w-3 h-3 text-[#1E7E34]" />
                )}
                <span>Withdraw Erasure Request</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => triggerDeletionMutation.mutate()}
              disabled={triggerDeletionMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FAF8F5] border border-[#F2C0B7] text-[#B83A26] hover:bg-[#FDF2F0] rounded-full text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              {triggerDeletionMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>Request Account Erasure</span>
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
