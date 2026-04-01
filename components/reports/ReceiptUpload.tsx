"use client";

import React, { useCallback, useState, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, ZoomIn, ZoomOut, Check } from 'lucide-react';
import { getCroppedImg } from '@/lib/crop-utils';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  currentUrl?: string | null
  onFileStaged: (file: File) => void
  onRemoved: () => void
}

export function ReceiptUpload({ currentUrl, onFileStaged, onRemoved }: Props) {
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) return
      setError(null)

      if (file.size > MAX_FILE_SIZE) {
        setError(
          `File too large. Maximum 5 MB (current: ${(file.size / 1024 / 1024).toFixed(2)} MB)`
        )
        return
      }

      // PDFs skip the crop step — stage immediately
      if (file.type === 'application/pdf') {
        const objectUrl = URL.createObjectURL(file)
        setStagedFile(file)
        setPreviewUrl(objectUrl)
        onFileStaged(file)
        return
      }

      // Images — open crop UI
      const objectUrl = URL.createObjectURL(file)
      setCropSrc(objectUrl)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setIsCropping(true)
    },
    [onFileStaged]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    multiple: false,
  })

  const handleCropConfirm = async () => {
    if (!cropSrc || !croppedAreaPixels) return
    setIsCropping(false)
    try {
      const croppedFile = await getCroppedImg(cropSrc, croppedAreaPixels)
      const objectUrl = URL.createObjectURL(croppedFile)
      setStagedFile(croppedFile)
      setPreviewUrl(objectUrl)
      onFileStaged(croppedFile)
    } catch {
      setError('Failed to crop image. Please try again.')
    } finally {
      URL.revokeObjectURL(cropSrc)
      setCropSrc(null)
    }
  }

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setIsCropping(false)
  }

  const handleRemove = () => {
    setStagedFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setError(null)
    onRemoved()
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (cropSrc) URL.revokeObjectURL(cropSrc)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasPreview = stagedFile || currentUrl
  const isPdf = stagedFile
    ? stagedFile.type === 'application/pdf'
    : currentUrl?.includes('.pdf')

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-400">
        Receipt / Invoice Attachment
      </label>

      {/* ── Crop overlay ─────────────────────────────────────────── */}
      {isCropping && cropSrc && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900">
            <p className="text-sm font-semibold text-slate-100">
              Crop &amp; Adjust Receipt
            </p>
            <button
              type="button"
              onClick={handleCropCancel}
              className="p-1.5 rounded-full hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Cropper canvas */}
          <div className="relative flex-1 bg-slate-950">
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_croppedArea, pixels) =>
                setCroppedAreaPixels(pixels)
              }
              style={{
                containerStyle: { background: '#020617' },
                cropAreaStyle: {
                  border: '2px solid #10b981',
                  boxShadow: '0 0 0 9999px rgba(2,6,23,0.75)',
                },
              }}
            />
          </div>

          {/* Zoom + action bar */}
          <div className="px-4 py-4 space-y-3 border-t border-slate-700 bg-slate-900">
            {/* Zoom row */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, parseFloat((z - 0.1).toFixed(2))))}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 transition-colors"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none bg-slate-700 accent-emerald-500 cursor-pointer"
                aria-label="Zoom level"
              />
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, parseFloat((z + 0.1).toFixed(2))))}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 transition-colors"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 text-center">
              Drag to reposition · Scroll or use slider to zoom
            </p>

            {/* Buttons */}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCropCancel}
                className="px-4 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCropConfirm}
                className="px-4 py-2 rounded-lg text-sm bg-emerald-600 text-white hover:bg-emerald-500 flex items-center gap-1.5 transition-colors"
              >
                <Check className="w-4 h-4" />
                Crop &amp; Use
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview card ─────────────────────────────────────────── */}
      {hasPreview ? (
        <div className="relative rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex items-center gap-4 group">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center overflow-hidden">
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
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRemove()
            }}
            className="p-2 hover:bg-slate-700 rounded-full transition-colors opacity-0 group-hover:opacity-100"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      ) : (
        /* ── Drop zone ─────────────────────────────────────────── */
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer text-center
            ${
              isDragActive
                ? 'border-emerald-500 bg-emerald-500/5'
                : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
            }
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mb-1">
              <Upload className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-300 font-medium">
              Click or drag receipt to upload
            </p>
            <p className="text-xs text-slate-500">
              PNG, JPG or PDF — up to 5 MB · Images can be cropped
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 font-medium">{error}</p>
      )}
    </div>
  )
}
