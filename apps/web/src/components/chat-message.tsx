import React from 'react';
import { cn } from '@coverai/ui';
import { User, ShieldAlert } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming = false }: ChatMessageProps) {
  const isUser = role === 'user';

  if (role === 'system') {
    return (
      <div className="flex justify-center w-full my-2 animate-in fade-in duration-300">
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-full px-3 py-1 text-[11px] font-medium text-slate-400 text-center tracking-wide">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex w-full gap-3 py-2 animate-in fade-in duration-300", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-[#1B4FD8]/10 border border-[#1B4FD8]/15 text-[#1B4FD8] flex items-center justify-center shrink-0 shadow-sm shadow-[#1B4FD8]/5">
          <ShieldAlert className="w-4.5 h-4.5 text-blue-400" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-md tracking-normal font-normal",
          isUser
            ? "bg-[#1B4FD8] text-white rounded-br-none shadow-[#1B4FD8]/10"
            : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none"
        )}
      >
        <span className="whitespace-pre-wrap">{content}</span>
        {isStreaming && (
          <span className="inline-block w-1.5 h-3.5 ml-1 bg-blue-400 animate-pulse align-middle" />
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center shrink-0 shadow-sm">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
