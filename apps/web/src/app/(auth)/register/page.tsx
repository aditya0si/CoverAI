'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Phone, Lock, Loader2, ArrowRight, ShieldCheck, Check, X } from 'lucide-react';
import { api } from '@/lib/auth';

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

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const isPasswordValid = hasMinLength && hasUppercase && hasDigit;
  const isPhoneValid = /^[6-9]\d{9}$/.test(phone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordValid) {
      setError('Please ensure your password meets all requirements.');
      return;
    }
    if (!isPhoneValid) {
      setError('Please provide a valid 10-digit Indian mobile number (e.g., 9876543210).');
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
      }, 1800);
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
            Create your CoverAI account
          </h1>
          <p className="text-xs text-[#6E6862] mt-1">
            Get started with AI-assisted vehicle claims and policy management
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-[#F1EDE4] border border-[#E2DDD4] rounded-3xl p-8 sm:p-9 shadow-xs">
          {success ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#EBF7EE] border border-[#C3E8CA] text-[#1E7E34] flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h2 className="font-serif-heading text-xl font-semibold text-[#191919]">
                Account Created Successfully
              </h2>
              <p className="text-xs text-[#6E6862]">Redirecting you to sign in...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-[#FDF2F0] border border-[#F2C0B7] text-[#B83A26] text-xs font-medium leading-relaxed animate-in fade-in duration-200">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name */}
                <div className="space-y-1">
                  <label htmlFor="fullName" className="block text-xs font-medium text-[#191919]">
                    Full Name
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#8C847B]">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      id="fullName"
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label htmlFor="email" className="block text-xs font-medium text-[#191919]">
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#8C847B]">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="jane@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <label htmlFor="phone" className="block text-xs font-medium text-[#191919] flex justify-between">
                    <span>Mobile Number</span>
                    {phone && (
                      <span className={`text-[10px] font-medium ${isPhoneValid ? 'text-[#1E7E34]' : 'text-[#B83A26]'}`}>
                        {isPhoneValid ? 'Valid 10-digit' : '10 digits required'}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#8C847B]">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      id="phone"
                      type="tel"
                      required
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all"
                    />
                  </div>
                </div>

                {/* Role */}
                <div className="space-y-1">
                  <label htmlFor="role" className="block text-xs font-medium text-[#191919]">
                    Account Role
                  </label>
                  <select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all cursor-pointer"
                  >
                    <option value="customer">Policyholder (Customer)</option>
                    <option value="advisor">Insurance Advisor (Agent)</option>
                    <option value="insurer_officer">Claims Officer (Insurer)</option>
                  </select>
                </div>

                {/* Password & Checklist */}
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
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#FAF8F5] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all"
                    />
                  </div>

                  {password && (
                    <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E2DDD4] space-y-1.5 text-[11px] mt-2">
                      <div className="flex items-center gap-2">
                        {hasMinLength ? (
                          <Check className="w-3.5 h-3.5 text-[#1E7E34] shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-[#B83A26] shrink-0" />
                        )}
                        <span className={hasMinLength ? 'text-[#1E7E34]' : 'text-[#8C847B]'}>
                          8+ characters
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasUppercase ? (
                          <Check className="w-3.5 h-3.5 text-[#1E7E34] shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-[#B83A26] shrink-0" />
                        )}
                        <span className={hasUppercase ? 'text-[#1E7E34]' : 'text-[#8C847B]'}>
                          At least one uppercase letter
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasDigit ? (
                          <Check className="w-3.5 h-3.5 text-[#1E7E34] shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-[#B83A26] shrink-0" />
                        )}
                        <span className={hasDigit ? 'text-[#1E7E34]' : 'text-[#8C847B]'}>
                          At least one numeric digit
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-3 bg-[#191919] hover:bg-[#2D2D2D] disabled:bg-[#8C847B] text-[#FAF8F5] text-xs font-semibold rounded-full transition-all shadow-xs group cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-[#E2DDD4] text-center text-xs text-[#6E6862]">
                <span>Already have an account? </span>
                <Link href="/login" className="font-semibold text-[#191919] hover:underline">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
