'use client';

import Link from 'next/link';
import { ShieldOff, ArrowLeft } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center max-w-md w-full space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <ShieldOff className="w-10 h-10 text-rose-400" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Access Denied
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            You don&apos;t have permission to view this page. This area requires a different account role.
          </p>
        </div>

        {/* Code badge */}
        <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-500">
          403 Forbidden
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white text-sm font-semibold transition-colors"
          >
            Sign in with a different account
          </Link>
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-sm font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
