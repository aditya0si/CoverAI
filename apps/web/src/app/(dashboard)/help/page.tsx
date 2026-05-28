'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { 
  HelpCircle, 
  BookOpen, 
  MessageSquare, 
  Phone, 
  Mail, 
  ArrowRight
} from 'lucide-react';

export default function HelpPage() {
  const router = useRouter();

  const faqs = [
    {
      q: "How does the AI claim triage work?",
      a: "When you file a claim with damage photos, our deep learning co-pilot automatically parses details of the incident and runs computer vision checks. It tags damage severity, checks policy clause exclusions, and estimates triage scores for fast-track approvals by claims officers."
    },
    {
      q: "Which file formats are supported for policy upload?",
      a: "We currently support PDF format up to 20MB. The parsing engine uses advanced text extraction to read vehicle information, premiums, sum insured, and policy dates, automatically activating your co-pilot conversation."
    },
    {
      q: "How do I ask questions regarding my policy coverage?",
      a: "Go to 'My Policies' from the navigation bar, click on your policy, and ask the insurance co-pilot. You can query exclusions, coverage amount rules, or ask 'Are windshield cracks covered?' to get instant answers."
    },
    {
      q: "What does the AI Risk Score mean in claim reviews?",
      a: "The Risk Score is evaluated by comparing damage photos against the accident narrative. A high-risk score indicates anomalies or mismatch parameters requiring physical inspection by an assessor, whereas low-risk claims are fast-tracked."
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header Block */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
          <HelpCircle className="w-6 h-6 text-[#1B4FD8]" />
          <span>Support Co-Pilot & Help Centre</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Learn about automatic claims parsing, AI assessment indices, and co-pilot guidelines.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Hand: FAQs (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4.5 h-4.5 text-blue-400" />
            <h2 className="font-extrabold text-sm uppercase tracking-widest text-slate-400">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-3.5">
            {faqs.map((faq, i) => (
              <div 
                key={i} 
                className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 hover:border-slate-700 transition-colors"
              >
                <h3 className="font-bold text-slate-200 text-xs sm:text-sm">{faq.q}</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-normal">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Hand: Support Contact Details (1 col) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4.5 h-4.5 text-[#16A34A]" />
            <h2 className="font-extrabold text-sm uppercase tracking-widest text-slate-400">Support Contacts</h2>
          </div>

          <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            
            <div className="flex items-start gap-3 text-xs leading-normal">
              <Phone className="w-5 h-5 text-[#16A34A] shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-white">Emergency Roadside Assistance</h4>
                <p className="text-slate-400 mt-0.5 font-medium">+1-800-555-ROAD (7623)</p>
                <span className="text-[10px] text-slate-500 mt-1 block font-semibold">Available 24/7/365</span>
              </div>
            </div>

            <div className="h-px bg-slate-800 w-full" />

            <div className="flex items-start gap-3 text-xs leading-normal">
              <Mail className="w-5 h-5 text-[#1B4FD8] shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-white">Claims Escalation Email</h4>
                <p className="text-slate-400 mt-0.5 font-medium">support@coverai.com</p>
                <span className="text-[10px] text-slate-500 mt-1 block font-semibold">Response within 2 hours</span>
              </div>
            </div>

            <div className="h-px bg-slate-800 w-full" />

            <div className="p-3 bg-[#1B4FD8]/5 border border-[#1B4FD8]/15 rounded-xl text-xs space-y-1">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Co-Pilot Guide</span>
              <p className="text-slate-400 leading-normal text-[11px] font-normal">
                To ask specific coverage questions, navigate to your policy and use the chat window. The AI has deep knowledge of your policy clauses.
              </p>
            </div>

            <button 
              onClick={() => router.push('/policies')}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700/80 text-white rounded-xl text-xs font-semibold border border-slate-700/50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Go to My Policies</span>
              <ArrowRight className="w-4 h-4" />
            </button>

          </div>
        </div>

      </div>

    </div>
  );
}
