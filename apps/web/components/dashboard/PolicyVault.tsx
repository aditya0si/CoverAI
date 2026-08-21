'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { getPolicies, PolicyDetail } from '@/lib/api-client';

const PolicyVault = () => {
  const router = useRouter();

  // Query for policies
  const { data: policies = [], isLoading: policiesLoading } = useQuery({
    queryKey: ['policies'],
    queryFn: () => getPolicies(),
    enabled: true,
  });

  const filteredActivePolicies = policies?.filter((p) => p.status === 'active') || [];

  // Handle redirecting logic
  const handleRedirect = () => {
    router.push('/policies');
  };

  // Helper to render the full policy card
  const PolicyCard = (p: PolicyDetail) => {
    const insurerName = p.insurer_name || "Unknown";
    const policyNumber = p.policy_number || "";
    const vehicleYear = p.vehicle_year || 2024;
    const vehicleMake = p.vehicle_make || "";
    const vehicleRegistration = p.vehicle_registration || "Unknown";
    const sumInsured = p.sum_insured ?? 0;
    const premiumAmount = p.premium_amount ?? 0;
    const endDate = p.end_date ? new Date(p.end_date) : new Date();
    const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    return (
      <div 
        key={p.id}
        className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-[#1B4FD8]/35 hover:bg-slate-900/80 transition-all duration-300 shadow-lg shadow-black/25 flex flex-col justify-between h-[210px] group relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#1B4FD8]/5 rounded-full blur-xl pointer-events-none" />
        
        <div className="space-y-3.5">
          <div className="flex justify-between items-start">
            <div className="space-y-0.5">
              <h4 className="font-extrabold text-sm text-white line-clamp-1 group-hover:text-blue-400 transition-colors">{insurerName}</h4>
              <p className="text-[9px] text-slate-500 font-mono mt-0.5 tracking-wider uppercase">{policyNumber}</p>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[8px] font-black uppercase tracking-widest">
              {p.status}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-[10px] border-t border-slate-850 pt-2.5">
            <div>
              <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Vehicle Details</span>
              <span className="text-slate-300 font-medium truncate block max-w-[120px]">{vehicleYear} {vehicleMake}</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Registration</span>
              <span className="text-slate-350 font-mono block truncate">{vehicleRegistration}</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Sum Insured</span>
              <span className="text-slate-200 font-extrabold block">₹ {sumInsured.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold uppercase tracking-wider block text-[8px]">Premium Amount</span>
              <span className="text-slate-200 font-extrabold block">₹ {premiumAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-850/60">
          <span className={`text-[9px] font-semibold ${daysLeft <= 30 ? 'text-amber-400' : 'text-slate-550'}`}>
            Expires {endDate.toLocaleDateString()} {daysLeft <= 30 && `(${daysLeft}d left)`}
          </span>
          
          <button 
            onClick={() => router.push(`/policies/${p.id}`)}
            className="px-3 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-white rounded-lg text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <span>Review Exclusions</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-900 pb-3">
        <div>
          <h3 className="font-extrabold text-sm text-white uppercase tracking-wider">My Active Coverages</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">A complete visual vault of all active policies, premiums, and coverage limits.</p>
        </div>
        <button 
          onClick={handleRedirect}
          className="text-[11px] font-bold text-blue-400 hover:underline flex items-center gap-1.5"
        >
          <span>View All Policies</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Loading/Empty/Grid Display */}
      {policiesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 bg-slate-900 border border-slate-800 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : filteredActivePolicies.length === 0 ? (
        <div className="border border-slate-850 bg-slate-900/10 rounded-3xl p-10 text-center flex flex-col items-center justify-center max-w-xl mx-auto mt-4">
          <ShieldAlert className="w-10 h-10 text-slate-600 mb-3" />
          <h4 className="font-bold text-white text-sm">No Active Policies</h4>
          <p className="text-[11px] text-slate-450 mt-1 max-w-sm">Upload a vehicle insurance policy PDF to start querying exclusions and filing smart claims.</p>
          <button 
            onClick={handleRedirect}
            className="mt-4 px-4 py-2 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Ingest Policy PDF
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredActivePolicies.map(PolicyCard)}
        </div>
      )}
    </div>
  );
};

export default PolicyVault;