"use client";

import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText } from 'lucide-react';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

interface Props {
  currentUrl?: string | null;
  onFileStaged: (file: File) => void;
  onRemoved: () => void;
}

export function ReceiptUpload({ currentUrl, onFileStaged, onRemoved }: Props) {
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError(null);

    // Client-side size validation
    if (file.size > MAX_FILE_SIZE) {
      setError(`File is too large. Maximum size is 5 MB (current: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      return;
    }

    // Stage the file locally
    setStagedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    onFileStaged(file);
  }, [onFileStaged]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    multiple: false
  });

  const handleRemove = () => {
    setStagedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setError(null);
    onRemoved();
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const hasPreview = stagedFile || currentUrl;
  const isPdf = stagedFile ? stagedFile.type === 'application/pdf' : currentUrl?.includes('.pdf');

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-400">Receipt / Invoice Attachment</label>

      {hasPreview ? (
        <div className="relative rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex items-center gap-4 group">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            {isPdf ? (
              <FileText className="w-6 h-6 text-emerald-400" />
            ) : (
              <img
                src={previewUrl || currentUrl || ''}
                alt="Receipt preview"
                className="w-full h-full object-cover rounded-lg"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">
              {stagedFile?.name || 'Receipt Attached'}
            </p>
            <p className="text-xs text-emerald-400">
              {stagedFile ? 'Staged, ready to save' : 'Existing receipt'}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleRemove(); }}
            className="p-2 hover:bg-slate-700 rounded-full transition-colors opacity-0 group-hover:opacity-100"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer text-center
            ${isDragActive ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-1">
              <Upload className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-300 font-medium">Click or drag receipt to upload</p>
            <p className="text-xs text-slate-500">PNG, JPG, or PDF (up to 5 MB)</p>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
    </div>
  );
}
