'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { 
  FileText, 
  MapPin, 
  Calendar as CalendarIcon, 
  ChevronRight, 
  ChevronLeft,
  FilePlus,
  Loader2,
  CheckCircle,
  ArrowRight,
  Cpu
} from 'lucide-react';
import { getPolicies, createClaim, uploadClaimImages, submitClaim, getClaim } from '@/lib/api-client';
import { useAppStore } from '@/lib/store';
import { ImageUploader, UploadingFile } from '@/components/image-uploader';

interface ClaimFormState {
  policy_id: string;
  incident_date: string;
  incident_location: string;
  claim_type: string;
  incident_description: string;
}

export default function NewClaimPage() {
  const router = useRouter();
  const { showToast } = useAppStore();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState('');
  const [submittedClaimId, setSubmittedClaimId] = useState<string | null>(null);
  const [submittedClaimNumber, setSubmittedClaimNumber] = useState<string>('');
  const [aiPrediction, setAiPrediction] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState<ClaimFormState>({
    policy_id: '',
    incident_date: '',
    incident_location: '',
    claim_type: 'own_damage',
    incident_description: '',
  });

  React.useEffect(() => {
    setFormData(prev => ({
      ...prev,
      incident_date: new Date().toISOString().split('T')[0]
    }));
  }, []);

  // Local Image Queue State
  const [localImages, setLocalImages] = useState<UploadingFile[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Fetch active policies for dropdown
  const { data: policies = [], isLoading: policiesLoading } = useQuery({
    queryKey: ['active-policies'],
    queryFn: () => getPolicies(),
  });

  const activePolicies = policies.filter(p => p.status === 'active');

  // Input Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const handleSelectPolicy = (policyId: string) => {
    setFormData(prev => ({ ...prev, policy_id: policyId }));
    setValidationErrors(prev => {
      const copy = { ...prev };
      delete copy.policy_id;
      return copy;
    });
  };

  const handleTypeSelect = (type: string) => {
    setFormData(prev => ({ ...prev, claim_type: type }));
  };

  // Step Navigations with Manual Validation Guard
  const validateStep = (currentStep: number): boolean => {
    const errors: Record<string, string> = {};

    if (currentStep === 1) {
      if (!formData.policy_id) {
        errors.policy_id = "Please select an active policy coverage.";
      }
    } else if (currentStep === 2) {
      if (!formData.incident_date) {
        errors.incident_date = "Incident date is required.";
      } else {
        const selectedDate = new Date(formData.incident_date);
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Allow today full coverage
        if (selectedDate > today) {
          errors.incident_date = "Incident date cannot fall in the future.";
        }
      }
      if (!formData.incident_location.trim()) {
        errors.incident_location = "Incident location is required.";
      } else if (formData.incident_location.trim().length < 2) {
        errors.incident_location = "Location must be at least 2 characters.";
      }
      if (!formData.incident_description.trim()) {
        errors.incident_description = "Description is required.";
      } else if (formData.incident_description.trim().length < 50) {
        errors.incident_description = `Description must be at least 50 characters. Current: ${formData.incident_description.trim().length} characters.`;
      }
    } else if (currentStep === 3) {
      if (localImages.length === 0) {
        errors.images = "You must attach at least 1 image of the vehicle damage to file this claim.";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
  };

  // Final submit sequential call transaction
  const handleFinalSubmit = async () => {
    if (!validateStep(3)) {
      setStep(3);
      return;
    }

    setSubmitting(true);
    setSubmitProgress('Creating claim draft...');

    try {
      // 1. POST /claims/ to create the draft claim
      const claimInput = {
        policy_id: formData.policy_id,
        incident_date: new Date(formData.incident_date).toISOString(),
        incident_location: formData.incident_location,
        incident_description: formData.incident_description,
        claim_type: formData.claim_type,
        estimated_amount: 0.0 // Default to zero or allow estimated damages
      };
      
      const claimRes = await createClaim(claimInput);
      const claimId = claimRes.claim_id;

      // 2. Upload images in batches of 5 to comply with backend constraints
      setSubmitProgress('Uploading damage photos...');
      
      // Update local status during upload
      const imageFiles = localImages.map(img => img.file);
      
      // Split into chunks of 5
      const chunks: File[][] = [];
      for (let i = 0; i < imageFiles.length; i += 5) {
        chunks.push(imageFiles.slice(i, i + 5));
      }

      for (let idx = 0; idx < chunks.length; idx++) {
        setSubmitProgress(`Uploading damage photos (Batch ${idx + 1}/${chunks.length})...`);
        await uploadClaimImages(claimId, chunks[idx]);
      }

      // 3. POST /claims/{id}/submit to submit the claim final
      setSubmitProgress('Submitting claim for AI-Triage audit...');
      await submitClaim(claimId);

      showToast("Claim submitted successfully!", "success");
      setSubmitting(false);
      setSubmittedClaimId(claimId);
      setSubmittedClaimNumber(claimRes.claim_number || claimId);
      setStep(5);

      // Poll for AI prediction for up to 8 seconds
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const claimDetail = await getClaim(claimId);
          if (claimDetail.ai_customer_prediction) {
            setAiPrediction(claimDetail.ai_customer_prediction);
            setAiExplanation(claimDetail.ai_customer_explanation || '');
            clearInterval(pollInterval);
          }
        } catch { /* ignore poll errors */ }
        if (attempts >= 4) clearInterval(pollInterval);
      }, 2000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setSubmitting(false);
      setSubmitProgress('');
      const errMsg = err.response?.data?.detail || err.response?.data?.message || "Failed to submit claim. Check connection and try again.";
      showToast(errMsg, "error");
    }
  };

  const selectedPolicy = policies.find(p => p.id === formData.policy_id);

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
          <FilePlus className="w-6 h-6 text-[#16A34A]" />
          <span>File a Claim</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">Submit your vehicle accident incident information and images to begin claim triage review.</p>
      </div>

      {/* Steps Indicator Progress Stepper */}
      {step <= 4 && (
      <section className="relative flex justify-between items-center w-full px-1 py-2 shrink-0">
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-900 z-0" />
        <div 
          className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 z-0 transition-all duration-300 ease-in-out" 
          style={{ width: `${((step - 1) / 3) * 100}%` }}
        />

        {[
          { label: 'Policy', idx: 1 },
          { label: 'Details', idx: 2 },
          { label: 'Evidence', idx: 3 },
          { label: 'Review', idx: 4 }
        ].map((s) => (
          <div key={s.idx} className="relative z-10 flex flex-col items-center gap-1.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all duration-300 ${
              step >= s.idx 
                ? 'bg-[#1B4FD8] border-[#1B4FD8] text-white shadow-md shadow-[#1B4FD8]/20 scale-105' 
                : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}>
              {step > s.idx ? '✓' : s.idx}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${
              step >= s.idx ? 'text-white' : 'text-slate-500'
            }`}>
              {s.label}
            </span>
          </div>
        ))}
      </section>
      )}

      {/* Main Container Wizard */}
      <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl shadow-black/25">
        
        {/* Step 1: Select Policy */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <h3 className="font-extrabold text-sm text-white">Step 1: Select Policy</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Choose which active vehicle policy this claim is filed against.</p>
            </div>

            {validationErrors.policy_id && (
              <div className="p-3 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-xs leading-normal">
                {validationErrors.policy_id}
              </div>
            )}

            {policiesLoading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-slate-500 text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <span>Loading active policies...</span>
              </div>
            ) : activePolicies.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs border border-slate-850 rounded-2xl bg-slate-950/20">
                No active policies found. You must have an active policy to file a claim.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 pt-2">
                {activePolicies.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPolicy(p.id)}
                    className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                      formData.policy_id === p.id
                        ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 shadow-md shadow-[#1B4FD8]/5'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center shrink-0">
                        <FileText className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-white leading-normal">{p.insurer_name}</h4>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase tracking-wide">
                          {p.vehicle_registration} • {p.vehicle_make} {p.vehicle_model}
                        </p>
                      </div>
                    </div>
                    {formData.policy_id === p.id && (
                      <div className="w-4 h-4 rounded-full bg-[#1B4FD8] flex items-center justify-center text-white text-[10px] font-bold">
                        ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Incident Details */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h3 className="font-extrabold text-sm text-white">Step 2: Incident Details</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Describe what happened, where, and when the accident occurred.</p>
            </div>

            {/* Date field */}
            <div className="space-y-2">
              <label htmlFor="incident_date" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Incident Date</span>
              </label>
              <input
                id="incident_date"
                name="incident_date"
                type="date"
                max={new Date().toISOString().split('T')[0]} // Guard future dates
                required
                value={formData.incident_date}
                onChange={handleInputChange}
                className={`w-full px-4 py-2.5 bg-slate-950 border rounded-xl text-xs text-white focus:outline-none transition-all ${
                  validationErrors.incident_date ? 'border-[#DC2626]' : 'border-slate-800 focus:border-[#1B4FD8]'
                }`}
              />
              {validationErrors.incident_date && (
                <p className="text-[10px] font-semibold text-[#DC2626]">{validationErrors.incident_date}</p>
              )}
            </div>

            {/* Location field */}
            <div className="space-y-2">
              <label htmlFor="incident_location" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Incident Location</span>
              </label>
              <input
                id="incident_location"
                name="incident_location"
                type="text"
                required
                placeholder="e.g. Broad Street intersection, New York"
                value={formData.incident_location}
                onChange={handleInputChange}
                className={`w-full px-4 py-2.5 bg-slate-950 border rounded-xl text-xs text-white placeholder-slate-650 focus:outline-none transition-all ${
                  validationErrors.incident_location ? 'border-[#DC2626]' : 'border-slate-800 focus:border-[#1B4FD8]'
                }`}
              />
              {validationErrors.incident_location && (
                <p className="text-[10px] font-semibold text-[#DC2626]">{validationErrors.incident_location}</p>
              )}
            </div>

            {/* Claim Type radio group */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Claim Classification Type
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'own_damage', label: 'Own Damage' },
                  { id: 'third_party', label: 'Third Party' },
                  { id: 'theft', label: 'Theft' },
                  { id: 'natural_calamity', label: 'Natural Calamity' },
                  { id: 'fire', label: 'Fire' }
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleTypeSelect(type.id)}
                    className={`px-3 py-2 text-left rounded-xl border text-[11px] font-semibold transition-all duration-200 cursor-pointer ${
                      formData.claim_type === type.id
                        ? 'border-[#1B4FD8] bg-[#1B4FD8]/5 text-blue-400'
                        : 'border-slate-800 bg-slate-950/20 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description textbox with min-character validation count */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label htmlFor="incident_description" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Incident Description
                </label>
                <span className={`text-[10px] font-semibold ${
                  formData.incident_description.trim().length >= 50 ? 'text-[#16A34A]' : 'text-slate-500'
                }`}>
                  {formData.incident_description.trim().length} / 50 characters min
                </span>
              </div>
              <textarea
                id="incident_description"
                name="incident_description"
                rows={4}
                required
                placeholder="Please describe exactly what happened. (e.g. I was driving slow under heavy rain, skidded slightly at the turning point, and brushed the front fender against the road barrier...)"
                value={formData.incident_description}
                onChange={handleInputChange}
                className={`w-full px-4 py-2.5 bg-slate-950 border rounded-xl text-xs text-white placeholder-slate-650 focus:outline-none transition-all ${
                  validationErrors.incident_description ? 'border-[#DC2626]' : 'border-slate-800 focus:border-[#1B4FD8]'
                }`}
              />
              {validationErrors.incident_description && (
                <p className="text-[10px] font-semibold text-[#DC2626]">{validationErrors.incident_description}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Attach Evidence */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h3 className="font-extrabold text-sm text-white">Step 3: Upload Damage Photos</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Provide up to 10 photos of the vehicle damage to run vision analysis.</p>
            </div>

            {validationErrors.images && (
              <div className="p-3 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-xs leading-normal">
                {validationErrors.images}
              </div>
            )}

            {/* Reusable dropzone */}
            <ImageUploader 
              files={localImages} 
              onChange={setLocalImages}
              maxImages={10}
            />
          </div>
        )}

        {/* Step 4: Review and Submit Summary */}
        {step === 4 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <h3 className="font-extrabold text-sm text-white">Step 4: Review & File Claim</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Please review your information carefully before submitting to AI assessment.</p>
            </div>

            <div className="space-y-3.5 text-xs">
              
              {/* Policy summary */}
              <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Coverage Policy</span>
                <p className="font-bold text-white leading-normal">{selectedPolicy?.insurer_name}</p>
                <p className="text-[10px] text-slate-500 font-mono">
                  {selectedPolicy?.vehicle_registration} • {selectedPolicy?.vehicle_make} {selectedPolicy?.vehicle_model}
                </p>
              </div>

              {/* Grid block */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Classification</span>
                  <p className="font-semibold text-slate-200 uppercase tracking-wide text-[10px]">
                    {formData.claim_type.replace('_', ' ')}
                  </p>
                </div>
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Incident Date</span>
                  <p className="font-bold text-slate-200">{formData.incident_date}</p>
                </div>
              </div>

              {/* Location */}
              <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Location</span>
                <p className="font-medium text-slate-200">{formData.incident_location}</p>
              </div>

              {/* Description */}
              <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Accident Description</span>
                <p className="text-slate-350 leading-relaxed font-normal whitespace-pre-wrap">{formData.incident_description}</p>
              </div>

              {/* Evidence thumbnails preview */}
              <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Evidence Attachments ({localImages.length})</span>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {localImages.map((img) => (
                    <div key={img.id} className="aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                      {/* eslint-disable-next-line @next/next/no-img-element -- blob: URLs from URL.createObjectURL() are not supported by next/image */}
                      <img src={img.previewUrl} alt="Claim Thumbnail" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Step 5: Success Screen */}
        {step === 5 && (
          <div className="space-y-6 animate-in fade-in duration-300 text-center py-6">
            {/* Success Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center animate-in zoom-in-75 duration-500">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-extrabold text-lg text-white">Claim Submitted Successfully!</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                Your claim has been submitted for AI-powered triage assessment. You&apos;ll receive a prediction shortly.
              </p>
            </div>

            {/* Claim Number */}
            <div className="bg-slate-950/50 border border-slate-850 rounded-xl p-4 inline-block">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 block">Claim Reference</span>
              <span className="text-lg font-black text-white font-mono mt-1 block">{submittedClaimNumber}</span>
            </div>

            {/* AI Prediction (if available) */}
            {aiPrediction ? (
              <div className={`mx-auto max-w-sm rounded-xl border p-4 space-y-2 animate-in slide-in-from-bottom duration-300 ${
                aiPrediction === 'likely_accepted' 
                  ? 'border-emerald-500/25 bg-emerald-500/5' 
                  : aiPrediction === 'possibly_accepted'
                    ? 'border-amber-500/25 bg-amber-500/5'
                    : 'border-rose-500/25 bg-rose-500/5'
              }`}>
                <div className="flex items-center justify-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Prediction</span>
                </div>
                <p className={`text-sm font-bold ${
                  aiPrediction === 'likely_accepted' ? 'text-emerald-400' 
                    : aiPrediction === 'possibly_accepted' ? 'text-amber-400' 
                    : 'text-rose-400'
                }`}>
                  {aiPrediction === 'likely_accepted' ? 'Your claim is likely to be accepted' 
                    : aiPrediction === 'possibly_accepted' ? 'Your claim may be accepted'
                    : 'Your claim is unlikely to be accepted'}
                </p>
                {aiExplanation && (
                  <p className="text-[10px] text-slate-400 leading-relaxed">{aiExplanation}</p>
                )}
                <p className="text-[8px] text-slate-550 pt-1 border-t border-slate-800/40">
                  ⓘ This is an AI-assisted prediction, not a final decision.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-sm rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-center gap-2 animate-pulse">
                <Cpu className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-xs text-slate-400">AI is analyzing your claim...</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                onClick={() => router.push(`/claims/${submittedClaimId}`)}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-bold shadow-lg shadow-[#1B4FD8]/20 transition-colors cursor-pointer"
              >
                <span>View Full Claim Detail</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setStep(1);
                  setFormData({ policy_id: '', incident_date: new Date().toISOString().split('T')[0], incident_location: '', claim_type: 'own_damage', incident_description: '' });
                  setLocalImages([]);
                  setSubmittedClaimId(null);
                  setAiPrediction(null);
                  setAiExplanation('');
                }}
                className="flex items-center justify-center gap-2 px-6 py-2.5 border border-slate-800 hover:border-slate-700 bg-transparent text-slate-350 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <FilePlus className="w-4 h-4" />
                <span>File Another Claim</span>
              </button>
            </div>
          </div>
        )}

        {/* Global Loading submitting overlay */}
        {submitting && (
          <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-6 gap-3.5 text-center">
            <Loader2 className="w-9 h-9 text-blue-500 animate-spin" />
            <div>
              <h4 className="font-bold text-sm text-white">Processing Claim</h4>
              <p className="text-[10px] text-slate-400 mt-1 max-w-xs">{submitProgress}</p>
            </div>
          </div>
        )}

        {/* Form controls navigation footer */}
        {!submitting && step !== 5 && (
          <div className="flex justify-between gap-4 mt-6 pt-5 border-t border-slate-800/80">
            {step > 1 ? (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center justify-center gap-1.5 px-4 py-2 border border-slate-800 hover:border-slate-700 bg-transparent text-slate-350 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div /> // Spacer
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 text-white rounded-xl text-xs font-semibold shadow-lg shadow-[#1B4FD8]/20 transition-colors cursor-pointer"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="flex items-center justify-center gap-1.5 px-6 py-2.5 bg-[#16A34A] hover:bg-[#16A34A]/90 text-white rounded-xl text-xs font-bold shadow-lg shadow-[#16A34A]/20 transition-colors cursor-pointer"
              >
                <span>Submit Claim</span>
              </button>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
