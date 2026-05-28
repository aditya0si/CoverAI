'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  Car, 
  Calendar, 
  CircleDollarSign, 
  Send,
  Loader2,
  ArrowLeft,
  MessageSquareOff
} from 'lucide-react';
import { 
  getPolicy, 
  getPolicyConversation, 
  createConversation, 
  getConversationMessages,
  ChatMessage as ApiMessage
} from '@/lib/api-client';
import { StatusBadge } from '@/components/status-badge';
import { ChatMessage } from '@/components/chat-message';
import { useAppStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function PolicyDetailPage() {
  const { id: policyId } = useParams() as { id: string };
  const router = useRouter();
  const { showToast } = useAppStore();
  
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Policy Details
  const { data: policy, isLoading: policyLoading, error: policyError } = useQuery({
    queryKey: ['policy', policyId],
    queryFn: () => getPolicy(policyId),
    retry: false,
  });

  // 2. Fetch or Initialize Conversation Session
  useEffect(() => {
    async function initChat() {
      try {
        // Try getting existing conversation
        const convRes = await getPolicyConversation(policyId);
        const cObj = convRes as unknown as Record<string, unknown>;
        const cid = (convRes.conversation_id || cObj.conversationId) as string;
        setConversationId(cid);
        
        // Fetch existing messages
        const msgs = await getConversationMessages(cid);
        setMessages(msgs);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err.response?.status === 404) {
          // Create new conversation context automatically
          try {
            const newConv = await createConversation(policyId);
            const newCObj = newConv as unknown as Record<string, unknown>;
            const newCid = (newConv.conversation_id || newCObj.conversationId) as string;
            setConversationId(newCid);
            setMessages([]);
          } catch (createErr) {
            console.error('Failed to create new conversation', createErr);
          }
        } else {
          console.error('Failed to load conversation details', err);
        }
      }
    }

    if (policyId) {
      initChat();
    }
  }, [policyId]);

  // Scroll to bottom on messages change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !conversationId || isStreaming) return;

    const userText = inputText.trim();
    setInputText('');

    // Append user message immediately
    const userMsg: ApiMessage = {
      id: Math.random().toString(36).substring(2, 9),
      role: 'user',
      content: userText,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);

    // Initialize streaming assistant state
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
        body: JSON.stringify({ question: userText })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch streaming response');
      }

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

        // Process SSE lines
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Retain incomplete line

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const data = line.trim().slice(6);
            if (data === '[DONE]') {
              // End of stream
              break;
            } else if (data.startsWith('Error: ')) {
              throw new Error(data.slice(7));
            } else {
              // Append chunk token
              accumulatedText += data;
              setStreamingContent(accumulatedText);
            }
          }
        }
      }

      // Finish streaming and append permanent assistant message
      setIsStreaming(false);
      const assistantMsg: ApiMessage = {
        id: Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        content: accumulatedText,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMsg]);
      setStreamingContent('');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      setMessages(prev => [...prev, errorMsg]);
    }
  };

  if (policyLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-900 rounded" />
        <div className="h-64 bg-slate-900 border border-slate-800 rounded-3xl" />
        <div className="h-96 bg-slate-900 border border-slate-800 rounded-3xl" />
      </div>
    );
  }

  if (policyError || !policy) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/10 mx-auto">
          <MessageSquareOff className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white">Policy Not Found</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">The policy you are looking for does not exist or you do not have permission to view it.</p>
        <button onClick={() => router.push('/policies')} className="text-xs font-semibold text-blue-400 hover:underline">
          Return to Policies
        </button>
      </div>
    );
  }
  // Define fallback variables supporting both camelCase and snake_case backend schemas
  const pObj = policy as unknown as Record<string, unknown>;
  const insurerName = policy?.insurer_name || (pObj?.insurerName as string) || "Unknown";
  const policyNumber = policy?.policy_number || (pObj?.policyNumber as string) || "";
  const vehicleRegistration = policy?.vehicle_registration || (pObj?.vehicleRegistration as string) || "Unknown";
  const vehicleYear = policy?.vehicle_year || (pObj?.vehicleYear as number) || 2024;
  const vehicleMake = policy?.vehicle_make || (pObj?.vehicleMake as string) || "";
  const vehicleModel = policy?.vehicle_model || (pObj?.vehicleModel as string) || "";
  const sumInsured = policy?.sum_insured !== undefined ? policy.sum_insured : ((pObj?.sumInsured as number) ?? 0);
  const premiumAmount = policy?.premium_amount !== undefined ? policy.premium_amount : ((pObj?.premiumAmount as number) ?? 0);
  const startDate = policy?.start_date || (pObj?.startDate as string);
  const endDate = policy?.end_date || (pObj?.endDate as string);
  const status = policy?.status || (pObj?.status as string) || "active";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Back button */}
      <div>
        <button 
          onClick={() => router.push('/policies')} 
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white font-semibold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Policies</span>
        </button>
      </div>

      {/* Grid container splitting Policy Info and Chat panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Hand: Policy Details (4 cols) */}
        <section className="lg:col-span-4 space-y-4">
          <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-black/25 space-y-5">
            
            {/* Header info */}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B4FD8]/10 text-blue-400 flex items-center justify-center border border-[#1B4FD8]/10 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm line-clamp-1">{insurerName}</h3>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">{policyNumber}</p>
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            <div className="h-px bg-slate-800/80 w-full" />

            {/* Vehicle Details */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vehicle Specification</h4>
              <div className="flex items-start gap-2.5">
                <Car className="w-4.5 h-4.5 text-slate-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-slate-200 uppercase tracking-wide bg-slate-950 border border-slate-850 px-2 py-0.5 rounded inline-block">
                    {vehicleRegistration}
                  </p>
                  <p className="text-slate-400 font-medium pt-1">
                    {vehicleYear} {vehicleMake} {vehicleModel}
                  </p>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-800/80 w-full" />

            {/* Coverage Limits */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Coverage & Premiums</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500">Sum Insured</span>
                  <div className="flex items-center gap-1 font-bold text-slate-100 text-xs">
                    <CircleDollarSign className="w-3.5 h-3.5 text-slate-500" />
                    <span>₹ {sumInsured.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500">Premium Paid</span>
                  <div className="flex items-center gap-1 font-bold text-slate-100 text-xs">
                    <CircleDollarSign className="w-3.5 h-3.5 text-slate-500" />
                    <span>₹ {premiumAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-800/80 w-full" />

            {/* Dates */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Duration Period</h4>
              <div className="flex items-center gap-2.5 text-xs text-slate-400">
                <Calendar className="w-4.5 h-4.5 text-slate-500 shrink-0" />
                <div className="space-y-0.5">
                  <p>Start: {startDate ? new Date(startDate).toLocaleDateString() : "Unknown"}</p>
                  <p>End: {endDate ? new Date(endDate).toLocaleDateString() : "Unknown"}</p>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Right Hand: Q&A Chat Assistant panel (8 cols) */}
        <section className="lg:col-span-8 flex flex-col backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl h-[560px] shadow-lg shadow-black/25">
          
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-white">Exclusions & Policy Co-Pilot</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Review clause items, visual damage criteria, and coverage rules.</p>
            </div>
            {isStreaming && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 animate-pulse bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>AI Streaming</span>
              </span>
            )}
          </div>

          {/* Chat Logs scroll area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !isStreaming ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-2">
                  <Send className="w-5 h-5 -rotate-45" />
                </div>
                <h4 className="font-bold text-xs text-white">Ask anything about this policy</h4>
                <p className="text-[10px] max-w-sm">&quot;Are fender benders covered?&quot;, &quot;What is my deductibles limit?&quot;, or &quot;Does natural calamity protect engine flooding?&quot;</p>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
                ))}
                {isStreaming && streamingContent && (
                  <ChatMessage role="assistant" content={streamingContent} isStreaming={true} />
                )}
              </>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Form input drawer */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800/85 bg-slate-900/40 flex gap-2 shrink-0">
            <input
              type="text"
              required
              disabled={isStreaming || !conversationId}
              placeholder={conversationId ? "Ask a policy question..." : "Initializing chat context..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] rounded-xl text-xs text-white placeholder-slate-650 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isStreaming || !inputText.trim() || !conversationId}
              className="p-2.5 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-all cursor-pointer shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="w-4.5 h-4.5 animate-spin" />
              ) : (
                <Send className="w-4.5 h-4.5" />
              )}
            </button>
          </form>

        </section>

      </div>

    </div>
  );
}
