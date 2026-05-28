import React, { useRef, useState } from 'react';
import { Upload, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@coverai/ui';

export interface UploadingFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'uploading' | 'uploaded' | 'error';
  progress: number;
}

interface ImageUploaderProps {
  files: UploadingFile[];
  onChange: (files: UploadingFile[]) => void;
  onUpload?: (fileObj: UploadingFile) => Promise<void>;
  maxImages?: number;
}

export function ImageUploader({ files, onChange, onUpload, maxImages = 10 }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = async (newFiles: FileList) => {
    const validFiles: UploadingFile[] = [];
    const currentCount = files.length;
    const remainingCount = maxImages - currentCount;

    if (remainingCount <= 0) return;

    // Filter valid files and slice to remaining count
    const filesArray = Array.from(newFiles).slice(0, remainingCount);

    for (const f of filesArray) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > 10 * 1024 * 1024) continue; // 10MB

      const fileObj: UploadingFile = {
        id: Math.random().toString(36).substring(2, 9),
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: onUpload ? 'uploading' : 'uploaded', // if direct callback not supplied, mark uploaded
        progress: 0,
      };
      validFiles.push(fileObj);
    }

    const updated = [...files, ...validFiles];
    onChange(updated);

    if (onUpload) {
      // Trigger upload asynchronously for each new file
      for (const fileObj of validFiles) {
        try {
          await onUpload(fileObj);
        } catch (err) {
          console.error('File upload failed inside uploader', err);
        }
      }
    }
  };

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
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleBrowse = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const removeFile = (id: string) => {
    const fileObj = files.find(f => f.id === id);
    if (fileObj) {
      URL.revokeObjectURL(fileObj.previewUrl);
    }
    onChange(files.filter(f => f.id !== id));
  };

  return (
    <div className="space-y-4">
      {files.length < maxImages && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={handleBrowse}
          className={cn(
            "border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[160px]",
            dragActive
              ? "border-[#1B4FD8] bg-[#1B4FD8]/5"
              : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mb-3 border border-slate-700">
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-white">Drag & drop damage photos here</p>
          <p className="text-xs text-slate-500 mt-1">Accepts JPEG, PNG, and WebP up to 10MB (max {maxImages} files)</p>
          <span className="text-xs text-[#1B4FD8] font-semibold mt-3 hover:underline">
            Or browse files
          </span>
        </div>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {files.map((f) => (
            <div key={f.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URLs from URL.createObjectURL() are not supported by next/image */}
              <img
                src={f.previewUrl}
                alt="Damage preview"
                className="w-full h-full object-cover"
              />
              
              {/* Overlay states */}
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-2 text-center transition-opacity duration-300">
                {f.status === 'uploading' && (
                  <div className="flex flex-col items-center gap-1.5">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    <span className="text-[9px] font-bold text-white tracking-widest">UPLOADING</span>
                  </div>
                )}
                {f.status === 'uploaded' && (
                  <div className="w-7 h-7 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-lg shadow-[#16A34A]/20">
                    <Check className="w-4 h-4" />
                  </div>
                )}
                {f.status === 'error' && (
                  <div className="flex flex-col items-center gap-1 text-[#DC2626]">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-[9px] font-bold tracking-widest">ERROR</span>
                  </div>
                )}
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f.id);
                }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 z-10 transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
