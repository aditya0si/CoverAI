'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  const { toast, hideToast } = useAppStore();

  return (
    <QueryClientProvider client={queryClient}>
      {children}

      {/* Global Custom Toast System */}
      {toast?.message && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className="fixed bottom-5 right-5 z-[9999] max-w-sm w-full bg-slate-900/90 border border-slate-800 text-white rounded-2xl shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom duration-300 backdrop-blur-xl"
        >
          <div className="mt-0.5 shrink-0">
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
            {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-500" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
          </div>
          <div className="flex-1 text-sm font-medium pr-2 break-words">
            {toast.message}
          </div>
          <button
            onClick={hideToast}
            aria-label="Dismiss notification"
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </QueryClientProvider>
  );
}
