"use client";

import { useEffect, useMemo, useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, LogOut, ShieldCheck } from "lucide-react";
import type { ActiveWaiterSession } from "@/lib/pos-waiter-session";

type StaffOption = {
    waiterUserId: string;
    waiterName: string;
};

type Props = {
    open: boolean;
    session: ActiveWaiterSession | null;
    onVerified: (session: ActiveWaiterSession) => void;
    onLock: () => void;
};

export function CentralWaiterPinGate({ open, session, onVerified, onLock }: Props) {
    const [pin, setPin] = useState("");
    const [options, setOptions] = useState<StaffOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [busyOptions, setBusyOptions] = useState(false);

    useEffect(() => {
        if (!open) return;
        setBusyOptions(true);
        fetch("/api/pos/staff-passkey/options", { cache: "no-store" })
            .then(async (res) => {
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.error || "Could not load waiters");
                return Array.isArray(json.options) ? (json.options as StaffOption[]) : [];
            })
            .then((next) => setOptions(next))
            .catch((e) => setError(e instanceof Error ? e.message : "Could not load staff passkeys"))
            .finally(() => setBusyOptions(false));
    }, [open]);

    useEffect(() => {
        if (!open) {
            setPin("");
            setError("");
        }
    }, [open]);

    const canSubmit = useMemo(() => pin.trim().length >= 4 && !loading, [pin, loading]);

    const verify = async () => {
        if (!canSubmit) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/pos/staff-passkey/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error || "Invalid passkey");
            const now = new Date().toISOString();
            onVerified({
                sessionId: crypto.randomUUID(),
                waiterUserId: String(json.waiterUserId || ""),
                waiterName: String(json.waiterName || "Waiter"),
                verifiedAt: now,
                lastActiveAt: now,
            });
            setPin("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Invalid passkey");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {session && (
                <div className="fixed top-2 right-2 z-[55] flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    <div className="text-xs text-emerald-100">
                        <p className="font-semibold">{session.waiterName}</p>
                        <p className="text-emerald-200/80">{session.waiterUserId}</p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onLock}
                        className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10"
                    >
                        <LogOut className="mr-1 h-3.5 w-3.5" />
                        Switch
                    </Button>
                </div>
            )}

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-950 p-5 text-white shadow-2xl">
                        <div className="mb-4 flex items-start gap-3">
                            <div className="rounded-lg bg-emerald-500/20 p-2">
                                <Lock className="h-5 w-5 text-emerald-300" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold">Central POS waiter sign-in</h3>
                                <p className="text-xs text-neutral-400">
                                    Enter your unique staff passkey to unlock this station.
                                </p>
                            </div>
                        </div>

                        <div className="mb-3 flex justify-center">
                            <InputOTP maxLength={6} value={pin} onChange={setPin}>
                                <InputOTPGroup>
                                    <InputOTPSlot index={0} className="h-12 w-12 rounded-l-md border-white/20 bg-white/[0.04]" />
                                    <InputOTPSlot index={1} className="h-12 w-12 border-white/20 bg-white/[0.04]" />
                                    <InputOTPSlot index={2} className="h-12 w-12 border-white/20 bg-white/[0.04]" />
                                    <InputOTPSlot index={3} className="h-12 w-12 border-white/20 bg-white/[0.04]" />
                                    <InputOTPSlot index={4} className="h-12 w-12 border-white/20 bg-white/[0.04]" />
                                    <InputOTPSlot index={5} className="h-12 w-12 rounded-r-md border-white/20 bg-white/[0.04]" />
                                </InputOTPGroup>
                            </InputOTP>
                        </div>

                        {busyOptions ? (
                            <p className="mb-2 text-center text-[11px] text-neutral-500">Loading waiter profiles...</p>
                        ) : options.length > 0 ? (
                            <div className="mb-3 flex flex-wrap gap-1.5">
                                {options.slice(0, 8).map((opt) => (
                                    <span
                                        key={opt.waiterUserId}
                                        className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-1 text-[10px] text-neutral-300"
                                    >
                                        {opt.waiterName}
                                    </span>
                                ))}
                            </div>
                        ) : null}

                        {error ? <p className="mb-3 text-center text-xs text-rose-300">{error}</p> : null}

                        <Button
                            type="button"
                            onClick={verify}
                            disabled={!canSubmit}
                            className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-500"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Verify waiter passkey
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}

