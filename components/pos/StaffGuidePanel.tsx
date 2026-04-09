"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

type StaffGuidePanelProps = {
    /** Persist open/closed in localStorage so returning staff keep their preference */
    storageKey?: string;
    /** Used when nothing in storage */
    defaultOpen?: boolean;
    title: string;
    lines: string[];
    className?: string;
    /** Optional controlled state for advanced flows that auto-collapse */
    open?: boolean;
    onOpenChange?: (next: boolean) => void;
};

export function StaffGuidePanel({
    storageKey,
    defaultOpen = true,
    title,
    lines,
    className = "",
    open: controlledOpen,
    onOpenChange,
}: StaffGuidePanelProps) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const [hydrated, setHydrated] = useState(!storageKey);
    const isControlled = typeof controlledOpen === "boolean";
    const open = isControlled ? Boolean(controlledOpen) : internalOpen;

    useEffect(() => {
        if (!storageKey || typeof window === "undefined") return;
        try {
            const v = localStorage.getItem(storageKey);
            if (v === "collapsed") setInternalOpen(false);
            else if (v === "expanded") setInternalOpen(true);
        } catch {
            /* ignore */
        }
        setHydrated(true);
    }, [storageKey]);

    const toggle = useCallback(() => {
        const next = !open;
        if (storageKey && typeof window !== "undefined") {
            try {
                localStorage.setItem(storageKey, next ? "expanded" : "collapsed");
            } catch {
                /* ignore */
            }
        }
        if (isControlled) {
            onOpenChange?.(next);
            return;
        }
        setInternalOpen(next);
    }, [isControlled, onOpenChange, open, storageKey]);

    if (storageKey && !hydrated) {
        return (
            <div
                className={`rounded-xl border border-sky-500/20 bg-sky-500/[0.05] min-h-[40px] ${className}`}
                aria-hidden
            />
        );
    }

    return (
        <div
            className={`rounded-xl border border-sky-500/25 bg-sky-500/[0.07] text-sky-50/95 ${className}`}
        >
            <button
                type="button"
                onClick={toggle}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left min-h-[44px] rounded-xl hover:bg-sky-500/10 transition-colors"
                aria-expanded={open}
            >
                <Info className="w-4 h-4 shrink-0 text-sky-300" aria-hidden />
                <span className="flex-1 text-xs font-semibold tracking-wide uppercase text-sky-200/95">
                    {title}
                </span>
                {open ? (
                    <ChevronUp className="w-4 h-4 shrink-0 text-sky-400" aria-hidden />
                ) : (
                    <ChevronDown className="w-4 h-4 shrink-0 text-sky-400" aria-hidden />
                )}
            </button>
            {open && (
                <ul className="list-disc marker:text-sky-500 pl-9 pr-3 pb-3 space-y-1.5 text-[11px] md:text-xs leading-relaxed text-sky-100/90">
                    {lines.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
