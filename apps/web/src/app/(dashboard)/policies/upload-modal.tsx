'use client';

import React, { useRef, useState } from 'react';
import { X, Upload, FileText, Loader2, ArrowRight } from 'lucide-react';
import { uploadPolicy } from '@/lib/api-client';
import { useAppStore } from '@/lib/store';
import { cn } from '@coverai/ui';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const { showToast } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [vehicleReg, setVehicleReg] = useState('');
  const [insurerName, setInsurerName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf')) {
        setFile(selected);
        setError(null);
      } else {
        setError('Only PDF files are supported.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !vehicleReg || !insurerName) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      await uploadPolicy(
        file,
        vehicleReg,
        insurerName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (progressEvent: any) => {
          const total = progressEvent.total || 0;
          if (total > 0) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / total);
            setProgress(percentCompleted);
          }
        }
      );

      showToast('Policy uploaded successfully', 'success');

      setFile(null);
      setVehicleReg('');
      setInsurerName('');
      setProgress(0);
      setUploading(false);

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setUploading(false);
      setProgress(0);
      const e = err as { response?: { data?: { detail?: string; message?: string } } };
      const errMsg =
        e.response?.data?.detail ||
        e.response?.data?.message ||
        'Failed to upload policy. Please verify connection and try again.';
      setError(errMsg);
    }
  };

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-[#191919]/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#FAF8F5] border border-[#E2DDD4] rounded-3xl p-7 shadow-xl animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={uploading}
          className="absolute top-5 right-5 p-1.5 text-[#8C847B] hover:text-[#191919] rounded-full hover:bg-[#F1EDE4] transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <h3 className="font-serif-heading text-xl font-normal text-[#191919]">
            Upload Insurance Policy
          </h3>
          <p className="text-xs text-[#6E6862] mt-1">
            Provide your vehicle policy PDF for AI clause extraction and coverage indexing.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-[#FDF2F0] border border-[#F2C0B7] text-[#B83A26] text-xs font-medium leading-relaxed animate-in fade-in duration-200">
            {error}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Dropzone for PDF */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#191919]">
              Policy PDF Document
            </label>
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileSelect}
              className={cn(
                'border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px]',
                dragActive
                  ? 'border-[#191919] bg-[#F1EDE4]'
                  : 'border-[#E2DDD4] bg-[#F3EFE6] hover:border-[#8C847B]'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={handleFileChange}
              />

              {file ? (
                <div className="flex items-center gap-3 bg-[#FAF8F5] border border-[#E2DDD4] p-3 rounded-xl max-w-full">
                  <FileText className="w-7 h-7 text-[#D2654A] shrink-0" />
                  <div className="text-left overflow-hidden">
                    <p className="text-xs font-semibold text-[#191919] truncate max-w-[200px]">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-[#8C847B] mt-0.5">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    disabled={uploading}
                    className="p-1 text-[#8C847B] hover:text-[#191919] transition-colors ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-9 h-9 rounded-xl bg-[#FAF8F5] border border-[#E2DDD4] flex items-center justify-center text-[#191919] mb-2">
                    <Upload className="w-4.5 h-4.5" />
                  </div>
                  <p className="text-xs font-semibold text-[#191919]">Drag & drop policy PDF here</p>
                  <p className="text-[10px] text-[#8C847B] mt-0.5">PDF format only, up to 20MB</p>
                  <span className="text-[10px] text-[#191919] font-bold mt-1.5 underline">
                    Or select file
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Insurer Name */}
          <div className="space-y-1">
            <label htmlFor="insurerName" className="block text-xs font-medium text-[#191919]">
              Insurer Name
            </label>
            <input
              id="insurerName"
              type="text"
              required
              disabled={uploading}
              placeholder="e.g. HDFC ERGO, ICICI Lombard, Tata AIG"
              value={insurerName}
              onChange={(e) => setInsurerName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F3EFE6] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all"
            />
          </div>

          {/* Vehicle Registration */}
          <div className="space-y-1">
            <label htmlFor="vehicleReg" className="block text-xs font-medium text-[#191919]">
              Vehicle Registration Number
            </label>
            <input
              id="vehicleReg"
              type="text"
              required
              disabled={uploading}
              placeholder="e.g. DL01AB1234, MH02CD5678"
              value={vehicleReg}
              onChange={(e) => setVehicleReg(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F3EFE6] border border-[#E2DDD4] rounded-xl text-xs text-[#191919] placeholder:text-[#8C847B] focus:outline-none focus:border-[#191919] focus:ring-1 focus:ring-[#191919] transition-all font-mono"
            />
          </div>

          {/* Progress */}
          {uploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-[10px] font-semibold text-[#8C847B]">
                <span>Ingesting Policy & AI OCR Parsing</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-[#EAE4D8] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#191919] rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-[#E2DDD4]">
            <button
              type="button"
              disabled={uploading}
              onClick={onClose}
              className="flex-1 py-2.5 border border-[#E2DDD4] hover:bg-[#F1EDE4] text-[#191919] rounded-full text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !vehicleReg || !insurerName}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#191919] hover:bg-[#2D2D2D] disabled:bg-[#8C847B] text-[#FAF8F5] rounded-full text-xs font-semibold transition-all cursor-pointer shadow-xs group"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Submit Document</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
