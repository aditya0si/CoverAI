'use client';

import React from 'react';
import { ShieldCheck, Mail, Phone, Calendar, UserCheck, Trash2, ArrowRight } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-16 px-4 sm:px-6 lg:px-8">
      {/* Decorative top blurred glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[350px] bg-gradient-to-b from-blue-500/5 to-transparent blur-3xl pointer-events-none" />

      <div className="max-w-4xl w-full flex flex-col gap-12 relative z-10">
        
        {/* Header Section */}
        <div className="text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500/10 to-blue-500/10 border border-slate-800 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Privacy Policy
          </h1>
          <p className="text-slate-400 max-w-lg text-sm leading-relaxed">
            Effective Date: May 27, 2026. This policy details how CoverAI processes your personal data 
            in strict alignment with the <strong>Digital Personal Data Protection (DPDP) Act, 2023 (India)</strong>.
          </p>
        </div>

        {/* Content Card Grid */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-8 sm:p-12 backdrop-blur-2xl shadow-2xl flex flex-col gap-10">
          
          {/* Section 1 */}
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
              1. Personal Data We Collect
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Under Section 5 of the DPDP Act 2023, we collect only the personal details necessary to perform our digital policy analysis and auto claim triage services:
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300 mt-2 px-1">
              <li className="bg-slate-900/60 border border-slate-850 rounded-xl p-3 flex flex-col gap-1">
                <strong className="text-slate-100">Identity Details</strong>
                <span>Full Name and Email Address.</span>
              </li>
              <li className="bg-slate-900/60 border border-slate-850 rounded-xl p-3 flex flex-col gap-1">
                <strong className="text-slate-100">Contact Information</strong>
                <span>Phone number (stored strictly encrypted at rest).</span>
              </li>
              <li className="bg-slate-900/60 border border-slate-850 rounded-xl p-3 flex flex-col gap-1">
                <strong className="text-slate-100">Vehicle Credentials</strong>
                <span>Registration number (MH-xx-xx-xxxx) and model/year (stored encrypted).</span>
              </li>
              <li className="bg-slate-900/60 border border-slate-850 rounded-xl p-3 flex flex-col gap-1">
                <strong className="text-slate-100">Claim Media Files</strong>
                <span>Images and photos uploaded for claim surveys.</span>
              </li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
              2. Explicit Purpose of Processing
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              We process your data for the following specific purposes and none other:
            </p>
            <div className="flex flex-col gap-2.5 text-xs text-slate-300 px-1">
              <div className="flex items-start gap-3 bg-slate-900/30 p-3 rounded-xl">
                <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>To extract clauses and verify coverages from your uploaded policy PDF documents.</span>
              </div>
              <div className="flex items-start gap-3 bg-slate-900/30 p-3 rounded-xl">
                <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>To run AI claim triage scoring and visual damage tags using secure image vision models.</span>
              </div>
              <div className="flex items-start gap-3 bg-slate-900/30 p-3 rounded-xl">
                <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>To provide personalized guidance through conversation copilot support.</span>
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
              3. Data Minimization and Retention Policy
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              In accordance with Section 8 of the DPDP Act 2023, data is purged when its commercial and regulatory purpose is completed:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300 mt-2 px-1">
              <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 flex gap-3">
                <Calendar className="w-5 h-5 text-blue-400 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-200">Expired Policies</span>
                  <span>Extracted policy text is permanently deleted 2 years after policy expiration.</span>
                </div>
              </div>
              <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 flex gap-3">
                <Calendar className="w-5 h-5 text-blue-400 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-200">Chat History</span>
                  <span>Conversation messages are fully deleted after 1 year. We preserve only the message count for analytics.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4 */}
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-1.5 h-6 bg-emerald-500 rounded-full" />
              4. Your DPDP Legal Rights
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Under Sections 11, 12, and 13 of the DPDP Act 2023, you hold the following absolute rights over your personal data which you can trigger in your User Console:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300 mt-2 px-1">
              <div className="bg-slate-900/40 border border-slate-850/60 rounded-xl p-4 flex flex-col gap-2">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-slate-100">Right to Withdraw Consent</span>
                <span>Withdraw AI processing consent at any time. Triage and image analysis will immediately stop for future uploads.</span>
              </div>
              <div className="bg-slate-900/40 border border-slate-850/60 rounded-xl p-4 flex flex-col gap-2">
                <ArrowRight className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-slate-100">Right to Data Portability</span>
                <span>Request a complete, secure JSON export of all your policies, claims, chats, and consent history.</span>
              </div>
              <div className="bg-slate-900/40 border border-slate-850/60 rounded-xl p-4 flex flex-col gap-2">
                <Trash2 className="w-5 h-5 text-rose-400" />
                <span className="font-semibold text-slate-100">Right to Erasure</span>
                <span>Request complete account deletion. Data is anonymized and claim images are deleted after a 30-day grace period.</span>
              </div>
            </div>
          </div>

          {/* Section 5 */}
          <div className="flex flex-col gap-4 border-t border-slate-800/60 pt-8 mt-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full" />
              5. Grievance Redressal and Contact
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              If you have any questions about data processing, wish to file a complaint, or seek to escalate a privacy concern, please contact our designated **Data Protection Officer / Grievance Redressal Officer**:
            </p>
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-xs text-slate-300 flex flex-col gap-3 max-w-md">
              <span className="font-bold text-slate-100 text-sm">Grievance Officer Contact Details</span>
              <div className="flex items-center gap-3">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Name: Mr. Anand Iyer, Director of Security Operations</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Email: <a href="mailto:privacy@coverai.com" className="text-blue-400 hover:underline">privacy@coverai.com</a></span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Phone: +91 22 6698 1204</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 mt-4">
          &copy; {new Date().getFullYear()} CoverAI Private Limited. All rights reserved. Registered under the Companies Act, 2013 (India).
        </div>

      </div>
    </div>
  );
}
