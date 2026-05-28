'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Info, FileText, CheckCircle } from 'lucide-react';

export default function PrivacyBanner() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Only check local storage in browser
    const consent = localStorage.getItem('dpdp_consent');
    if (!consent) {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('dpdp_consent', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="relative max-w-lg w-full bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 text-white rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-6 overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Premium Shield Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <ShieldCheck className="w-9 h-9" />
        </div>

        {/* Text Details */}
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
            DPDP Privacy & Data Consent
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed px-2">
            This platform processes your personal data in strict compliance with the 
            <strong> Digital Personal Data Protection (DPDP) Act, 2023 (India)</strong>.
          </p>
        </div>

        {/* Info card */}
        <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 flex gap-3">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <span className="font-semibold text-slate-200">What we process:</span>
            <span>
              We collect your name, email, phone number, vehicle registration details, and claim photos. 
              These are used solely for automatic coverage analysis and vision damage triage.
            </span>
          </div>
        </div>

        {/* Consent terms bullet list */}
        <div className="w-full flex flex-col gap-2.5 text-xs text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Right to withdraw consent (AI analysis) at any time.</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Right to download/export your full personal data archive.</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Right to request permanent deletion/anonymization.</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex flex-col sm:flex-row gap-3 mt-2">
          <a
            href="/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 transition-all active:scale-[0.98]"
          >
            <FileText className="w-4 h-4 text-slate-400" />
            View Policy
          </a>
          <button
            onClick={handleAccept}
            className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-500 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all active:scale-[0.98]"
          >
            Accept & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
