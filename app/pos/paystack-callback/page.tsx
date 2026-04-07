"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { verifyPaystackTransaction } from "@/lib/actions/paystack.actions";
import { settleSelectedOrders } from "@/lib/actions/pos.actions";
import { formatCurrency } from "@/lib/utils";
import { Loader2, CheckCircle, XCircle, Printer } from "lucide-react";

const STORAGE_KEY = "paystack_pending_settlement";

interface PendingSettlement {
    orderIds: string[];
    amount: number;
    reference: string;
}

function PaystackCallbackContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const reference = searchParams.get("reference") ?? searchParams.get("trxref") ?? "";

    type Phase = "verifying" | "settling" | "success" | "error";
    const [phase, setPhase] = useState<Phase>("verifying");
    const [errorMsg, setErrorMsg] = useState("");
    const [settledAmount, setSettledAmount] = useState(0);
    const [orderCount, setOrderCount] = useState(0);
    const [paymentChannel, setPaymentChannel] = useState("");

    useEffect(() => {
        if (!reference) {
            setErrorMsg("No payment reference found in URL.");
            setPhase("error");
            return;
        }
        void run();
    }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

    async function run() {
        try {
            // 1. Verify with Paystack
            setPhase("verifying");
            const verifyResult = await verifyPaystackTransaction(reference);
            if (!verifyResult.success || verifyResult.data?.status !== "success") {
                throw new Error(verifyResult.error || "Payment verification failed.");
            }

            const paidAmount = verifyResult.data.amount; // KES
            setPaymentChannel(verifyResult.data.channel ?? "paystack");

            // 2. Load pending settlement from sessionStorage
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) throw new Error("Session data missing. Orders not settled — please contact staff.");
            const pending: PendingSettlement = JSON.parse(raw);

            if (pending.reference !== reference) {
                throw new Error("Reference mismatch. Please contact staff.");
            }

            // Amount integrity check (allow ±1 KES rounding)
            if (Math.abs(paidAmount - pending.amount) > 1) {
                throw new Error(
                    `Amount mismatch: expected ${formatCurrency(pending.amount)}, received ${formatCurrency(paidAmount)}.`
                );
            }

            // 3. Settle orders
            setPhase("settling");
            const result = await settleSelectedOrders({
                orderIds: pending.orderIds,
                paymentMethod: "paystack",
                paymentReference: reference,
            });

            if (!result.success) {
                throw new Error(result.message || "Settlement failed. Please contact staff.");
            }

            setSettledAmount(paidAmount);
            setOrderCount(pending.orderIds.length);
            sessionStorage.removeItem(STORAGE_KEY);
            setPhase("success");
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
            setPhase("error");
        }
    }

    // ── Loading states ────────────────────────────────────────────────────────
    if (phase === "verifying" || phase === "settling") {
        return (
            <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-5 px-6">
                <Loader2 className="w-14 h-14 text-emerald-400 animate-spin" />
                <div className="text-center">
                    <p className="text-white text-xl font-bold">
                        {phase === "verifying" ? "Verifying payment…" : "Recording settlement…"}
                    </p>
                    <p className="text-neutral-400 text-sm mt-1">Please don't close this page</p>
                </div>
            </div>
        );
    }

    // ── Error ─────────────────────────────────────────────────────────────────
    if (phase === "error") {
        return (
            <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-5 px-6 text-center">
                <XCircle className="w-14 h-14 text-red-400" />
                <div>
                    <p className="text-white text-xl font-bold">Payment issue</p>
                    <p className="text-neutral-400 text-sm mt-2 max-w-xs">{errorMsg}</p>
                </div>
                <button
                    onClick={() => router.push("/pos")}
                    className="mt-4 rounded-xl bg-neutral-800 border border-white/10 px-6 py-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-700 transition"
                >
                    Return to POS
                </button>
            </div>
        );
    }

    // ── Success — thermal receipt ─────────────────────────────────────────────
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-KE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const subtotal = settledAmount / 1.16;
    const vat = settledAmount - subtotal;

    return (
        <div className="min-h-screen bg-neutral-950 flex flex-col items-center py-8 px-4">
            {/* Action bar */}
            <div className="w-full max-w-[360px] flex gap-3 mb-5">
                <button
                    onClick={() => window.print()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-[12px] font-semibold text-neutral-300 hover:bg-white/10 transition"
                >
                    <Printer className="w-4 h-4" />
                    Print Receipt
                </button>
                <button
                    onClick={() => router.push("/pos")}
                    className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-[12px] font-bold text-white transition"
                >
                    Back to POS
                </button>
            </div>

            {/* Success chip */}
            <div className="flex items-center gap-2 mb-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-5 py-2 no-print">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300 text-sm font-bold">
                    {orderCount} order{orderCount !== 1 ? "s" : ""} settled via Paystack
                </span>
            </div>

            {/* Thermal receipt */}
            <div className="w-full max-w-[360px] bg-white text-neutral-900 font-mono text-[11px] leading-[1.5] px-5 py-5 shadow-2xl">
                {/* Header */}
                <div className="text-center mb-3">
                    <div className="text-[18px] font-black tracking-tight leading-none mb-0.5">AM | PM</div>
                    <div className="text-[13px] font-bold tracking-widest">LOUNGE</div>
                    <div className="text-[9px] text-neutral-500 mt-1.5 leading-snug">
                        Northern Bypass, Thome · After Windsor, Nairobi<br />
                        Tel: +254 757 650 125 · info@ampm.co.ke<br />
                        Terminal: front desk
                    </div>
                </div>

                <div className="border-t border-dashed border-neutral-300/60 my-2" />

                <div className="space-y-0.5 text-[10px]">
                    <div>Ref: {reference}</div>
                    <div>Date: {dateStr} | Time: {timeStr}</div>
                    <div>Channel: {paymentChannel.toUpperCase()}</div>
                    <div>{orderCount} order{orderCount !== 1 ? "s" : ""} settled</div>
                </div>

                <div className="border-t border-dashed border-neutral-300/60 my-2" />

                <div className="space-y-0.5 text-[10px]">
                    <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="tabular-nums">{subtotal.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>VAT (16%):</span>
                        <span className="tabular-nums">{vat.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div className="border-t border-dashed border-neutral-300/60 my-2" />

                <div className="flex justify-between items-baseline text-[15px] font-black my-1">
                    <span>GRAND TOTAL:</span>
                    <span className="tabular-nums">KSh {settledAmount.toLocaleString("en-KE", { minimumFractionDigits: 0 })}</span>
                </div>

                <div className="text-center font-black text-[13px] tracking-widest my-2">
                    PAID — THANK YOU
                </div>

                <div className="border-t border-dashed border-neutral-300/60 my-2" />

                <div className="text-center text-[9px] text-neutral-500 space-y-0.5">
                    <p>Thank you for choosing AM | PM.</p>
                    <p>We hope to see you again soon.</p>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    body { background: white !important; margin: 0; }
                    .no-print { display: none !important; }
                }
            `}</style>
        </div>
    );
}

export default function PaystackCallbackPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            </div>
        }>
            <PaystackCallbackContent />
        </Suspense>
    );
}
