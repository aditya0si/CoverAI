'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { Mail, Lock, Loader2, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { login, loginWithGoogle } from '@/lib/auth';

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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

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
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: container.offsetWidth || 360,
      });
    }

    setGsiReady(true);
  }, [googleClientId, handleGoogleCredential]);

  useEffect(() => {
    if (window.google?.accounts?.id) {
      initGSI();
    }
  }, [initGSI]);

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
        'Invalid email or password. Please verify your credentials.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Error Alert */}
      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-[#FDF2F0] border border-[#F2C0B7] text-[#B83A26] text-xs font-medium leading-relaxed animate-in fade-in duration-200">
          {error}
        </div>
      )}

      {/* Google Sign In */}
      {googleClientId ? (
        <div className="mb-5">
          <div
            id="google-signin-btn"
            className={`w-full rounded-full overflow-hidden transition-opacity ${
              googleLoading || !gsiReady ? 'opacity-60 pointer-events-none' : 'opacity-100'
            }`}
            style={{ minHeight: '44px' }}
          />
          {googleLoading && (
            <div className="flex items-center justify-center gap-2 mt-2 text-[#6E6862] text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Authenticating with Google...</span>
            </div>
          )}
        </div>
      ) : null}

      {googleClientId && (
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-[#E2DDD4]" />
          <span className="text-[#8C847B] text-[11px] font-medium uppercase tracking-wider">
            or with email
          </span>
          <div className="flex-1 h-px bg-[#E2DDD4]" />
        </div>
      )}

      {/* Email / Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-medium text-[#191919]">
            Email address
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#8C847B]">
              <Mail className="w-4 h-4" />
            </span>
            <input
              id="email"
              type="email"
              required
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-medium text-[#191919]">
            Password
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#8C847B]">
              <Lock className="w-4 h-4" />
            </span>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#8C847B] hover:text-[#191919] transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full mt-2 flex items-center justify-center gap-2 py-3 bg-[#191919] hover:bg-[#2D2D2D] disabled:bg-[#8C847B] text-[#FAF8F5] text-xs font-semibold rounded-full transition-all shadow-xs group cursor-pointer"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </button>
      </form>

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

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#191919] flex items-center justify-center px-4 py-12 selection:bg-[#191919] selection:text-[#FAF8F5]">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-4 group">
            <div className="h-9 w-9 rounded-xl bg-[#191919] text-[#FAF8F5] flex items-center justify-center shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="font-serif-heading font-bold text-2xl tracking-tight text-[#191919]">
              CoverAI
            </span>
          </Link>
          <h1 className="font-serif-heading text-2xl font-normal text-[#191919] tracking-tight">
            Sign in to your account
          </h1>
          <p className="text-xs text-[#6E6862] mt-1">
            Access your policies, active claims, and AI advisor
          </p>
        </div>

        {/* Form Container Card */}
        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-3xl p-8 sm:p-9 shadow-xs">
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-xs text-[#6E6862]">
                <Loader2 className="w-5 h-5 animate-spin text-[#191919]" />
                <span>Loading secure gateway...</span>
              </div>
            }
          >
            <LoginForm />
          </Suspense>

          {/* Footer Redirection */}
          <div className="mt-6 pt-5 border-t border-[#E2DDD4] text-center text-xs text-[#6E6862]">
            <span>Don&apos;t have an account yet? </span>
            <Link href="/register" className="font-semibold text-[#191919] hover:underline">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
