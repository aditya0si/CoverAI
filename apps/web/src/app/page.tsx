import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Brain,
  UploadCloud,
  FileCheck2,
  Lock,
  ArrowRight,
  Eye,
  Check,
  Layers,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#191919] flex flex-col selection:bg-[#191919] selection:text-[#FAF8F5]">
      {/* ── Editorial Sticky Header ────────────────────────────────────────── */}
      <header className="border-b border-[#E2DDD4] bg-[#FAF8F5]/85 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-[#191919] text-[#FAF8F5] flex items-center justify-center shadow-xs">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <span className="font-serif-heading font-bold text-xl tracking-tight text-[#191919]">
              CoverAI
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-[#6E6862]">
            <a href="#features" className="hover:text-[#191919] transition-colors">
              Capabilities
            </a>
            <a href="#how-it-works" className="hover:text-[#191919] transition-colors">
              Workflow
            </a>
            <a href="#trust" className="hover:text-[#191919] transition-colors">
              DPDP & Trust
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-medium text-[#6E6862] hover:text-[#191919] transition-colors px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#191919] hover:bg-[#2D2D2D] text-[#FAF8F5] px-4.5 py-2.5 rounded-full transition-all shadow-xs group"
            >
              <span>Get Started</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Editorial Hero Section ────────────────────────────────────────── */}
        <section className="pt-20 sm:pt-28 pb-20 px-6 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#E2DDD4] bg-[#F1EDE4] text-[#6E6862] text-[11px] font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D2654A]" />
            <span>DPDP Act 2023 Compliant · AI Auto Insurance Intelligence</span>
          </div>

          <h1 className="font-serif-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal text-[#191919] leading-[1.1] tracking-tight mb-8">
            Fast, transparent vehicle claims powered by explainable AI.
          </h1>

          <p className="text-[#6E6862] text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10 font-normal">
            Upload your policy, submit damage evidence with photos, and receive verifiable claim assessments in seconds with real-time clause matching.
          </p>

          <div className="flex flex-col sm:flex-row gap-3.5 justify-center items-center max-w-md mx-auto">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#191919] hover:bg-[#2D2D2D] text-[#FAF8F5] text-xs font-semibold rounded-full shadow-sm transition-all group cursor-pointer"
            >
              <span>Start Your Claim</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#F1EDE4] hover:bg-[#EAE4D8] text-[#191919] border border-[#E2DDD4] text-xs font-semibold rounded-full transition-all cursor-pointer"
            >
              <span>How It Works</span>
            </a>
          </div>

          {/* Minimalist Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-16 pt-8 border-t border-[#E2DDD4]/60 text-xs text-[#8C847B]">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[#191919]" />
              <span>Fernet AES-256 Field Encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#191919]" />
              <span>India DPDP Act 2023 Verified</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#D2654A]" />
              <span>Google Gemini AI Reasoning Engine</span>
            </div>
          </div>
        </section>

        {/* ── Feature Capabilities Grid ──────────────────────────────────────── */}
        <section id="features" className="py-24 border-t border-[#E2DDD4] bg-[#FAF8F5]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-xl mb-16">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#D2654A] block mb-2">
                Capabilities
              </span>
              <h2 className="font-serif-heading text-3xl sm:text-4xl text-[#191919] font-normal tracking-tight">
                Designed for clarity, built for accountability.
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Feature 1 */}
              <div className="p-7 rounded-2xl bg-[#F1EDE4] border border-[#E2DDD4] flex flex-col justify-between hover:border-[#8C847B] transition-all">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919] mb-5">
                    <Brain className="w-5 h-5" />
                  </div>
                  <h3 className="font-serif-heading text-lg font-semibold text-[#191919] mb-2">
                    AI Triage Co-pilot
                  </h3>
                  <p className="text-xs text-[#6E6862] leading-relaxed">
                    Evaluates damage photos, inspects policy exclusions, and drafts risk scores with clear explanations.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#E2DDD4]/60 flex items-center gap-1 text-[11px] font-semibold text-[#191919]">
                  <span>Verifiable reasoning</span>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="p-7 rounded-2xl bg-[#F1EDE4] border border-[#E2DDD4] flex flex-col justify-between hover:border-[#8C847B] transition-all">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919] mb-5">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <h3 className="font-serif-heading text-lg font-semibold text-[#191919] mb-2">
                    Instant Policy Ingestion
                  </h3>
                  <p className="text-xs text-[#6E6862] leading-relaxed">
                    Upload any standard motor policy PDF. Extracts IDV, deductibles, riders, and validity dates in seconds.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#E2DDD4]/60 flex items-center gap-1 text-[11px] font-semibold text-[#191919]">
                  <span>OCR & clause parser</span>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="p-7 rounded-2xl bg-[#F1EDE4] border border-[#E2DDD4] flex flex-col justify-between hover:border-[#8C847B] transition-all">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919] mb-5">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <h3 className="font-serif-heading text-lg font-semibold text-[#191919] mb-2">
                    DPDP Consent Portal
                  </h3>
                  <p className="text-xs text-[#6E6862] leading-relaxed">
                    Granular consent switches, automated JSON data exports, and right-to-erasure with 30-day grace periods.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#E2DDD4]/60 flex items-center gap-1 text-[11px] font-semibold text-[#191919]">
                  <span>Statutory compliance</span>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="p-7 rounded-2xl bg-[#F1EDE4] border border-[#E2DDD4] flex flex-col justify-between hover:border-[#8C847B] transition-all">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919] mb-5">
                    <Eye className="w-5 h-5" />
                  </div>
                  <h3 className="font-serif-heading text-lg font-semibold text-[#191919] mb-2">
                    Live Claim Audit Trail
                  </h3>
                  <p className="text-xs text-[#6E6862] leading-relaxed">
                    Full transparent status progression with immutable audit records from submission to surveyor settlement.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#E2DDD4]/60 flex items-center gap-1 text-[11px] font-semibold text-[#191919]">
                  <span>7-year IRDAI retention</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Workflow Steps ────────────────────────────────────────────────── */}
        <section id="how-it-works" className="py-24 border-t border-[#E2DDD4] bg-[#F7F4EE]">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#D2654A] block mb-2">
                Workflow
              </span>
              <h2 className="font-serif-heading text-3xl sm:text-4xl text-[#191919] font-normal tracking-tight">
                Three steps from policy to payout.
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8 relative">
              {/* Step 1 */}
              <div className="bg-[#FAF8F5] border border-[#E2DDD4] rounded-2xl p-7 flex flex-col justify-between">
                <div>
                  <span className="font-serif-heading text-3xl font-light text-[#8C847B] block mb-4">
                    01
                  </span>
                  <h3 className="font-serif-heading text-lg font-semibold text-[#191919] mb-2">
                    Ingest Policy
                  </h3>
                  <p className="text-xs text-[#6E6862] leading-relaxed">
                    Upload your comprehensive or third-party vehicle insurance document. Our extractor parses terms and exclusions.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-[#FAF8F5] border border-[#E2DDD4] rounded-2xl p-7 flex flex-col justify-between">
                <div>
                  <span className="font-serif-heading text-3xl font-light text-[#8C847B] block mb-4">
                    02
                  </span>
                  <h3 className="font-serif-heading text-lg font-semibold text-[#191919] mb-2">
                    Submit Evidence
                  </h3>
                  <p className="text-xs text-[#6E6862] leading-relaxed">
                    Capture vehicle damage photos, log the incident time and location, and submit via our streamlined claim wizard.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-[#FAF8F5] border border-[#E2DDD4] rounded-2xl p-7 flex flex-col justify-between">
                <div>
                  <span className="font-serif-heading text-3xl font-light text-[#8C847B] block mb-4">
                    03
                  </span>
                  <h3 className="font-serif-heading text-lg font-semibold text-[#191919] mb-2">
                    Explainable AI Review
                  </h3>
                  <p className="text-xs text-[#6E6862] leading-relaxed">
                    Get instant predictions, clause citations, and estimated repair amounts before surveyor assignment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Dark Contrast Trust Section (Anthropic Style) ────────────────── */}
        <section id="trust" className="py-24 bg-[#191919] text-[#FAF8F5]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#D2654A] block mb-3">
                  Data Governance
                </span>
                <h2 className="font-serif-heading text-3xl sm:text-4xl text-[#FAF8F5] font-normal tracking-tight mb-6">
                  Engineered around Indian data privacy law.
                </h2>
                <p className="text-[#A69F96] text-sm leading-relaxed mb-8">
                  CoverAI implements the Digital Personal Data Protection (DPDP) Act 2023 from first principles. Your sensitive personal and vehicular data remains under your absolute control.
                </p>

                <div className="space-y-3.5 text-xs text-[#D8D2C7]">
                  {[
                    'Granular consent revocation for AI processing & data sharing',
                    'Right to Data Portability: export your complete dossier as JSON',
                    'Right to Erasure with 30-day pending withdrawal grace period',
                    'Fernet symmetric encryption for all PII fields at rest',
                    'Immutable audit records maintained in compliance with IRDAI standards',
                  ].map((text) => (
                    <div key={text} className="flex items-start gap-3">
                      <div className="w-4 h-4 rounded-full bg-[#FAF8F5]/10 text-[#FAF8F5] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Minimalist Trust Card */}
              <div className="bg-[#242424] border border-[#333333] rounded-3xl p-8 sm:p-10">
                <div className="flex items-center gap-3 mb-6 pb-6 border-b border-[#333333]">
                  <div className="w-10 h-10 rounded-xl bg-[#FAF8F5] text-[#191919] flex items-center justify-center font-serif-heading font-bold text-lg">
                    §
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#FAF8F5]">DPDP Act 2023 Standard</h4>
                    <p className="text-[11px] text-[#A69F96]">India Regulatory Compliance Stack</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs text-[#A69F96]">
                  <div className="flex justify-between pb-2.5 border-b border-[#333333]">
                    <span>Consent Framework</span>
                    <span className="text-[#FAF8F5] font-mono font-medium">Notice & Choice §6</span>
                  </div>
                  <div className="flex justify-between pb-2.5 border-b border-[#333333]">
                    <span>Data Retention</span>
                    <span className="text-[#FAF8F5] font-mono font-medium">7-Year Regulatory</span>
                  </div>
                  <div className="flex justify-between pb-2.5 border-b border-[#333333]">
                    <span>Cryptographic Cipher</span>
                    <span className="text-[#FAF8F5] font-mono font-medium">AES-128-CBC + HMAC</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Audit Log Integrity</span>
                    <span className="text-[#FAF8F5] font-mono font-medium">Append-only</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Bottom CTA ───────────────────────────────────────────────────── */}
        <section className="py-24 border-t border-[#E2DDD4] text-center px-6">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-serif-heading text-3xl sm:text-4xl text-[#191919] font-normal tracking-tight mb-4">
              Experience the future of auto insurance claims.
            </h2>
            <p className="text-[#6E6862] text-sm leading-relaxed mb-8 max-w-lg mx-auto">
              Create an account in minutes or explore the platform as a customer, insurance advisor, or claims officer.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#191919] hover:bg-[#2D2D2D] text-[#FAF8F5] text-xs font-semibold rounded-full shadow-sm transition-all group"
            >
              <span>Get Started Now</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </section>
      </main>

      {/* ── Minimalist Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-[#E2DDD4] py-8 bg-[#FAF8F5] text-xs text-[#8C847B]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-serif-heading font-bold text-[#191919]">CoverAI</span>
            <span>· Intelligent Motor Claims Platform</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy-policy" className="hover:text-[#191919] transition-colors">
              Privacy Policy
            </Link>
            <a href="#trust" className="hover:text-[#191919] transition-colors">
              DPDP Compliance
            </a>
            <a href="#features" className="hover:text-[#191919] transition-colors">
              Documentation
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
