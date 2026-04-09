"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";

type Props = {
    /** Called when staff captures a frame (JPEG data URL). */
    onCapture: (dataUrl: string) => void;
    capturedDataUrl: string | null;
    compact?: boolean;
    /** Shown under the capture buttons when a frame exists (e.g. bottle vs cash copy). */
    afterCaptureMessage?: string;
};

/**
 * Live camera preview with snapshot — primary path for cash verification.
 * Fallback: single-use file input with capture="environment" when getUserMedia fails.
 */
export function CashCameraCapture({
    onCapture,
    capturedDataUrl,
    compact,
    afterCaptureMessage = "Photo captured — will attach to this cash payment.",
}: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);

    const stopStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false,
                });
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                const v = videoRef.current;
                if (v) {
                    v.srcObject = stream;
                    await v.play();
                    setReady(true);
                    setCameraError(null);
                }
            } catch {
                if (!cancelled) {
                    setCameraError("Camera unavailable on this device.");
                    setReady(false);
                }
            }
        })();
        return () => {
            cancelled = true;
            stopStream();
        };
    }, [stopStream]);

    const snapFromVideo = useCallback(() => {
        const v = videoRef.current;
        if (!v || v.videoWidth < 2) return;
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(v, 0, 0);
        const dataUrl = c.toDataURL("image/jpeg", 0.82);
        onCapture(dataUrl);
    }, [onCapture]);

    const onFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            const res = r.result;
            if (typeof res === "string") onCapture(res);
        };
        r.readAsDataURL(f);
        e.target.value = "";
    };

    return (
        <div className={compact ? "space-y-2" : "space-y-3"}>
            <div
                className={`relative overflow-hidden rounded-xl border border-white/15 bg-black ${
                    compact ? "aspect-[4/3] max-h-[160px]" : "aspect-video max-h-[220px]"
                }`}
            >
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                />
                {!ready && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/90 text-neutral-500 text-xs px-4 text-center">
                        Starting camera…
                    </div>
                )}
                {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950/95 p-3 text-center">
                        <p className="text-amber-200/90 text-[11px] leading-snug">{cameraError}</p>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs font-semibold text-emerald-400 underline"
                        >
                            Use camera capture (fallback)
                        </button>
                    </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFallbackFile}
            />

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={snapFromVideo}
                    disabled={!ready}
                    className="inline-flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-xl bg-emerald-600/90 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-40 active:scale-[0.98]"
                >
                    <Camera className="w-4 h-4" />
                    Capture photo
                </button>
                {ready && (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-white/15 px-3 py-2.5 text-xs font-semibold text-neutral-300 hover:bg-white/5 active:scale-[0.98]"
                        title="Only if live camera fails"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retake
                    </button>
                )}
            </div>

            {capturedDataUrl && afterCaptureMessage && (
                <p className="text-[11px] font-medium text-emerald-400/90">{afterCaptureMessage}</p>
            )}
        </div>
    );
}
