"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ScanLine } from "lucide-react";
import { useIndividualUnitScanner } from "@/hooks/useIndividualUnitScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CashCameraCapture } from "@/components/pos/CashCameraCapture";

type Props = {
    /** Active captain / table order document `$id` — required for docket-validated scan-out + stock decrement. */
    activeCaptainOrderId?: string | null;
};

/** Collapsible bottle UID tools — scan-in / scan-out / damaged-barcode text + visual Pinecone fallback. */
export function BottleUnitScanBar({ activeCaptainOrderId }: Props) {
    const [open, setOpen] = useState(false);
    const [uid, setUid] = useState("");
    const [menuId, setMenuId] = useState("");
    const [label, setLabel] = useState("");
    const [damageQuery, setDamageQuery] = useState("");
    const [hits, setHits] = useState<{ score?: number; metadata?: Record<string, unknown> }[]>([]);
    const [registerPhoto, setRegisterPhoto] = useState<string | null>(null);
    const [visualPhoto, setVisualPhoto] = useState<string | null>(null);
    const [pickedUid, setPickedUid] = useState<string | null>(null);
    const { busy, register, scanIn, scanOut, scanOutWithDocket, searchDamaged, searchVisual } =
        useIndividualUnitScanner();

    const captainId = activeCaptainOrderId?.trim() || "";

    return (
        <div className="hidden md:block border-b border-white/5 bg-neutral-900/40">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-center gap-2 py-2 text-xs font-semibold text-neutral-400 hover:text-neutral-200 transition-colors"
            >
                <ScanLine className="w-3.5 h-3.5" />
                Bottle units (scan / register)
                {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {open && (
                <div className="px-4 pb-4 pt-1 max-w-3xl mx-auto space-y-4">
                    {!captainId && (
                        <p className="text-[11px] text-amber-200/90 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                            Open a table order (captain docket) to enable <strong>visual scan-out</strong> with
                            docket match and stock decrement.
                        </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                            placeholder="Unit UID (barcode)"
                            value={uid}
                            onChange={(e) => setUid(e.target.value)}
                            className="bg-neutral-800 border-white/10 text-white text-sm h-10"
                        />
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy || !uid.trim()}
                                className="flex-1"
                                onClick={() => scanIn(uid)}
                            >
                                Scan in
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={busy || !uid.trim()}
                                className="flex-1 bg-amber-600 hover:bg-amber-500"
                                onClick={() => scanOut(uid)}
                            >
                                Scan out
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                        <Input
                            placeholder="Menu item ID (register)"
                            value={menuId}
                            onChange={(e) => setMenuId(e.target.value)}
                            className="bg-neutral-800 border-white/10 text-white text-sm h-10 sm:col-span-1"
                        />
                        <Input
                            placeholder="Label for similarity (optional)"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="bg-neutral-800 border-white/10 text-white text-sm h-10"
                        />
                        <Button
                            type="button"
                            size="sm"
                            disabled={busy || !uid.trim() || !menuId.trim()}
                            className="bg-emerald-700 hover:bg-emerald-600"
                            onClick={() => register(uid, menuId, label || undefined, registerPhoto ?? undefined)}
                        >
                            Register unit
                        </Button>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-3 space-y-2">
                        <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                            Register — damaged barcode (photo → Pinecone)
                        </p>
                        <CashCameraCapture
                            compact
                            capturedDataUrl={registerPhoto}
                            onCapture={setRegisterPhoto}
                            afterCaptureMessage="Photo captured — used for 384-d visual embedding on register."
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                        <Input
                            placeholder="Damaged barcode — describe / partial code"
                            value={damageQuery}
                            onChange={(e) => setDamageQuery(e.target.value)}
                            className="bg-neutral-800 border-white/10 text-white text-sm h-10 flex-1"
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-white/15 shrink-0"
                            disabled={busy || !damageQuery.trim()}
                            onClick={async () => {
                                const r = await searchDamaged(damageQuery);
                                setHits(r.matches);
                                setPickedUid(null);
                            }}
                        >
                            Pinecone (text)
                        </Button>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-neutral-950/50 p-3 space-y-2">
                        <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                            Scan-out — visual fallback (live photo)
                        </p>
                        <CashCameraCapture
                            compact
                            capturedDataUrl={visualPhoto}
                            onCapture={setVisualPhoto}
                            afterCaptureMessage="Photo captured — run visual search to match registered bottles."
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="w-full sm:w-auto"
                            disabled={busy || !visualPhoto}
                            onClick={async () => {
                                if (!visualPhoto) return;
                                const r = await searchVisual(visualPhoto);
                                setHits(r.matches);
                                setPickedUid(null);
                            }}
                        >
                            Search similar (visual)
                        </Button>
                    </div>
                    {hits.length > 0 && (
                        <div className="space-y-2">
                            <ul className="text-[11px] text-neutral-400 space-y-1 max-h-28 overflow-y-auto border border-white/10 rounded-lg p-2 bg-neutral-950/40">
                                {hits.map((h, i) => {
                                    const u = (h.metadata?.unitUid as string) ?? "?";
                                    return (
                                        <li key={i}>
                                            <button
                                                type="button"
                                                className={`font-mono text-left w-full rounded px-1 py-0.5 ${
                                                    pickedUid === u ? "bg-emerald-600/30 text-emerald-100" : "hover:bg-white/5"
                                                }`}
                                                onClick={() => setPickedUid(u)}
                                            >
                                                {u} · score {h.score?.toFixed(4) ?? "—"}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={busy || !pickedUid || !captainId}
                                    className="bg-amber-600 hover:bg-amber-500"
                                    title={!captainId ? "Open a captain order first" : undefined}
                                    onClick={() => pickedUid && scanOutWithDocket(pickedUid, captainId)}
                                >
                                    Scan out vs docket + stock
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-white/15"
                                    disabled={busy || !pickedUid}
                                    onClick={() => pickedUid && scanOut(pickedUid)}
                                >
                                    Scan out (no docket check)
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
