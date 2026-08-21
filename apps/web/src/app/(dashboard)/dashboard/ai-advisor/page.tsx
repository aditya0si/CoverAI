/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Cpu,
  Send,
  Loader2,
  User,
  MessageSquare,
  Sparkles,
  Bot,
} from 'lucide-react';
import {
  getPolicies,
  createConversation,
  getPolicyConversation,
  getConversationMessages,
  ChatMessage as ApiMessage,
} from '@/lib/api-client';
import { useAppStore } from '@/lib/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ── Clean Markdown Renderer ───────────────────────────────────────────────
function Markdown({ text }: { text: string }) {
  const html = text
    .replace(/^### (.*$)/gim, '<h4 class="font-serif-heading text-sm font-bold text-[#191919] mt-3 mb-1">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 class="font-serif-heading text-base font-bold text-[#191919] mt-4 mb-2">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 class="font-serif-heading text-lg font-bold text-[#191919] mt-5 mb-2">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-[#191919]">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 rounded bg-[#FAF8F5] border border-[#E2DDD4] font-mono text-[11px] text-[#D2654A]">$1</code>')
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-[#4A443E] my-1">$1</li>')
    .replace(/\n/g, '<br />');

  return (
    <div
      className="text-xs sm:text-sm text-[#38332E] leading-relaxed space-y-1.5 font-normal"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function AIAdvisorPage() {
  const { showToast } = useAppStore();

  const { data: policies = [] } = useQuery({
    queryKey: ['policies'],
    queryFn: () => getPolicies(),
  });
  const activePolicies = policies.filter((p) => p.status === 'active');

  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ApiMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activePolicies.length > 0 && !selectedPolicyId) {
      setSelectedPolicyId(activePolicies[0].id);
    }
  }, [activePolicies, selectedPolicyId]);

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
      created_at: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsStreaming(true);
    setStreamingContent('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(`${API_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ question: textToSend }),
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
            if (data === '[DONE]') break;
            else if (data.startsWith('Error: ')) throw new Error(data.slice(7));
            else {
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
        created_at: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent('');
    } catch (err: any) {
      console.error(err);
      setIsStreaming(false);
      showToast(err.message || 'Error communicating with co-pilot.', 'error');
      const errorMsg: ApiMessage = {
        id: Math.random().toString(36).substring(2, 9),
        role: 'system',
        content: `Error: ${err.message || 'Stream connection failed.'}`,
        created_at: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    }
  };

  const suggestedQuestions = [
    'What key exclusions apply to my vehicle?',
    'Are water ingress or engine damages covered?',
    'What is my compulsory deductible amount?',
    'How does zero depreciation rider benefit a claim?',
    'What documents do I need for an accident claim?',
    'Does my policy cover third-party liability limits?',
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200 h-full">
      {/* Header */}
      <div>
        <h2 className="font-serif-heading text-xl font-normal text-[#191919] flex items-center gap-2">
          <Cpu className="w-5 h-5 text-[#D2654A]" />
          <span>AI Policy Advisor</span>
        </h2>
        <p className="text-xs text-[#6E6862] mt-0.5">
          Ask questions in plain English to understand exclusions, deductibles, and claim procedures.
        </p>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Policy Context & Prompts Sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 space-y-3.5 shadow-2xs">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#8C847B]">
                Active Policy Context
              </h4>
              <p className="text-[11px] text-[#6E6862] mt-0.5">
                Questions will be answered based on clauses in this policy.
              </p>
            </div>

            {activePolicies.length === 0 ? (
              <div className="p-4 text-center text-[#8C847B] text-xs border border-[#E2DDD4] rounded-xl bg-[#FAF8F5]">
                No active policies loaded.
              </div>
            ) : (
              <select
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E2DDD4] text-xs text-[#191919] rounded-xl font-medium outline-none cursor-pointer focus:ring-1 focus:ring-[#191919]"
              >
                {activePolicies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.insurer_name} ({p.vehicle_registration})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Suggested Prompts */}
          {selectedPolicyId && (
            <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-2xl p-5 space-y-3 shadow-2xs">
              <div className="flex items-center gap-1.5 text-[#D2654A]">
                <Sparkles className="w-3.5 h-3.5" />
                <h5 className="text-[10px] uppercase tracking-wider font-bold text-[#8C847B]">
                  Suggested Inquiries
                </h5>
              </div>
              <div className="flex flex-col gap-1.5">
                {suggestedQuestions.map((s) => (
                  <button
                    key={s}
                    disabled={isStreaming}
                    onClick={() => {
                      setInputText(s);
                      handleSendMessage(s);
                    }}
                    className="w-full p-2.5 text-left bg-[#FAF8F5] hover:bg-[#FAF8F5]/80 text-[#4A443E] hover:text-[#191919] rounded-xl border border-[#E2DDD4] transition-all text-[11px] font-medium leading-snug cursor-pointer disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chat Window (8 cols) */}
        <div className="lg:col-span-8 flex flex-col bg-[#F3EFE6] border border-[#E2DDD4] rounded-2xl h-[600px] shadow-xs overflow-hidden">
          {/* Chat Header */}
          <div className="px-5 py-3.5 border-b border-[#E2DDD4] bg-[#FAF8F5] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#1E7E34]" />
              <span className="font-semibold text-xs text-[#191919]">
                Policy Reasoning Session
              </span>
            </div>
            {isStreaming && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#D2654A] bg-[#FDF2F0] px-2.5 py-0.5 rounded-full border border-[#F2C0B7]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Generating explanation...</span>
              </span>
            )}
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {chatMessages.length === 0 && !isStreaming ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#6E6862] space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#8C847B]">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h4 className="font-serif-heading font-semibold text-base text-[#191919]">
                  Ask Anything About Your Coverage
                </h4>
                <p className="text-xs max-w-sm leading-relaxed">
                  Our co-pilot reads your policy clauses and provides plain-language answers with exact citations.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {chatMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  if (msg.role === 'system') {
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <span className="bg-[#FAF8F5] border border-[#E2DDD4] px-3 py-1 rounded-full text-[10px] font-medium text-[#8C847B]">
                          {msg.content}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={msg.id}
                      className={`flex w-full gap-2.5 py-1 ${
                        isUser ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {!isUser && (
                        <div className="w-7 h-7 rounded-lg bg-[#FAF8F5] border border-[#E2DDD4] text-[#191919] flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4 text-[#D2654A]" />
                        </div>
                      )}
                      <div
                        className={`max-w-[82%] px-4 py-3 rounded-2xl ${
                          isUser
                            ? 'bg-[#191919] text-[#FAF8F5] rounded-tr-xs'
                            : 'bg-[#FAF8F5] border border-[#E2DDD4] text-[#191919] rounded-tl-xs shadow-2xs'
                        }`}
                      >
                        {isUser ? (
                          <p className="text-xs leading-relaxed font-normal">{msg.content}</p>
                        ) : (
                          <Markdown text={msg.content} />
                        )}
                      </div>
                      {isUser && (
                        <div className="w-7 h-7 rounded-lg bg-[#FAF8F5] border border-[#E2DDD4] text-[#8C847B] flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {isStreaming && streamingContent && (
                  <div className="flex w-full gap-2.5 py-1 justify-start">
                    <div className="w-7 h-7 rounded-lg bg-[#FAF8F5] border border-[#E2DDD4] text-[#D2654A] flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="max-w-[82%] px-4 py-3 rounded-2xl bg-[#FAF8F5] border border-[#E2DDD4] text-[#191919] rounded-tl-xs shadow-2xs">
                      <Markdown text={streamingContent} />
                      <span className="inline-block w-1.5 h-3.5 bg-[#D2654A] animate-pulse ml-1 align-middle" />
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            )}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="p-3.5 border-t border-[#E2DDD4] bg-[#FAF8F5] flex gap-2 shrink-0"
          >
            <input
              type="text"
              required
              disabled={isStreaming || !conversationId}
              placeholder={
                conversationId
                  ? 'Ask a question about policy terms, claims, or exclusions...'
                  : 'Select a policy above to begin session...'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-[#F3EFE6] border border-[#E2DDD4] focus:border-[#191919] focus:ring-1 focus:ring-[#191919] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isStreaming || !inputText.trim() || !conversationId}
              className="p-2.5 bg-[#191919] hover:bg-[#2D2D2D] disabled:bg-[#8C847B] text-[#FAF8F5] rounded-xl transition-all cursor-pointer shrink-0 shadow-xs"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
