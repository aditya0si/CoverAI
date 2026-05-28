import { Button } from "@coverai/ui";
import { Shield, Cpu, Zap, ChevronRight, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              CoverAI
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#technology" className="hover:text-white transition-colors">Technology</a>
            <a href="#developers" className="hover:text-white transition-colors">Developers</a>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-slate-400 hover:text-white">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button className="bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-600/20">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative pt-24 pb-20 px-6 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto flex flex-col items-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/5 text-blue-400 text-xs font-semibold mb-6 animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Production Ready Monorepo Scaffolded
            </div>
            
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-8 leading-[1.1] bg-gradient-to-r from-white via-slate-100 to-slate-500 bg-clip-text text-transparent">
              Next-Generation <br />
              Vehicle Insurance Powered by AI
            </h1>
            
            <p className="text-slate-400 text-lg md:text-xl mb-10 max-w-2xl">
              An enterprise-grade platform combining FastAPI, Next.js 14, and deep learning claims automation. Secure, hot-reloaded, and ready for deployment.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-sm">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-2 group shadow-lg shadow-blue-500/25">
                Calculate Premium
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 text-slate-300 font-semibold">
                Read API Docs
              </Button>
            </div>
          </div>
        </section>

        {/* Tech Stack Grid */}
        <section id="features" className="py-20 border-t border-slate-900 bg-slate-950/40 relative">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-xl mx-auto mb-16">
              <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Platform Architecture
              </h2>
              <p className="text-slate-400 text-sm">
                Under the hood of the CoverAI enterprise monorepo configuration.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Card 1 */}
              <div className="p-8 rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-sm hover:border-slate-800 transition-all duration-300 group">
                <div className="h-12 w-12 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-500 mb-6 group-hover:scale-110 transition-transform">
                  <Cpu className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-3">FastAPI Backend</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  High-performance API built with Python 3.11, structured around Poetry. Includes SQLAlchemy 2.0 async engine and settings validation.
                </p>
              </div>

              {/* Card 2 */}
              <div className="p-8 rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-sm hover:border-slate-800 transition-all duration-300 group">
                <div className="h-12 w-12 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-500 mb-6 group-hover:scale-110 transition-transform">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-3">Next.js 14 Web Portal</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  State-of-the-art frontend leveraging App Router, strict TypeScript mode, Tailwind CSS, and TanStack React Query.
                </p>
              </div>

              {/* Card 3 */}
              <div className="p-8 rounded-2xl border border-slate-900 bg-slate-900/20 backdrop-blur-sm hover:border-slate-800 transition-all duration-300 group">
                <div className="h-12 w-12 rounded-xl bg-purple-600/10 flex items-center justify-center text-purple-500 mb-6 group-hover:scale-110 transition-transform">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-3">Shared UI & Types</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Centralized Zod validation schemas for claims/policies and standard design tokens ensuring ultimate visual consistency.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Infrastructure Status */}
        <section id="technology" className="py-20 border-t border-slate-900">
          <div className="max-w-7xl mx-auto px-6">
            <div className="rounded-3xl border border-slate-800/60 bg-gradient-to-b from-slate-900/40 to-slate-950/20 p-8 md:p-12 backdrop-blur-md relative overflow-hidden">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h3 className="text-2xl md:text-3xl font-bold mb-6 text-white leading-tight">
                    Scaffolded & Monitored Docker Infrastructure
                  </h3>
                  <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                    A fully-managed `docker-compose.yml` launches persistent PostgreSQL v15 databases, Redis v7 message caches, API containers, and Next.js hot-reload development stacks.
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                      <span className="text-sm font-medium text-slate-300">Hot-reload enabled for frontend & backend</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                      <span className="text-sm font-medium text-slate-300">Postgres health-check checks service readiness</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                      <span className="text-sm font-medium text-slate-300">FastAPI backend loads from root environment configurations</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-6 font-mono text-xs text-slate-400 shadow-2xl relative">
                  <div className="flex items-center gap-2 border-b border-slate-800/60 pb-4 mb-4">
                    <div className="h-3 w-3 rounded-full bg-red-500/80" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                    <div className="h-3 w-3 rounded-full bg-green-500/80" />
                    <span className="text-slate-500 ml-2">docker-compose.yml</span>
                  </div>
                  <pre className="overflow-x-auto text-blue-400">
{`services:
  postgres:
    image: postgres:15-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
  
  redis:
    image: redis:7-alpine
    
  api:
    build: ./apps/api
    volumes:
      - ./apps/api:/app
      
  web:
    build: .
    volumes:
      - .:/app`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <span>&copy; {new Date().getFullYear()} CoverAI. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-slate-400 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-slate-400 transition-colors">Security</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
