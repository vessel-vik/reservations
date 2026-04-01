"use client";

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2 } from 'lucide-react';

const MENU_IMAGES_BUCKET_ID = process.env.NEXT_PUBLIC_MENU_IMAGES_BUCKET_ID || process.env.NEXT_PUBLIC_BUCKET_ID || 'menu_images';

interface Props {
  currentUrl?: string | null;
  onUploadComplete: (url: string) => void;
}

export function ImageUploadField({ currentUrl, onUploadComplete }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucketId', MENU_IMAGES_BUCKET_ID);

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
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxFiles: 1,
  });

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-400">Item Image</label>

      {preview ? (
        <div className="relative group w-full h-48 rounded-xl overflow-hidden border border-slate-700">
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          <button
            onClick={() => { setPreview(null); onUploadComplete(''); }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={`w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all
            ${isDragActive ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'}
          `}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                <Upload className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm text-slate-300">Click or drag to upload image</p>
              <p className="text-xs text-slate-500">PNG, JPG, WEBP · Direct to Appwrite Storage</p>
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
