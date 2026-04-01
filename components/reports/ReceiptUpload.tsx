"use client";

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, Loader2 } from 'lucide-react';

const BUCKET_ID = process.env.NEXT_PUBLIC_BUCKET_ID || 'receipts';

interface Props {
  onUploadComplete: (url: string) => void;
  initialValue?: string | null;
}

export function ReceiptUpload({ onUploadComplete, initialValue }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(initialValue || null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucketId', BUCKET_ID);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Upload failed');
      }

      const { url } = await res.json();
      setPreview(url);
      onUploadComplete(url);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    multiple: false
  });

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-400">Receipt / Invoice Attachment</label>
      
      {preview ? (
        <div className="relative rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex items-center gap-4 group">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            {preview.includes('.pdf') ? (
              <FileText className="w-6 h-6 text-emerald-400" />
            ) : (
              <img src={preview} alt="Receipt preview" className="w-full h-full object-cover rounded-lg" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">Receipt Attached</p>
            <p className="text-xs text-emerald-400">Ready to save</p>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setPreview(null); onUploadComplete(''); }}
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
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm text-slate-400 font-medium">Uploading to Appwrite...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-1">
                <Upload className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm text-slate-300 font-medium">Click or drag receipt to upload</p>
              <p className="text-xs text-slate-500">PNG, JPG, or PDF (Direct to Storage)</p>
            </div>
          )}
        </div>
      )}
      
      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
    </div>
  );
}
