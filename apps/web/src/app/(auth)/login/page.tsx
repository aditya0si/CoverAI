'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { Mail, Lock, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { login, loginWithGoogle } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Google Identity Services type augmentation
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              shape?: string;
              width?: number;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

// ---------------------------------------------------------------------------
// LoginForm — wraps useSearchParams (must be inside <Suspense>)
// ---------------------------------------------------------------------------
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // ------------------------------------------------------------------
  // Google Sign-In callback — called by GSI after user picks account
  // ------------------------------------------------------------------
  const handleGoogleCredential = useCallback(
    async (response: { credential: string }) => {
      setGoogleLoading(true);
      setError(null);
      try {
        await loginWithGoogle(response.credential);
        router.push(redirect);
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const msg =
          err.response?.data?.detail ||
          err.response?.data?.message ||
          'Google sign-in failed. Please try again.';
        setError(msg);
      } finally {
        setGoogleLoading(false);
      }
    },
    [redirect, router]
  );

  // ------------------------------------------------------------------
  // Initialise Google Identity Services once the script is loaded
  // ------------------------------------------------------------------
  const initGSI = useCallback(() => {
    if (!window.google?.accounts?.id || !googleClientId) return;

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    const container = document.getElementById('google-signin-btn');
    if (container) {
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: container.offsetWidth || 360,
      });
    }

    setGsiReady(true);
  }, [googleClientId, handleGoogleCredential]);

  // Re-initialise whenever callback reference changes (only once in practice)
  useEffect(() => {
    if (window.google?.accounts?.id) {
      initGSI();
    }
  }, [initGSI]);

  // ------------------------------------------------------------------
  // Email / password submit handler
  // ------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      router.push(redirect);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Invalid email or password. Please try again.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Error Banner */}
      {error && (
        <div className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm leading-relaxed animate-in fade-in duration-300">
          {error}
        </div>
      )}

      {/* ── Google Sign-In ─────────────────────────────────────────── */}
      {googleClientId ? (
        <div className="mb-5">
          {/* GSI renders its button into this container */}
          <div
            id="google-signin-btn"
            className={`w-full rounded-xl overflow-hidden transition-opacity ${
              googleLoading || !gsiReady ? 'opacity-60 pointer-events-none' : 'opacity-100'
            }`}
            style={{ minHeight: '44px' }}
          />
          {googleLoading && (
            <div className="flex items-center justify-center gap-2 mt-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing in with Google…</span>
            </div>
          )}
          {!gsiReady && !googleLoading && (
            <div className="flex items-center justify-center h-11 rounded-xl bg-slate-800/60 border border-slate-700">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            </div>
          )}
        </div>
      ) : null}

      {/* ── Divider ────────────────────────────────────────────────── */}
      {googleClientId && (
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-slate-600 text-xs font-medium">or continue with email</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
      )}

      {/* ── Email / Password Form ──────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email Field */}
        <div className="space-y-2">
          <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider text-slate-400">
            Email Address
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
              <Mail className="w-5 h-5" />
            </span>
            <input
              id="email"
              type="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wider text-slate-400">
              Password
            </label>
            <a href="#" className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
              <Lock className="w-5 h-5" />
            </span>
            <input
              id="password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || googleLoading}
          className="group w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-blue-800 disabled:to-violet-800 text-white font-medium rounded-xl transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] disabled:scale-100 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>

      {/* GSI Script — loads Google Identity Services library */}
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGSI}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// LoginPage — outer shell + glassmorphic card
// ---------------------------------------------------------------------------
export default function LoginPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 font-sans">
      {/* Background Ambient Orbs */}
      <div
        className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px] pointer-events-none animate-pulse"
        style={{ animationDuration: '6s' }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[450px] h-[450px] rounded-full bg-violet-500/10 blur-[150px] pointer-events-none animate-pulse"
        style={{ animationDuration: '8s' }}
      />

      <div className="relative w-full max-w-md px-6 py-12">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/30 mb-4 transition-transform hover:scale-105 duration-300">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Welcome back to{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-400">
              CoverAI
            </span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            The intelligent copilot for auto insurance
          </p>
        </div>

        {/* Glassmorphic Login Card */}
        <div className="backdrop-blur-xl bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-black/50 transition-all duration-300 hover:border-slate-700/80">
          <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>

          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400 text-sm">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span>Loading secure portal…</span>
              </div>
            }
          >
            <LoginForm />
          </Suspense>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
            <p className="text-sm text-slate-400">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-semibold text-blue-400 hover:text-blue-300 transition-colors">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
