'use client';

import React, { useRef, useState } from 'react';
import { X, Upload, FileText, Loader2 } from 'lucide-react';
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
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (selected.type === "application/pdf" || selected.name.toLowerCase().endsWith('.pdf')) {
        setFile(selected);
        setError(null);
      } else {
        setError("Only PDF files are supported.");
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
      
      showToast("Policy uploaded successfully", "success");
      
      // Reset Form State
      setFile(null);
      setVehicleReg('');
      setInsurerName('');
      setProgress(0);
      setUploading(false);
      
      onSuccess();
      onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setUploading(false);
      setProgress(0);
      const errMsg = err.response?.data?.detail || err.response?.data?.message || "Failed to upload policy. Check connection and try again.";
      setError(errMsg);
    }
  };

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          disabled={uploading}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/40 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <h3 className="text-lg font-bold text-white">Upload Insurance Policy</h3>
          <p className="text-xs text-slate-400 mt-1">Provide your policy PDF and metadata to index with CoverAI co-pilot.</p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-xs leading-normal animate-in fade-in duration-300">
            {error}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          
          {/* Dropzone for PDF */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Policy PDF Document
            </label>
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerFileSelect}
              className={cn(
                "border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px]",
                dragActive
                  ? "border-[#1B4FD8] bg-[#1B4FD8]/5"
                  : "border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-950/80"
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
                <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl max-w-full">
                  <FileText className="w-8 h-8 text-blue-400 shrink-0" />
                  <div className="text-left overflow-hidden">
                    <p className="text-xs font-semibold text-white truncate max-w-[200px]">{file.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    disabled={uploading}
                    className="p-1 text-slate-500 hover:text-white transition-colors ml-2"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 mb-2 border border-slate-700">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-white">Drag & drop your policy PDF here</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">PDF format only, up to 20MB</p>
                  <span className="text-[10px] text-[#1B4FD8] font-bold mt-2 hover:underline">
                    Or select file
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Insurer Name Field */}
          <div className="space-y-2">
            <label htmlFor="insurerName" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Insurer Name
            </label>
            <input
              id="insurerName"
              type="text"
              required
              disabled={uploading}
              placeholder="e.g. Progressive, State Farm"
              value={insurerName}
              onChange={(e) => setInsurerName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#1B4FD8] transition-all"
            />
          </div>

          {/* Vehicle Registration Field */}
          <div className="space-y-2">
            <label htmlFor="vehicleReg" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Vehicle Registration Number
            </label>
            <input
              id="vehicleReg"
              type="text"
              required
              disabled={uploading}
              placeholder="e.g. MH12AB1234, CA90210"
              value={vehicleReg}
              onChange={(e) => setVehicleReg(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#1B4FD8] transition-all"
            />
          </div>

          {/* Upload Progress Bar */}
          {uploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Ingesting Policy & AI Parsing</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                <div 
                  className="h-full bg-[#1B4FD8] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-800/60">
            <button
              type="button"
              disabled={uploading}
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-800 hover:border-slate-700 bg-transparent text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !vehicleReg || !insurerName}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1B4FD8] hover:bg-[#1B4FD8]/90 disabled:bg-[#1B4FD8]/40 disabled:text-white/50 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-lg shadow-[#1B4FD8]/20"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>Submit Document</span>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
