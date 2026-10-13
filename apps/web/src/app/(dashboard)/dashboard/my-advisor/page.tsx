/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  User,
  Loader2,
  Ban,
  Users,
  Mail,
  Phone,
  ArrowRight,
} from 'lucide-react';
import {
  getMyAdvisors,
  createAdvisorAssignment,
  deleteAdvisorAssignment,
} from '@/lib/api-client';
import { useAppStore } from '@/lib/store';
import { EmptyState } from '@/components/ui/EmptyState';

export default function MyAdvisorPage() {
  const { showToast } = useAppStore();
  const [advisorEmail, setAdvisorEmail] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const {
    data: advisors = [],
    isLoading: advisorsLoading,
    refetch: refetchAdvisors,
  } = useQuery({
    queryKey: ['my-advisors'],
    queryFn: getMyAdvisors,
  });

  const linkMutation = useMutation({
    mutationFn: (email: string) => createAdvisorAssignment(email),
    onSuccess: (data) => {
      showToast(`Advisor ${data.advisor_name} linked successfully!`, 'success');
      setAdvisorEmail('');
      setIsLinking(false);
      refetchAdvisors();
    },
    onError: (err: any) => {
      showToast(
        err.response?.data?.detail || 'Failed to link advisor. Please verify the email and try again.',
        'error'
      );
      setIsLinking(false);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (assignmentId: string) => deleteAdvisorAssignment(assignmentId),
    onSuccess: () => {
      showToast('Advisor access revoked successfully.', 'success');
      refetchAdvisors();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || 'Failed to revoke advisor access.', 'error');
    },
  });

  const handleLinkAdvisor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!advisorEmail.trim()) return;
    setIsLinking(true);
    linkMutation.mutate(advisorEmail.trim());
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h1 className="font-serif-heading text-2xl font-normal text-[#191919] tracking-tight flex items-center gap-2.5">
          <Users className="w-5 h-5 text-[#D2654A]" />
          <span>My Insurance Advisor</span>
        </h1>
        <p className="text-xs text-[#6E6862] mt-0.5">
          Connect your verified human insurance agent to assist with claim filings and policy disputes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Active Linked Advisors (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8C847B]">
            Linked Advisors
          </h3>

          {advisorsLoading ? (
            <div className="h-36 bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl animate-pulse" />
          ) : advisors.length === 0 ? (
            <EmptyState
              icon={User}
              title="No Advisor Linked"
              description="You haven't linked a dedicated insurance advisor yet. Link your agent by email to enable claim representation."
            />
          ) : (
            <div className="space-y-4">
              {advisors.map((adv) => (
                <div
                  key={adv.assignment_id}
                  className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-6 shadow-2xs space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919]">
                        <User className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-serif-heading font-semibold text-base text-[#191919]">
                          {adv.advisor_name}
                        </h4>
                        <span className="text-[10px] text-[#1E7E34] font-semibold uppercase tracking-wider">
                          Authorized Advisor
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => revokeMutation.mutate(adv.assignment_id)}
                      disabled={revokeMutation.isPending}
                      className="px-3 py-1.5 bg-[#FAF8F5] border border-[#F2C0B7] text-[#B83A26] hover:bg-[#FDF2F0] rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Ban className="w-3 h-3" />
                      <span>Revoke</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-[#6E6862] border-t border-[#E2DDD4] pt-3">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-[#8C847B] shrink-0" />
                      <span className="truncate">{adv.advisor_email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-[#8C847B] shrink-0" />
                      <span>{adv.advisor_phone}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link New Advisor Form (5 cols) */}
        <div className="lg:col-span-5 bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-6 shadow-2xs space-y-4">
          <div>
            <h3 className="font-serif-heading font-semibold text-base text-[#191919]">
              Link Advisor by Email
            </h3>
            <p className="text-xs text-[#6E6862] mt-1 leading-relaxed">
              Enter your agent&apos;s registered CoverAI email address to authorize access to your policies.
            </p>
          </div>

          <form onSubmit={handleLinkAdvisor} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="advisorEmail" className="block text-xs font-medium text-[#191919]">
                Agent Email Address
              </label>
              <input
                id="advisorEmail"
                type="email"
                required
                placeholder="advisor@agency.com"
                value={advisorEmail}
                onChange={(e) => setAdvisorEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLinking || !advisorEmail.trim()}
              className="w-full inline-flex items-center justify-center gap-2 py-3 bg-[#191919] hover:bg-[#2D2D2D] disabled:bg-[#8C847B] text-[#FAF8F5] rounded-full text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              {isLinking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Authorize Advisor</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
