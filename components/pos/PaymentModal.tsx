"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { Loader2, RefreshCw, ShieldCheck, CheckCircle2 } from "lucide-react";
import { updateOrder } from "@/lib/actions/pos.actions";
import { initializePaystackTransaction } from "@/lib/actions/paystack.actions";

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount: number;
    email: string;
    orderId: string;
    onSuccess: (reference: string, tableNumber: number, guestCount: number) => void;
}

/**
 * Legacy POS payment modal — uses full-page Paystack redirect (tablet-safe).
 * After payment, {@link /pos/paystack-callback} verifies and settles the order.
 */
export function PaymentModal({
    isOpen,
    onClose,
    amount,
    email,
    orderId,
    onSuccess: _onSuccess, // Success handled by /pos/paystack-callback after redirect
}: PaymentModalProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tableNumber, setTableNumber] = useState(1);
    const [guestCount, setGuestCount] = useState(1);

    useEffect(() => {
        const saved = localStorage.getItem(`pos_metadata_${orderId}`);
        if (saved) {
            try {
                const { table, guests } = JSON.parse(saved);
                setTableNumber(table);
                setGuestCount(guests);
            } catch (e) {
                console.error("Failed to parse saved metadata", e);
            }
        }
    }, [orderId]);

    const handlePayment = async () => {
        try {
            if (orderId.startsWith("temp-")) {
                setError("Save the order to a tab before Paystack checkout.");
                return;
            }
            if (tableNumber < 1 || guestCount < 1) {
                setError("Please enter valid table and guest numbers");
                return;
            }

            setIsProcessing(true);
            setError(null);

            localStorage.setItem(
                `pos_metadata_${orderId}`,
                JSON.stringify({ table: tableNumber, guests: guestCount })
            );

            try {
                await updateOrder(orderId, {
                    tableNumber,
                    guestCount: guestCount,
                });
            } catch (updateErr) {
                console.warn("Server metadata sync failed, continuing:", updateErr);
            }

            const payEmail =
                email?.trim() ||
                `guest-${orderId.replace(/[^a-zA-Z0-9]/g, "")}@ampm.co.ke`;
            const callbackUrl = `${window.location.origin}/pos/paystack-callback`;

            const initResult = await initializePaystackTransaction({
                email: payEmail,
                amount,
                orderId,
                metadata: {
                    orderType: "pos",
                    timestamp: new Date().toISOString(),
                    tableNumber,
                    guestCount,
                },
                callback_url: callbackUrl,
            });

            if (!initResult.success || !initResult.authorization_url || !initResult.reference) {
                throw new Error(initResult.error || "Failed to initialize payment");
            }

            sessionStorage.setItem(
                "paystack_pending_settlement",
                JSON.stringify({
                    flow: "single" as const,
                    orderIds: [orderId],
                    amount,
                    reference: initResult.reference,
                })
            );

            window.location.href = initResult.authorization_url;
        } catch (err) {
            console.error("Payment error:", err);
            setError(err instanceof Error ? err.message : "Payment failed");
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-900 border-white/10 text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        Complete Payment
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                Table Number
                            </label>
                            <input
                                type="number"
                                min="1"
                                disabled={isProcessing}
                                value={tableNumber}
                                onChange={(e) => setTableNumber(parseInt(e.target.value) || 0)}
                                className="w-full bg-neutral-800 border-2 border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                Guest Count
                            </label>
                            <input
                                type="number"
                                min="1"
                                disabled={isProcessing}
                                value={guestCount}
                                onChange={(e) => setGuestCount(parseInt(e.target.value) || 0)}
                                className="w-full bg-neutral-800 border-2 border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                            />
                        </div>
                    </div>

                    <div className="bg-neutral-800/50 rounded-2xl p-6 border border-white/5 text-center space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-bold">
                            Total Amount to Pay
                        </p>
                        <p className="text-5xl font-black text-emerald-400 tabular-nums">
                            {formatCurrency(amount)}
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400 flex items-start gap-3 animate-in fade-in slide-in-from-top-1">
                            <RefreshCw className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => void handlePayment()}
                        disabled={isProcessing}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed text-white h-14 rounded-xl font-black text-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-3"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="animate-spin" />
                                Redirecting…
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-6 h-6" />
                                Pay with Paystack
                            </>
                        )}
                    </button>

                    <div className="flex items-center justify-center gap-3 py-2 opacity-60 group hover:opacity-100 transition-all">
                        <img src="/paystack-logo.png" alt="Paystack" className="h-4 object-contain" />
                        <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400">
                            Secure Payment Channel
                        </span>
                    </div>
                </div>

                <p className="text-xs text-center text-neutral-500 mt-2">
                    Secured by Paystack • Supports Cards, M-PESA, Bank Transfer
                </p>
            </DialogContent>
        </Dialog>
    );
}
