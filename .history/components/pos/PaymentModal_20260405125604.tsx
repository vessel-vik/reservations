"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { Loader2, RefreshCw, ShieldCheck, CheckCircle2 } from "lucide-react";
import { updateOrder } from "@/lib/actions/pos.actions";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/actions/paystack.actions";

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amount: number;
    email: string;
    orderId: string;
    onSuccess: (reference: string, tableNumber: number, guestCount: number) => void;
}

export function PaymentModal({ isOpen, onClose, amount, email, orderId, onSuccess }: PaymentModalProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tableNumber, setTableNumber] = useState(1);
    const [guestCount, setGuestCount] = useState(1);
    const [paymentAccessCode, setPaymentAccessCode] = useState<string | null>(null);
    const [isPaystackOpen, setIsPaystackOpen] = useState(false);
    const [isPaystackReady, setIsPaystackReady] = useState(false);

    // Load saved metadata from localStorage on mount (for temp orders or refresh recovery)
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

    const handlePayment = async (resumeCode?: string) => {
        try {
            if (tableNumber < 1 || guestCount < 1) {
                setError("Please enter valid table and guest numbers");
                return;
            }

            setIsProcessing(true);
            setIsInitializing(true);
            setError(null);

            // Persist locally for immediate safety
            localStorage.setItem(`pos_metadata_${orderId}`, JSON.stringify({
                table: tableNumber,
                guests: guestCount
            }));

            // Step 1: Persist metadata to server ONLY if it's a real order
            if (!orderId.startsWith('temp-')) {
                try {
                    await updateOrder(orderId, {
                        tableNumber,
                        guestCount: guestCount
                    });
                } catch (updateErr) {
                    console.warn("Server metadata sync failed, continuing with local state:", updateErr);
                }
            }

            let accessCode = resumeCode || paymentAccessCode;

            if (!accessCode) {
                // Step 2: Initialize transaction on server
                const initResult = await initializePaystackTransaction({
                    email,
                    amount,
                    orderId,
                    metadata: {
                        orderType: "pos",
                        timestamp: new Date().toISOString(),
                        tableNumber,
                        guestCount
                    }
                });

                if (!initResult.success || !initResult.access_code) {
                    throw new Error(initResult.error || "Failed to initialize payment");
                }
                
                accessCode = initResult.access_code;
                setPaymentAccessCode(accessCode);
            }

            setIsInitializing(false);
            setIsPaystackOpen(true);

            // Step 3: Open Paystack Popup
            // @ts-ignore - PaystackPop types not available
            const popup = new PaystackPop();
            popup.resumeTransaction(accessCode, {
                onSuccess: async (transaction: any) => {
                    setIsPaystackOpen(false);
                    // Step 4: Verify transaction on server
                    const verifyResult = await verifyPaystackTransaction(transaction.reference);

                    if (!verifyResult.success || verifyResult.data?.status !== "success") {
                        setError("Payment verification failed. Please contact support.");
                        setIsProcessing(false);
                        setIsInitializing(false);
                        return;
                    }

                    // Step 5: Verify amount matches
                    if (verifyResult.data.amount !== amount) {
                        setError("Payment amount mismatch. Please contact support.");
                        setIsProcessing(false);
                        setIsInitializing(false);
                        return;
                    }

                    // Step 6: Success - deliver value
                    onSuccess(transaction.reference, tableNumber, guestCount);
                    setIsProcessing(false);
                    setPaymentAccessCode(null);
                },
                onCancel: () => {
                    setIsPaystackOpen(false);
                    setIsProcessing(false);
                    setIsInitializing(false);
                },
                onError: (error: any) => {
                    setIsPaystackOpen(false);
                    setError(error.message || "Payment failed");
                    setIsProcessing(false);
                    setIsInitializing(false);
                }
            });

        } catch (err) {
            console.error("Payment error:", err);
            setError(err instanceof Error ? err.message : "Payment failed");
            setIsProcessing(false);
            setIsInitializing(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose} modal={!isPaystackOpen}>
            <DialogContent className={`bg-neutral-900 border-white/10 text-white sm:max-w-md transition-opacity duration-300 ${isPaystackOpen ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        Complete Payment
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Table Number</label>
                            <input
                                type="number"
                                min="1"
                                disabled={isProcessing || paymentAccessCode !== null}
                                value={tableNumber}
                                onChange={(e) => setTableNumber(parseInt(e.target.value) || 0)}
                                className="w-full bg-neutral-800 border-2 border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Guest Count</label>
                            <input
                                type="number"
                                min="1"
                                disabled={isProcessing || paymentAccessCode !== null}
                                value={guestCount}
                                onChange={(e) => setGuestCount(parseInt(e.target.value) || 0)}
                                className="w-full bg-neutral-800 border-2 border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                            />
                        </div>
                    </div>

                    <div className="bg-neutral-800/50 rounded-2xl p-6 border border-white/5 text-center space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 font-bold">Total Amount to Pay</p>
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

                    <div className="space-y-3">
                        {paymentAccessCode ? (
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => handlePayment(paymentAccessCode)}
                                    disabled={isPaystackOpen}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white h-14 rounded-xl font-black text-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-3"
                                >
                                    {isPaystackOpen ? (
                                        <>
                                            <Loader2 className="animate-spin" />
                                            Awaiting Payment...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw className="w-5 h-5" />
                                            Resume Payment
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        setPaymentAccessCode(null);
                                        setError(null);
                                    }}
                                    className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-4"
                                >
                                    Start over with new details
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => handlePayment()}
                                disabled={isProcessing}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed text-white h-14 rounded-xl font-black text-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-3"
                            >
                                {isInitializing ? (
                                    <>
                                        <Loader2 className="animate-spin" />
                                        Preparing Checkout...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-6 h-6" />
                                        Confirm & Pay Now
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center justify-center gap-3 py-2 opacity-60 group hover:opacity-100 transition-all">
                        <img src="/paystack-logo.png" alt="Paystack" className="h-4 object-contain" />
                        <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400">Secure Payment Channel</span>
                    </div>
                </div>

                <p className="text-xs text-center text-neutral-500 mt-2">
                    Secured by Paystack • Supports Cards, M-PESA, Bank Transfer
                </p>
            </DialogContent>
        </Dialog>
    );
}
