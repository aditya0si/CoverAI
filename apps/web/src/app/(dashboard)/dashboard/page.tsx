/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Cpu, 
  Clock, 
  FileText, 
  CheckCircle, 
  HelpCircle, 
  Upload, 
  ArrowRight, 
  User, 
  Download, 
  Trash2, 
  Calendar, 
  FilePlus, 
  Ban, 
  RefreshCw, 
  Send, 
  Loader2, 
  Info,
  DollarSign
} from 'lucide-react';
import { 
  getPolicies, 
  getClaims, 
  getConsentRecords, 
  updateConsentRecord, 
  requestDataExport, 
  requestDataDeletion, 
  cancelDataDeletion, 
  getDataExportRequests, 
  getDataDeletionRequests, 
  createConversation, 
  getPolicyConversation, 
  getConversationMessages,
  ConsentRecord,
  PolicyDetail,
  ChatMessage as ApiMessage
} from '@/lib/api-client';
import { useAppStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ── Simple Markdown Renderer ───────────────────────────────────────────────
function Markdown({ text }: { text: string }) {
  const html = text
    .replace(/^### (.*$)/gim, '<h4 class="text-sm font-bold text-white mt-3 mb-1">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 class="text-base font-extrabold text-white mt-4 mb-2">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 class="text-lg font-black text-white mt-5 mb-2">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-950 font-mono text-xs text-blue-300 border border-slate-800">$1</code>')
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-slate-350 my-1">$1</li>')
    .replace(/\n/g, '<br />');

  return (
    <div 
      className="text-xs sm:text-sm text-slate-350 leading-relaxed font-normal space-y-1"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, showToast } = useAppStore();
  const name = user?.full_name?.split(' ')[0] || 'User';

  const [activeTab, setActiveTab] = useState<'vault' | 'ai' | 'claims' | 'privacy'>('vault');
  const [isDragging, setIsDragging] = useState(false);

  // ── 1. Fetch Basic Dashboard Data ──────────────────────────────────────────
  const { data: policies = [], isLoading: policiesLoading } = useQuery({
    queryKey: ['policies'],
    queryFn: () => getPolicies(),
  });

  const { data: claims = [], isLoading: claimsLoading, refetch: refetchClaims } = useQuery({
    queryKey: ['claims'],
    queryFn: () => getClaims(),
  });

  const activePolicies = policies.filter(p => p.status === 'active');

  // ── 2. Fetch DPDP Privacy Data ─────────────────────────────────────────────
  const { data: consents = [], refetch: refetchConsents } = useQuery({
    queryKey: ['consents'],
    queryFn: getConsentRecords,
    enabled: activeTab === 'privacy' || activeTab === 'vault',
  });

  const { data: exportRequests = [], refetch: refetchExports } = useQuery({
    queryKey: ['exports'],
    queryFn: getDataExportRequests,
    enabled: activeTab === 'privacy',
    refetchInterval: 10000, // Poll every 10s for exports
  });

  const { data: deletionRequests = [], refetch: refetchDeletions } = useQuery({
    queryKey: ['deletions'],
    queryFn: getDataDeletionRequests,
    enabled: activeTab === 'privacy',
    refetchInterval: 10000, // Poll every 10s for deletion requests
  });

  const activeDeletion = deletionRequests.find(r => r.status === 'pending');

  // Consent toggling mutations
  const toggleConsentMutation = useMutation({
    mutationFn: ({ type, granted }: { type: string; granted: boolean }) => 
      updateConsentRecord(type, granted),
    onSuccess: (data) => {
      refetchConsents();
      showToast(data.message || "Consent updated successfully.", "success");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || "Failed to update consent.", "error");
    }
  });

  const triggerExportMutation = useMutation({
    mutationFn: requestDataExport,
    onSuccess: (data) => {
      refetchExports();
      showToast(data.message || "Data export initiated.", "success");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || "Failed to initiate data export.", "error");
    }
  });

  const triggerDeletionMutation = useMutation({
    mutationFn: requestDataDeletion,
    onSuccess: (data) => {
      refetchDeletions();
      showToast(data.message || "Account deletion scheduled.", "success");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || "Failed to schedule account deletion.", "error");
    }
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: cancelDataDeletion,
    onSuccess: (data) => {
      refetchDeletions();
      showToast(data.message || "Account deletion request cancelled successfully.", "success");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || "Failed to cancel deletion request.", "error");
    }
  });

  // ── 3. Embedded AI Policy Advisor Chat Engine ──────────────────────────────
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ApiMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Set default policy when policy list loads
  useEffect(() => {
    if (activePolicies.length > 0 && !selectedPolicyId) {
      setSelectedPolicyId(activePolicies[0].id);
    }
  }, [activePolicies, selectedPolicyId]);

  // Load chat session when selected policy changes
  useEffect(() => {
    async function loadChat() {
      if (!selectedPolicyId) return;
      setChatMessages([]);
      setConversationId(null);
      setStreamingContent('');

      try {
        const convRes = await getPolicyConversation(selectedPolicyId);
        setConversationId(convRes.conversation_id);
        const msgs = await getConversationMessages(convRes.conversation_id);
        setChatMessages(msgs);
      } catch (err: any) {
        if (err.response?.status === 404) {
          try {
            const newConv = await createConversation(selectedPolicyId);
            setConversationId(newConv.conversation_id);
            setChatMessages([]);
          } catch (createErr) {
            console.error('Failed to create new conversation', createErr);
          }
        } else {
          console.error('Failed to load conversation details', err);
        }
      }
    }
    loadChat();
  }, [selectedPolicyId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingContent]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || !conversationId || isStreaming) return;

    const userMsg: ApiMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: textToSend,
      created_at: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsStreaming(true);
    setStreamingContent('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ question: textToSend })
      });

      if (!response.ok) throw new Error('Failed to fetch streaming response');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No body stream reader available');

      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const data = line.trim().slice(6);
            if (data === '[DONE]') {
              break;
            } else if (data.startsWith('Error: ')) {
              throw new Error(data.slice(7));
            } else {
              accumulatedText += data;
              setStreamingContent(accumulatedText);
            }
          }
        }
      }

      setIsStreaming(false);
      const assistantMsg: ApiMessage = {
        id: Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        content: accumulatedText,
        created_at: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, assistantMsg]);
      setStreamingContent('');

    } catch (err: any) {
      console.error(err);
      setIsStreaming(false);
      showToast(err.message || 'Error communicating with co-pilot.', 'error');
      
      const errorMsg: ApiMessage = {
        id: Math.random().toString(36).substring(2, 9),
        role: 'system',
        content: `Error: ${err.message || 'Stream connection failed.'}`,
        created_at: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    }
  };

  // ── 4. Drag & Drop Claims Zone Handlers ─────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      showToast("Files loaded. Starting your claim creation wizard...", "success");
      // Redirect to claims file wizard
      router.push('/claims/new');
    }
  };

  // Claim Timeline Stepper helper
  const renderClaimTimeline = (status: string) => {
    const steps = [
      { id: 'draft', label: 'Draft' },
      { id: 'submitted', label: 'Submitted' },
      { id: 'under_review', label: 'Reviewing' },
      { id: 'surveyor_assigned', label: 'Assigned' },
      { id: 'approved', label: 'Outcome' }
    ];

    const currentIdx = steps.findIndex(s => s.id === status);
    
    // Check if approved/rejected/settled to render final state
    const isApproved = ['approved', 'settled'].includes(status);
    const isRejected = status === 'rejected';

    return (
      <div className="flex items-center justify-between w-full relative py-3">
        <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
        {steps.map((step, idx) => {
          let isPassed = idx <= currentIdx;
          let isCurrent = idx === currentIdx;
          
          let circleColor = 'bg-slate-900 border-slate-800 text-slate-500';
          if (isPassed) {
            circleColor = 'bg-[#1B4FD8] border-[#1B4FD8] text-white shadow shadow-[#1B4FD8]/25';
          }
          if (isCurrent) {
            circleColor = 'bg-[#1B4FD8] border-blue-400 text-white ring-4 ring-[#1B4FD8]/20 scale-105';
          }
          
          if (step.id === 'approved' && isApproved) {
            circleColor = 'bg-emerald-500 border-emerald-500 text-white shadow shadow-emerald-500/25';
          } else if (step.id === 'approved' && isRejected) {
            circleColor = 'bg-rose-500 border-rose-500 text-white shadow shadow-rose-500/25';
            step.label = 'Rejected';
            isPassed = true;
          }

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-1">
              <div className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-[9px] font-bold border transition-all duration-300 ${circleColor}`}>
                {step.id === 'approved' && isApproved ? '✓' : step.id === 'approved' && isRejected ? '✗' : idx + 1}
              </div>
              <span className={`text-[8px] font-bold uppercase tracking-wider ${isPassed ? 'text-slate-200' : 'text-slate-500'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* ── Welcome Hero Banner ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-900 bg-gradient-to-r from-slate-950 via-slate-900/40 to-slate-950 p-6 sm:p-8">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#1B4FD8]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Hello, <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">{name}</span>
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium max-w-xl leading-relaxed">
              Welcome back to your premium CoverAI portal. Explore coverages, interact with your AI Policy Advisor, or control your personal privacy.
            </p>
          </div>
          
          {/* Quick Stats Block */}
          <div className="flex gap-2 shrink-0">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl px-4 py-2.5 min-w-[90px] text-center backdrop-blur">
              <span className="text-xl font-black text-white">{activePolicies.length}</span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold mt-0.5">Policies</span>
            </div>
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl px-4 py-2.5 min-w-[90px] text-center backdrop-blur">
              <span className="text-xl font-black text-white">
                {claims.filter(c => !['approved', 'rejected', 'settled'].includes(c.status)).length}
              </span>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold mt-0.5">Open Claims</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tabbed Dashboard Switcher ────────────────────────────────────────── */}
      <section className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none border-b border-slate-900 shrink-0">
        {[
          { id: 'vault', label: 'Policy Vault', icon: Shield },
          { id: 'ai', label: 'AI Policy Advisor', icon: Cpu },
          { id: 'claims', label: 'Claim Center', icon: Clock },
          { id: 'privacy', label: 'DPDP Privacy Panel', icon: ShieldCheck }
        ].map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4.5 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                isActive
                  ? 'bg-slate-900 border-slate-800 text-white shadow-md shadow-black/20'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-355 hover:bg-slate-950/20'
              }`}
            >
              <t.icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </section>

      {/* ── Active Tab Panel Content ─────────────────────────────────────────── */}
      <div className="w-full">

        {/* ── PANEL A: POLICY VAULT ──────────────────────────────────────────── */}
        {activeTab === 'vault' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-900 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">My Active Coverages</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">A complete visual vault of all active policies, premiums, and coverage limits.</p>
              </div>
              <button 
                onClick={() => router.push('/policies')}
                className="text-[11px] font-bold text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>Upload New Policy</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {policiesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-44 bg-slate-900 border border-slate-800 rounded-3xl animate-pulse" />
                ))}
              </div>
            ) : activePolicies.length === 0 ? (
              <div className="border border-slate-850 bg-slate-900/10 rounded-3xl p-10 text-center flex flex-col items-center justify-center max-w-xl mx-auto mt-4">
                <ShieldAlert className="w-10 h-10 text-slate-600 mb-3" />
                <h4 className="font-bold text-white text-sm">No Active Policies</h4>
                <p className="text-[11px] text-slate-450 mt-1 max-w-sm">Upload a vehicle insurance policy PDF to start querying exclusions and filing smart claims.</p>
                <button 
                  onClick={() => router.push('/policies')}
                  className="mt-4 px-4 py-2 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Ingest Policy PDF
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {activePolicies.map((p) => {
                  const pObj = p as unknown as Record<string, unknown>;
                  const insurerName = p.insurer_name || (pObj.insurerName as string) || "Unknown";
                  const policyNumber = p.policy_number || (pObj.policyNumber as string) || "";
                  const vehicleYear = p.vehicle_year || (pObj.vehicleYear as number) || 2024;
                  const vehicleMake = p.vehicle_make || (pObj.vehicleMake as string) || "";
                  const vehicleRegistration = p.vehicle_registration || (pObj.vehicleRegistration as string) || "Unknown";
                  const sumInsured = p.sum_insured !== undefined ? p.sum_insured : ((pObj.sumInsured as number) ?? 0);
                  const premiumAmount = p.premium_amount !== undefined ? p.premium_amount : ((pObj.premiumAmount as number) ?? 0);
                  const rawEndDate = p.end_date || (pObj.endDate as string);
                  const endDate = rawEndDate ? new Date(rawEndDate) : new Date();
                  const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <div 
                      key={p.id}
                      className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-[#1B4FD8]/35 hover:bg-slate-900/80 transition-all duration-300 shadow-lg shadow-black/25 flex flex-col justify-between h-[210px] group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#1B4FD8]/5 rounded-full blur-xl pointer-events-none" />
                      
                      <div className="space-y-3.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-extrabold text-sm text-white line-clamp-1 group-hover:text-blue-400 transition-colors">{insurerName}</h4>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5 tracking-wider uppercase">{policyNumber}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[8px] font-black uppercase tracking-widest">
                            {p.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-slate-850 pt-2.5">
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Vehicle Details</span>
                            <span className="text-slate-300 font-medium truncate block max-w-[120px]">{vehicleYear} {vehicleMake}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Registration</span>
                            <span className="text-slate-350 font-mono block truncate">{vehicleRegistration}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Sum Insured</span>
                            <span className="text-slate-200 font-extrabold block">₹ {sumInsured.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Premium Amount</span>
                            <span className="text-slate-200 font-extrabold block">₹ {premiumAmount.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-850/60">
                        <span className={`text-[9px] font-semibold ${daysLeft <= 30 ? 'text-amber-400' : 'text-slate-550'}`}>
                          Expires {endDate.toLocaleDateString()} {daysLeft <= 30 && `(${daysLeft}d left)`}
                        </span>
                        
                        <button 
                          onClick={() => router.push(`/policies/${p.id}`)}
                          className="px-3 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-white rounded-lg text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          <span>Review Exclusions</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PANEL B: AI POLICY ADVISOR ─────────────────────────────────────── */}
        {activeTab === 'ai' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-200">
            
            {/* Chat parameters sidebar (4 cols) */}
            <div className="lg:col-span-4 backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/25 space-y-4">
              <div>
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-400">Policy Context</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Select a policy cover below to ask clause exclusions and deductible questions.</p>
              </div>

              {activePolicies.length === 0 ? (
                <div className="p-4 text-center text-slate-650 text-[10px] border border-slate-850 rounded-xl bg-slate-950/20">
                  No active policies for Q&A.
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="policy-select" className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Active Insurer</label>
                  <select 
                    id="policy-select"
                    value={selectedPolicyId}
                    onChange={(e) => setSelectedPolicyId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] rounded-xl text-xs text-white focus:outline-none transition-all cursor-pointer"
                  >
                    {activePolicies.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.insurer_name} ({p.vehicle_registration})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Suggestions Grid */}
              {selectedPolicyId && (
                <div className="space-y-2.5 pt-3 border-t border-slate-850/80">
                  <h5 className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Suggested Inquiries</h5>
                  <div className="flex flex-col gap-1.5">
                    {[
                      "What does this policy exclude?",
                      "Are natural calamities covered?",
                      "What are the claim deductibles?",
                      "Does it cover engine flooding?"
                    ].map((s) => (
                      <button
                        key={s}
                        disabled={isStreaming}
                        onClick={() => {
                          setInputText(s);
                          handleSendMessage(s);
                        }}
                        className="w-full p-2.5 text-left bg-slate-950/50 hover:bg-[#1B4FD8]/10 text-slate-400 hover:text-white rounded-xl border border-slate-850 hover:border-[#1B4FD8]/40 transition-all text-[10px] font-medium leading-snug cursor-pointer disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Chat dialogue window (8 cols) */}
            <div className="lg:col-span-8 flex flex-col backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl h-[480px] shadow-lg shadow-black/25 overflow-hidden">
              
              {/* Header */}
              <div className="p-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-white">Interactive Advisor Q&A Session</h4>
                </div>
                {isStreaming && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/15 animate-pulse">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>Streaming Response</span>
                  </span>
                )}
              </div>

              {/* Message scroll log */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.length === 0 && !isStreaming ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                    <Cpu className="w-8 h-8 text-blue-500 opacity-30 mb-2 animate-bounce" />
                    <h5 className="font-bold text-xs text-white">Ask your Advisor Anything</h5>
                    <p className="text-[10px] max-w-xs">Ask questions about exclusion terms, third party coverage boundaries, or visual verification guidelines.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chatMessages.map((msg) => {
                      const isUser = msg.role === 'user';
                      if (msg.role === 'system') {
                        return (
                          <div key={msg.id} className="flex justify-center my-1 animate-in fade-in">
                            <span className="bg-slate-950 border border-slate-850 px-3 py-1 rounded-full text-[9px] font-bold text-slate-550 italic">
                              {msg.content}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div key={msg.id} className={`flex w-full gap-2.5 py-1.5 animate-in fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {!isUser && (
                            <div className="w-7 h-7 rounded-lg bg-[#1B4FD8]/10 border border-[#1B4FD8]/15 text-[#1B4FD8] flex items-center justify-center shrink-0">
                              <Cpu className="w-4 h-4 text-blue-400" />
                            </div>
                          )}
                          <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl shadow ${isUser ? 'bg-[#1B4FD8] text-white rounded-tr-none' : 'bg-slate-950 border border-slate-850 text-slate-200 rounded-tl-none'}`}>
                            <Markdown text={msg.content} />
                          </div>
                          {isUser && (
                            <div className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-850 text-slate-550 flex items-center justify-center shrink-0">
                              <User className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {isStreaming && streamingContent && (
                      <div className="flex w-full gap-2.5 py-1.5 justify-start animate-in fade-in">
                        <div className="w-7 h-7 rounded-lg bg-[#1B4FD8]/10 border border-[#1B4FD8]/15 text-[#1B4FD8] flex items-center justify-center shrink-0">
                          <Cpu className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-850 text-slate-200 rounded-tl-none relative">
                          <Markdown text={streamingContent} />
                          <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse ml-1 align-middle" />
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                )}
              </div>

              {/* Input drawer */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(inputText);
                }}
                className="p-3 border-t border-slate-800/85 bg-slate-900/30 flex gap-2 shrink-0"
              >
                <input 
                  type="text"
                  required
                  disabled={isStreaming || !conversationId}
                  placeholder={conversationId ? "Ask a policy question..." : "Select policy cover above to start..."}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-850 focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] rounded-xl text-xs text-white placeholder-slate-650 focus:outline-none transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isStreaming || !inputText.trim() || !conversationId}
                  className="p-2.5 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 disabled:bg-slate-800 disabled:text-slate-650 text-white rounded-xl transition-all cursor-pointer shrink-0"
                >
                  {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>

            </div>
          </div>
        )}

        {/* ── PANEL C: CLAIM CENTER ──────────────────────────────────────────── */}
        {activeTab === 'claims' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-900 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Claims Control Hub</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Submit new claims, upload visual evidence, and track triage progress in real-time.</p>
              </div>
              <button 
                onClick={() => router.push('/claims/new')}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#1B4FD8]/15 cursor-pointer"
              >
                <FilePlus className="w-4 h-4" />
                <span>File a Claim</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Claims tracking deck (8 cols) */}
              <div className="lg:col-span-8 space-y-4">
                {claimsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-3xl animate-pulse" />
                    ))}
                  </div>
                ) : claims.length === 0 ? (
                  <div className="border border-slate-850 bg-slate-900/10 rounded-3xl p-10 text-center flex flex-col items-center justify-center">
                    <FileText className="w-10 h-10 text-slate-600 mb-3" />
                    <h4 className="font-bold text-white text-sm">No Claims Found</h4>
                    <p className="text-[11px] text-slate-450 mt-1 max-w-sm">You haven&apos;t filed any claims yet. If your vehicle was in an incident, you can file a claim instantly.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {claims.map((c) => {
                      const date = new Date(c.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      });
                      return (
                        <div 
                          key={c.id}
                          className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all duration-200 shadow-md flex flex-col sm:flex-row justify-between gap-5"
                        >
                          <div className="space-y-3.5 flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-[9px] text-slate-500 font-mono tracking-wider block uppercase">Claim Reference</span>
                                <h4 className="font-extrabold text-sm text-white font-mono mt-0.5 truncate">{c.claim_number}</h4>
                              </div>
                              <div className="sm:hidden text-right">
                                <span className="text-[9px] text-slate-500 font-mono tracking-wider block uppercase">Date Filed</span>
                                <span className="text-[10px] text-slate-350 font-bold block mt-0.5">{date}</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-[10px]">
                              <div>
                                <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Damage Type</span>
                                <span className="text-slate-300 font-semibold capitalize mt-0.5 block">{c.claim_type.replace('_', ' ')}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Estimated Damages</span>
                                <span className="text-slate-200 font-bold mt-0.5 block">₹ {c.estimated_amount.toLocaleString()}</span>
                              </div>
                            </div>

                            {/* Stepper tracker */}
                            <div className="pt-2 border-t border-slate-850/60">
                              {renderClaimTimeline(c.status)}
                            </div>
                          </div>

                          <div className="flex sm:flex-col justify-between sm:justify-center items-end sm:items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-850 pt-3 sm:pt-0 sm:pl-5 shrink-0 min-w-[120px]">
                            <div className="hidden sm:block text-center">
                              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Date Filed</span>
                              <span className="text-xs text-slate-350 font-bold mt-1 block">{date}</span>
                            </div>
                            <button
                              onClick={() => router.push(`/claims/${c.id}`)}
                              className="w-full sm:w-auto px-4.5 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-white rounded-lg text-[10px] font-extrabold transition-all cursor-pointer text-center"
                            >
                              Open Timeline Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Drag and drop upload trigger (4 cols) */}
              <div className="lg:col-span-4 space-y-4">
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-3xl p-6 text-center flex flex-col items-center justify-center min-h-[220px] transition-all duration-300 ${
                    isDragging 
                      ? 'border-blue-400 bg-blue-500/5 text-white scale-[1.01] shadow-lg shadow-blue-500/10' 
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900/20 text-slate-500 hover:bg-slate-900/40'
                  }`}
                >
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition-all mb-4 ${
                    isDragging ? 'bg-blue-500/10 border-blue-400/20 text-blue-400 scale-105' : 'bg-slate-950 border-slate-850 text-slate-600'
                  }`}>
                    <Upload className="w-5 h-5" />
                  </div>
                  <h4 className="font-extrabold text-xs text-white">Fast-Track Smart Claim</h4>
                  <p className="text-[10px] text-slate-450 mt-1 max-w-[180px] mx-auto leading-normal">
                    Drag & drop your vehicle damage images here to instantly initiate your co-pilot claim workflow.
                  </p>
                  
                  <button 
                    onClick={() => router.push('/claims/new')}
                    className="mt-5 px-3 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-white rounded-xl text-[10px] font-bold tracking-wide transition-all cursor-pointer"
                  >
                    Select Incident Files
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── PANEL D: DPDP PRIVACY & CONSENT ─────────────────────────────────── */}
        {activeTab === 'privacy' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Header */}
            <div className="border-b border-slate-900 pb-3">
              <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">Digital Personal Data Protection (DPDP) Panel</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">As per the DPDP Act 2023 of India, you retain absolute authority to view, toggle, or request the erasure of your personal records.</p>
            </div>

            {/* AI analysis consent alert notice */}
            {consents.find(c => c.consent_type === 'ai_analysis' && !c.granted) && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3 animate-in slide-in-from-top duration-300">
                <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <span className="font-bold text-amber-400 uppercase tracking-wider block text-[10px]">AI Consent Withdrawn</span>
                  <p className="text-slate-300 leading-relaxed font-normal">
                    Consent for AI analysis is currently revoked. While past assessments are retained for policy archives, future claims triage and visual photo checking will not run automatically unless consent is granted again.
                  </p>
                </div>
              </div>
            )}

            {/* Consents Toggle Grid */}
            <section className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-550 flex items-center gap-1.5">
                <span>Manage Data Processing Consents</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    type: 'ai_analysis',
                    title: 'AI Vision & Triage Analysis',
                    desc: 'Grants consent for our large language models and vision systems to process and extract coverage evaluations from policy PDFs and damage evidence photos.',
                    icon: Cpu
                  },
                  {
                    type: 'third_party_sharing',
                    title: 'Assigned Advisor Data Sharing',
                    desc: 'Allows CoverAI to share your policies and claims context with your assigned human advisor to support claim appeals and recommendations.',
                    icon: User
                  },
                  {
                    type: 'data_processing',
                    title: 'Core Platform Data Ingestion',
                    desc: 'Required consent enabling the database to store and compile encrypted registration details, insurer logs, and personal phone hashes.',
                    icon: Shield
                  },
                  {
                    type: 'marketing',
                    title: 'Personalized Coverage Notifications',
                    desc: 'Opt-in consent for receiving vehicle service reminders, policy renewal alerts, and customized insurance co-pilot tips.',
                    icon: FileText
                  }
                ].map((c) => {
                  const record = consents.find(r => r.consent_type === c.type);
                  const isGranted = record ? record.granted : true;
                  return (
                    <div 
                      key={c.type}
                      className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-750 transition-all flex justify-between items-start gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-6.5 h-6.5 rounded-lg bg-slate-950 border border-slate-850 flex items-center justify-center shrink-0 text-slate-500">
                            <c.icon className="w-3.5 h-3.5 text-blue-400" />
                          </div>
                          <h4 className="font-extrabold text-xs text-white leading-normal">{c.title}</h4>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed font-normal">{c.desc}</p>
                      </div>

                      {/* Switch Button */}
                      <button
                        onClick={() => toggleConsentMutation.mutate({ type: c.type, granted: !isGranted })}
                        disabled={toggleConsentMutation.isPending}
                        className={`w-11 h-6.5 rounded-full p-1 transition-all duration-300 cursor-pointer shrink-0 mt-0.5 flex ${
                          isGranted ? 'bg-emerald-500 justify-end' : 'bg-slate-850 justify-start'
                        }`}
                      >
                        <div className="w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Erasure and Portability Panel (Split Layout) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3">
              
              {/* Data Portability (JSON Export) */}
              <section className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-blue-400" />
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-white">Right to Data Portability</h4>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal font-normal">
                  You can request a complete data portability dump. We will securely compile all your user records, insurance policies, claim histories, and AI Advisor Q&A chat transcripts into a downloadable JSON file.
                </p>
                
                <button
                  onClick={() => triggerExportMutation.mutate()}
                  disabled={triggerExportMutation.isPending}
                  className="px-4 py-2 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                >
                  {triggerExportMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Generate Personal Data Archive</span>
                </button>

                {/* Export Files History Feed */}
                {exportRequests.length > 0 && (
                  <div className="space-y-2 border-t border-slate-850 pt-3 mt-3">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-550 block">Your Export Archives</span>
                    <div className="divide-y divide-slate-855">
                      {exportRequests.map((req) => (
                        <div key={req.id} className="py-2 flex justify-between items-center text-[10px]">
                          <div className="min-w-0">
                            <p className="font-mono text-slate-400 truncate max-w-[160px]">{req.id}</p>
                            <p className="text-[8px] text-slate-500 font-semibold uppercase mt-0.5">
                              Status: <span className={req.status === 'completed' ? 'text-emerald-400' : req.status === 'failed' ? 'text-rose-400' : 'text-amber-400'}>{req.status}</span>
                            </p>
                          </div>
                          {req.status === 'completed' && req.download_url && (
                            <a 
                              href={req.download_url} 
                              download
                              className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer text-[9px]"
                            >
                              <Download className="w-3 h-3 text-blue-400" />
                              <span>Download JSON</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Right to Erasure (Deletion Request) */}
              <section className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 relative overflow-hidden">
                {activeDeletion && (
                  <div className="absolute inset-0 bg-[#DC2626]/5 pointer-events-none" />
                )}
                
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-white">Right to Erasure (Account Deletion)</h4>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal font-normal">
                  Submit a request to anonymize your personal records and delete all associated claim history logs. Under Section 12 of the DPDP Act, **a 30-day grace period is enforced**. You can cancel the scheduled erasure anytime within 30 days.
                </p>

                {activeDeletion ? (
                  <div className="space-y-3.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 animate-in zoom-in-95 duration-200">
                    <div>
                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider leading-none">Erasure Scheduled</p>
                      <p className="text-[9px] text-slate-400 mt-1">Requested on {new Date(activeDeletion.created_at).toLocaleDateString()}. Your data will be deleted within 30 days.</p>
                    </div>
                    <button
                      onClick={() => cancelDeletionMutation.mutate()}
                      disabled={cancelDeletionMutation.isPending}
                      className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-white rounded-lg text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {cancelDeletionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3 text-emerald-400" />}
                      <span>Cancel Erasure Request</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => triggerDeletionMutation.mutate()}
                    disabled={triggerDeletionMutation.isPending}
                    className="px-4 py-2 bg-rose-650/10 hover:bg-rose-600 hover:text-white border border-rose-500/20 hover:border-rose-500 text-rose-400 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                  >
                    {triggerDeletionMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>Request Data Deletion</span>
                  </button>
                )}
              </section>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}
