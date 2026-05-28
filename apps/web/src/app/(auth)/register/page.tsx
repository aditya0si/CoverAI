'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Phone, Lock, Loader2, ArrowRight, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/auth';

/**
 * Premium Register Page displaying an elegant glassmorphic form.
 * Implements real-time password strength tracking, 10-digit phone checking,
 * a custom styled role dropdown, loading states, and redirect triggers.
 */
export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Compute real-time password requirements criteria
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const isPasswordValid = hasMinLength && hasUppercase && hasDigit;

  // Validate 10-digit Indian mobile format (starting with 6, 7, 8 or 9)
  const isPhoneValid = /^[6-9]\d{9}$/.test(phone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent submissions if constraints are not met
    if (!isPasswordValid) {
      setError('Please make sure your password meets all safety criteria.');
      return;
    }
    if (!isPhoneValid) {
      setError('Please provide a valid 10-digit Indian phone number (starting with 6, 7, 8, or 9).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post('/auth/register', {
        email,
        phone,
        password,
        full_name: fullName,
        role,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      let errorMsg = 'Registration failed. Please review your inputs and try again.';
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errorMsg = err.response.data.detail
            .map((d: { loc: (string | number)[]; msg: string }) => `${d.loc[d.loc.length - 1] || 'field'}: ${d.msg}`)
            .join(', ');
        } else {
          errorMsg = String(err.response.data.detail);
        }
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 font-sans py-12">
      {/* Background Glowing Ambient Orbs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px] pointer-events-none animate-pulse duration-[6000ms]" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[450px] h-[450px] rounded-full bg-violet-500/10 blur-[150px] pointer-events-none animate-pulse" style={{ animationDuration: '8000ms' }} />

      <div className="relative w-full max-w-md px-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/30 mb-4 transition-transform hover:scale-105 duration-300">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Create account on <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-400">CoverAI</span>
          </h1>
        </div>

        {/* Premium Glassmorphic Card */}
        <div className="backdrop-blur-xl bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-black/50 transition-all duration-300 hover:border-slate-700/80">
          {success ? (
            <div className="text-center py-8 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
                <CheckCircle2 className="w-10 h-10 animate-bounce" />
              </div>
              <h2 className="text-2xl font-bold text-white">Registration Successful!</h2>
              <p className="text-slate-400 text-sm">
                Redirecting you to the sign-in view...
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-6">Register</h2>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm leading-relaxed animate-in fade-in duration-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name Input */}
                <div className="space-y-1">
                  <label htmlFor="fullName" className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Full Name
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                      <User className="w-5 h-5" />
                    </span>
                    <input
                      id="fullName"
                      type="text"
                      required
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                    />
                  </div>
                </div>

                {/* Email Input */}
                <div className="space-y-1">
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
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                    />
                  </div>
                </div>

                {/* Phone Input */}
                <div className="space-y-1">
                  <label htmlFor="phone" className="block text-xs font-medium uppercase tracking-wider text-slate-400 flex justify-between">
                    <span>Indian Phone Number</span>
                    {phone && (
                      <span className={isPhoneValid ? 'text-emerald-400' : 'text-rose-400/90'}>
                        {isPhoneValid ? 'Valid Format' : 'Must be 10-digits'}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                      <Phone className="w-5 h-5" />
                    </span>
                    <input
                      id="phone"
                      type="tel"
                      required
                      placeholder="9999999999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                    />
                  </div>
                </div>

                {/* Role Dropdown Selector */}
                <div className="space-y-1">
                  <label htmlFor="role" className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Account Role
                  </label>
                  <select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200 cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:0.7rem_auto] bg-[right_1.25rem_center] bg-no-repeat pr-10"
                  >
                    <option value="customer">Customer (Policy Holder)</option>
                    <option value="advisor">Insurance Advisor (Agent)</option>
                    <option value="insurer_officer">Insurer Officer (Reviewer)</option>
                  </select>
                </div>

                {/* Password Input & Strength Check */}
                <div className="space-y-2">
                  <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Password
                  </label>
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
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
                    />
                  </div>

                  {/* Real-time Checklist for Password strength */}
                  {password && (
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/85 space-y-2 text-xs animate-in fade-in duration-200">
                      <p className="font-semibold text-slate-400 mb-1">Password criteria checks:</p>
                      <div className="flex items-center gap-2">
                        {hasMinLength ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                        <span className={hasMinLength ? 'text-emerald-400' : 'text-slate-500'}>
                          Minimum 8 characters length
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasUppercase ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                        <span className={hasUppercase ? 'text-emerald-400' : 'text-slate-500'}>
                          At least one uppercase letter
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasDigit ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        )}
                        <span className={hasDigit ? 'text-emerald-400' : 'text-slate-500'}>
                          At least one number digit
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group w-full flex items-center justify-center gap-2 py-3 mt-6 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-blue-800 disabled:to-violet-800 text-white font-medium rounded-xl transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] disabled:scale-100 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Sign Up</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </form>

              {/* Login Redirection Links */}
              <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
                <p className="text-sm text-slate-400">
                  Already have an account?{' '}
                  <Link href="/login" className="font-semibold text-blue-400 hover:text-blue-300 transition-colors">
                    Sign In
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
