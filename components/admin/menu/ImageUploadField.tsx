"use client";

import React, { useCallback, useState, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { useDropzone } from 'react-dropzone';
import { Upload, X, ZoomIn, ZoomOut, Check } from 'lucide-react';
import { getCroppedImg } from '@/lib/crop-utils';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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

export function ImageUploadField({ currentUrl, onFileStaged, onRemoved }: Props) {
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
          `File too large. Maximum 10 MB (current: ${(file.size / 1024 / 1024).toFixed(2)} MB)`
        )
        return
      }

      // Open crop UI
      const objectUrl = URL.createObjectURL(file)
      setCropSrc(objectUrl)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setIsCropping(true)
    },
    []
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
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

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-400">Item Image</label>

      {/* ── Crop overlay ─────────────────────────────────────────── */}
      {isCropping && cropSrc && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-900">
            <p className="text-sm font-semibold text-slate-100">
              Crop &amp; Adjust Image
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
              aspect={4 / 3}
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
        <div className="relative group w-full h-48 rounded-xl overflow-hidden border border-slate-700">
          <img
            src={previewUrl || currentUrl || ''}
            alt="Preview"
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-900/80 text-emerald-400">
              {stagedFile ? 'Staged, ready to save' : 'Current image'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleRemove()
              }}
              className="p-1.5 rounded-full bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* ── Drop zone ─────────────────────────────────────────── */
        <div
          {...getRootProps()}
          className={`w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all
            ${isDragActive ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'}
          `}
        >
          <input {...getInputProps()} />
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
            <Upload className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm text-slate-300">Click or drag to upload image</p>
          <p className="text-xs text-slate-500">PNG, JPG, WEBP · up to 10 MB · Will be cropped</p>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
