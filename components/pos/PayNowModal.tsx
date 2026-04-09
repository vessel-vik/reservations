"use client";

import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, Smartphone, Banknote, CheckCircle, Loader2, Plus, Trash2, SplitSquareHorizontal } from "lucide-react";
import { toast } from "sonner";
import { initializePaystackTransaction } from "@/lib/actions/paystack.actions";
import { StaffGuidePanel } from "@/components/pos/StaffGuidePanel";
import {
    STAFF_GUIDE_PAY_NOW,
    PAY_NOW_HINT_CASH,
    PAY_NOW_HINT_MPESA,
    PAY_NOW_HINT_PDQ,
    PAY_NOW_HINT_PROMPT,
} from "@/lib/pos-settlement-staff-guide";
import { getSplitBlockingMessages } from "@/lib/pos-split-validation";
import { normalizeReference, validateReferenceForMethod } from "@/lib/payment-reference-policy";
import { getOrCreateTerminalInstallId } from "@/lib/terminal-id";
import { settleViaQueue } from "@/lib/payment-settlement-client";
import { PAYBILL_INFO } from "@/lib/receipt-paybill";
import { client } from "@/lib/appwrite-client";
import { extractBankPaybillConfirmation } from "@/lib/payment-realtime";
import { subscribeWithRetry } from "@/lib/realtime-subscribe";

const RT_DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID!;
const RT_ORDERS_COLLECTION_ID = process.env.NEXT_PUBLIC_ORDERS_COLLECTION_ID!;

type PaymentMethod = "cash" | "pdq" | "mpesa" | "paystack" | "split" | "bank_paybill";
type ManualMethod = "cash" | "pdq" | "mpesa" | "bank_paybill";
type SplitRow = {
    id: string;
    method: ManualMethod;
    amount: string;
    reference: string;
};

const SPLIT_EPS = 0.05;

interface PayNowModalProps {
    isOpen: boolean;
    onClose: () => void;
    totalAmount: number;
    orderId: string;
    orderNumber?: string;
    onPaymentSuccess?: (payload: {
        reference: string;
        method: PaymentMethod;
        paymentMethods?: Array<{ method?: string; amount?: number; reference?: string }>;
    }) => void;
    isProcessing?: boolean;
}

export function PayNowModal({
    isOpen,
    onClose,
    totalAmount,
    orderId,
    orderNumber,
    onPaymentSuccess,
    isProcessing: parentProcessing,
}: PayNowModalProps) {
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        amountReceived: "",
        cardApprovalCode: "",
        mpesaConfirmationCode: "",
        customerPhone: "",
    });
    const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
    const [bankReference, setBankReference] = useState("");
    const [bankStatus, setBankStatus] = useState<"idle" | "awaiting_payment" | "checking" | "confirmed" | "failed">("idle");
    const [bankMessage, setBankMessage] = useState("");
    const bankRealtimeAckRef = useRef(false);

    useEffect(() => {
        if (
            !isOpen ||
            selectedMethod !== "bank_paybill" ||
            !RT_DATABASE_ID ||
            !RT_ORDERS_COLLECTION_ID
        ) {
            return;
        }

        const channel = `databases.${RT_DATABASE_ID}.collections.${RT_ORDERS_COLLECTION_ID}.documents`;
        const unsubscribe = subscribeWithRetry(
            () =>
                client.subscribe(channel, (response) => {
                    const payload = response?.payload as Record<string, unknown> | null;
                    if (!payload || String(payload.$id || "") !== orderId) return;
                    const confirmation = extractBankPaybillConfirmation(payload as any, {
                        referenceContains: normalizeReference(bankReference),
                    });
                    if (!confirmation || bankRealtimeAckRef.current) return;

                    bankRealtimeAckRef.current = true;
                    setBankStatus("confirmed");
                    const settledLabel = confirmation.settledAt
                        ? new Date(confirmation.settledAt).toLocaleTimeString("en-KE", { timeStyle: "short" })
                        : "now";
                    setBankMessage(
                        `Realtime confirmed: ${formatCurrency(confirmation.amount)} · Ref ${confirmation.reference} · ${settledLabel}`
                    );
                    toast.success("Bank paybill confirmed from callback.");
                    onPaymentSuccess?.({
                        reference: confirmation.reference,
                        method: "bank_paybill",
                        paymentMethods: [
                            {
                                method: "bank_paybill",
                                amount: confirmation.amount,
                                reference: confirmation.reference,
                            },
                        ],
                    });
                    resetForm();
                    onClose();
                }),
            { maxAttempts: 5, initialDelayMs: 120 }
        );

        return () => unsubscribe();
    }, [bankReference, isOpen, onPaymentSuccess, orderId, selectedMethod]);

    const resetForm = () => {
        setFormData({
            amountReceived: "",
            cardApprovalCode: "",
            mpesaConfirmationCode: "",
            customerPhone: "",
        });
        setSelectedMethod(null);
        setSplitRows([]);
        setBankReference("");
        setBankStatus("idle");
        setBankMessage("");
        bankRealtimeAckRef.current = false;
    };

    const newSplitRow = (method: ManualMethod = "cash"): SplitRow => ({
        id: crypto.randomUUID(),
        method,
        amount: "",
        reference: "",
    });

    const paystackEmail = (syntheticId: string): string => {
        const digits = formData.customerPhone.replace(/\D/g, "");
        if (digits.length >= 9) return `${digits}@ampm.co.ke`;
        return `${syntheticId}@ampm.co.ke`;
    };

    const handleCashPayment = async () => {
        if (!formData.amountReceived) {
            toast.error("Please enter amount received");
            return;
        }
        const amount = parseFloat(formData.amountReceived);
        if (amount < totalAmount) {
            toast.error("Amount received is less than total");
            return;
        }

        const change = amount - totalAmount;
        const changeCents = Math.round(change * 100);
        const reference = `CASH-CHG${changeCents}-${Date.now()}`;

        try {
            const terminalId = getOrCreateTerminalInstallId();
            const result = await settleViaQueue({
                orderIds: [orderId],
                paymentSplits: [{ method: "cash", amount: totalAmount, reference, terminalId }],
                paymentMethod: "cash",
                terminalId,
            });
            if (!result.success) {
                throw new Error(result.message || "Settlement failed");
            }
            toast.success(`Paid. Change: ${formatCurrency(change)}`, { duration: 5000 });
            onPaymentSuccess?.({
                reference,
                method: "cash",
                paymentMethods: [{ method: "cash", amount: totalAmount, reference }],
            });
            resetForm();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Payment failed");
        }
    };

    const handlePDQPayment = async () => {
        const code = normalizeReference(formData.cardApprovalCode);
        const pdqValidation = validateReferenceForMethod("pdq", code);
        if (!pdqValidation.valid) {
            toast.error(pdqValidation.message || "Invalid PDQ reference.");
            return;
        }
        const reference = `PDQ-${code}-${Date.now()}`;
        try {
            const terminalId = getOrCreateTerminalInstallId();
            const result = await settleViaQueue({
                orderIds: [orderId],
                paymentSplits: [{ method: "pdq", amount: totalAmount, reference, terminalId }],
                paymentMethod: "pdq",
                paymentReference: reference,
                terminalId,
            });
            if (!result.success) throw new Error(result.message || "Settlement failed");
            toast.success("Card payment recorded");
            onPaymentSuccess?.({
                reference,
                method: "pdq",
                paymentMethods: [{ method: "pdq", amount: totalAmount, reference }],
            });
            resetForm();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Payment failed");
        }
    };

    const handleMpesaPayment = async () => {
        const code = normalizeReference(formData.mpesaConfirmationCode);
        const mpesaValidation = validateReferenceForMethod("mpesa", code);
        if (!mpesaValidation.valid) {
            toast.error(mpesaValidation.message || "Invalid M-Pesa reference.");
            return;
        }
        const reference = `MPESA-${code}-${Date.now()}`;
        try {
            const terminalId = getOrCreateTerminalInstallId();
            const result = await settleViaQueue({
                orderIds: [orderId],
                paymentSplits: [{ method: "mpesa", amount: totalAmount, reference, terminalId }],
                paymentMethod: "mpesa",
                paymentReference: reference,
                terminalId,
            });
            if (!result.success) throw new Error(result.message || "Settlement failed");
            toast.success("M-Pesa payment recorded");
            onPaymentSuccess?.({
                reference,
                method: "mpesa",
                paymentMethods: [{ method: "mpesa", amount: totalAmount, reference }],
            });
            resetForm();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Payment failed");
        }
    };

    const handlePaystackPayment = async () => {
        if (!orderId) {
            toast.error("Missing order");
            return;
        }
        setIsLoading(true);
        try {
            const syntheticOrderId = `pay-now-${orderId}-${Date.now()}`;
            const email = paystackEmail(syntheticOrderId);
            const callbackUrl = `${window.location.origin}/pos/paystack-callback`;

            const initResult = await initializePaystackTransaction({
                email,
                amount: totalAmount,
                orderId: syntheticOrderId,
                metadata: { type: "pay_now_single", orderIds: [orderId] },
                callback_url: callbackUrl,
            });

            if (!initResult.success || !initResult.authorization_url || !initResult.reference) {
                throw new Error(initResult.error || "Failed to initialize Paystack");
            }

            sessionStorage.setItem(
                "paystack_pending_settlement",
                JSON.stringify({
                    flow: "single" as const,
                    orderIds: [orderId],
                    amount: totalAmount,
                    reference: initResult.reference,
                })
            );

            window.location.href = initResult.authorization_url;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to start Paystack");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSplitPayment = async () => {
        const blockers = getSplitBlockingMessages(splitRows, totalAmount, formatCurrency);
        if (blockers.length > 0) {
            toast.error(blockers[0] ?? "Fix split payment lines first.");
            return;
        }

        const rows = splitRows.map((r) => {
            const amount = parseFloat(r.amount) || 0;
            const code = normalizeReference(r.reference);
            const terminalId = getOrCreateTerminalInstallId();
            if (r.method === "cash") {
                return {
                    method: "cash",
                    amount,
                    reference: `CASH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    terminalId,
                };
            }
            if (r.method === "pdq") {
                return {
                    method: "pdq",
                    amount,
                    reference: `PDQ-${code}-${Date.now()}`,
                    terminalId,
                };
            }
            if (r.method === "bank_paybill") {
                return {
                    method: "bank_paybill",
                    amount,
                    reference: `JENGA-${code}-${Date.now()}`,
                    terminalId,
                };
            }
            return {
                method: "mpesa",
                amount,
                reference: `MPESA-${code}-${Date.now()}`,
                terminalId,
            };
        });

        try {
            const result = await settleViaQueue({
                orderIds: [orderId],
                paymentSplits: rows,
                paymentMethod: rows[0]?.method ?? "cash",
                terminalId: getOrCreateTerminalInstallId(),
            });
            if (!result.success) throw new Error(result.message || "Split settlement failed");

            const paymentMethods = Array.isArray((result as any).paymentMethods)
                ? (result as any).paymentMethods
                : rows;
            const effectiveMethod: PaymentMethod = paymentMethods.length > 1
                ? "split"
                : ((paymentMethods[0]?.method as PaymentMethod | undefined) ?? "cash");

            toast.success("Split payment recorded successfully.");
            onPaymentSuccess?.({
                reference: (result as any).paymentReference ?? rows.map((r) => r.reference).join("|"),
                method: effectiveMethod,
                paymentMethods,
            });
            resetForm();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Split payment failed");
        }
    };

    const handleBankCheckStatus = async () => {
        const ref = normalizeReference(bankReference);
        const validation = validateReferenceForMethod("bank_paybill", ref);
        if (!validation.valid) {
            toast.error(validation.message || "Invalid bank reference.");
            return;
        }

        setBankStatus("checking");
        setBankMessage("Checking payment status...");
        try {
            const response = await fetch("/api/payments/jenga/reconcile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    reference: ref,
                    orderReference: orderNumber || orderId,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "Failed to check bank payment status.");
            }

            const status = String(data?.status || "").toLowerCase();
            if (status === "confirmed") {
                const terminalId = getOrCreateTerminalInstallId();
                const settlementReference = `JENGA-${ref}-${Date.now()}`;
                const result = await settleViaQueue({
                    orderIds: [orderId],
                    paymentSplits: [
                        {
                            method: "bank_paybill",
                            amount: totalAmount,
                            reference: settlementReference,
                            terminalId,
                        },
                    ],
                    paymentMethod: "bank_paybill",
                    paymentReference: settlementReference,
                    terminalId,
                });
                if (!result.success) throw new Error(result.message || "Settlement failed");

                setBankStatus("confirmed");
                setBankMessage("Payment confirmed and recorded.");
                toast.success("Bank paybill payment confirmed.");
                onPaymentSuccess?.({
                    reference: settlementReference,
                    method: "bank_paybill",
                    paymentMethods: [{ method: "bank_paybill", amount: totalAmount, reference: settlementReference }],
                });
                resetForm();
                onClose();
                return;
            }

            if (status === "failed") {
                setBankStatus("failed");
                setBankMessage("Provider returned a failed transaction state.");
                toast.error("Bank payment failed or rejected.");
                return;
            }

            setBankStatus("awaiting_payment");
            setBankMessage("Payment still pending. Ask customer to complete and check again.");
            toast.message("Payment pending. You can check again.");
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to check status";
            setBankStatus("failed");
            setBankMessage(message);
            toast.error(message);
        }
    };

    const splitAllocated = splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const splitRemainder = totalAmount - splitAllocated;
    const splitBlockingMessages = getSplitBlockingMessages(splitRows, totalAmount, formatCurrency);
    const splitReady = splitRows.length > 0 && splitBlockingMessages.length === 0;

    const addSplitRemainderCashLine = () => {
        if (splitRemainder <= SPLIT_EPS) return;
        setSplitRows((prev) => [
            ...prev,
            {
                ...newSplitRow("cash"),
                amount: splitRemainder.toFixed(2),
            },
        ]);
    };

    const getContent = () => {
        switch (selectedMethod) {
            case "cash": {
                const received = parseFloat(formData.amountReceived) || 0;
                const cashOk = received >= totalAmount && formData.amountReceived !== "";
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-neutral-300 block mb-2">
                                Cash received (KSh)
                            </label>
                            <Input
                                type="number"
                                placeholder="Enter amount"
                                value={formData.amountReceived}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        amountReceived: e.target.value,
                                    })
                                }
                                className="bg-white/5 border-white/10 text-white"
                                step="0.01"
                                min={totalAmount}
                                aria-invalid={formData.amountReceived !== "" && !cashOk}
                            />
                            <p className="text-[11px] text-neutral-500 mt-2 leading-snug">
                                {PAY_NOW_HINT_CASH}
                            </p>
                            {formData.amountReceived !== "" && !cashOk && (
                                <p className="text-[11px] text-amber-400 mt-1">
                                    Still {formatCurrency(Math.max(0, totalAmount - received))} short of the bill.
                                </p>
                            )}
                        </div>
                        <Button
                            onClick={() => void handleCashPayment()}
                            disabled={parentProcessing || !cashOk}
                            title={!cashOk ? "Enter at least the bill total in cash received" : undefined}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirm cash payment
                        </Button>
                    </div>
                );
            }

            case "pdq": {
                const pdqLen = formData.cardApprovalCode.trim().length;
                const pdqOk = validateReferenceForMethod("pdq", formData.cardApprovalCode).valid;
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-neutral-300 block mb-2">
                                Card approval code (PDQ)
                            </label>
                            <Input
                                type="text"
                                placeholder="Enter approval code"
                                value={formData.cardApprovalCode}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        cardApprovalCode: e.target.value.toUpperCase(),
                                    })
                                }
                                className="bg-white/5 border-white/10 text-white uppercase tracking-wide"
                                maxLength={12}
                                aria-invalid={pdqLen > 0 && !pdqOk}
                            />
                            <p className="text-[11px] text-neutral-500 mt-2 leading-snug">
                                {PAY_NOW_HINT_PDQ}
                            </p>
                            <p className="text-[11px] text-neutral-600 mt-1 tabular-nums">
                                {pdqLen}/12 · use 6 or 12 characters
                            </p>
                        </div>
                        <Button
                            onClick={() => void handlePDQPayment()}
                            disabled={parentProcessing || !pdqOk}
                            title={!pdqOk ? "Enter the code from the card terminal receipt" : undefined}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirm PDQ Payment
                        </Button>
                    </div>
                );
            }

            case "mpesa": {
                const mLen = formData.mpesaConfirmationCode.trim().length;
                const mOk = validateReferenceForMethod("mpesa", formData.mpesaConfirmationCode).valid;
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-neutral-300 block mb-2">
                                M-Pesa confirmation code
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g. RGH12345XY"
                                value={formData.mpesaConfirmationCode}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        mpesaConfirmationCode: e.target.value.toUpperCase(),
                                    })
                                }
                                className="bg-white/5 border-white/10 text-white uppercase tracking-wide"
                                maxLength={10}
                                aria-invalid={mLen > 0 && !mOk}
                            />
                            <p className="text-[11px] text-neutral-500 mt-2 leading-snug">
                                {PAY_NOW_HINT_MPESA}
                            </p>
                            <p className="text-[11px] text-neutral-600 mt-1 tabular-nums">
                                {mLen}/10 · exactly 10 characters
                            </p>
                        </div>
                        <Button
                            onClick={() => void handleMpesaPayment()}
                            disabled={parentProcessing || !mOk}
                            title={!mOk ? "Enter the full M-Pesa SMS confirmation code" : undefined}
                            className="w-full bg-green-600 hover:bg-green-500 text-white"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirm M-Pesa Paybill
                        </Button>
                    </div>
                );
            }

            case "paystack":
                return (
                    <div className="space-y-4">
                        <div className="p-4 bg-neutral-900/50 border border-white/5 rounded-lg">
                            <p className="text-sm text-white font-medium mb-2">Total Amount</p>
                            <p className="text-2xl font-bold text-emerald-400">
                                {formatCurrency(totalAmount)}
                            </p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-neutral-300 block mb-2">
                                Customer phone (optional — sets Prompt checkout email)
                            </label>
                            <Input
                                type="tel"
                                placeholder="2547…"
                                value={formData.customerPhone}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        customerPhone: e.target.value,
                                    })
                                }
                                className="bg-white/5 border-white/10 text-white"
                            />
                            <p className="text-[11px] text-neutral-500 mt-2 leading-snug">
                                {PAY_NOW_HINT_PROMPT}
                            </p>
                        </div>
                        <Button
                            onClick={() => void handlePaystackPayment()}
                            disabled={isLoading || parentProcessing}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Redirecting…
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Pay with Prompt
                                </>
                            )}
                        </Button>
                    </div>
                );

            case "bank_paybill": {
                const refLen = bankReference.trim().length;
                const refOk = validateReferenceForMethod("bank_paybill", bankReference).valid;
                return (
                    <div className="space-y-4">
                        <div className="p-4 rounded-lg border border-white/10 bg-white/[0.03] space-y-1">
                            <p className="text-xs text-neutral-400 uppercase tracking-wide">Customer prompt</p>
                            <p className="text-sm text-white">
                                Ask customer to pay via Equity/Mobile Paybill:
                            </p>
                            <p className="text-sm text-neutral-300">
                                Paybill: <span className="font-semibold text-white">{PAYBILL_INFO.mpesaAirtelPaybill}</span>
                                {" · "}Account: <span className="font-semibold text-white">{PAYBILL_INFO.mpesaAirtelAccount}</span>
                            </p>
                            <p className="text-xs text-neutral-500">
                                Reference: {orderNumber || orderId}
                            </p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-neutral-300 block mb-2">
                                Bank transaction reference
                            </label>
                            <Input
                                type="text"
                                placeholder="e.g. 328411183176"
                                value={bankReference}
                                onChange={(e) => setBankReference(e.target.value.toUpperCase())}
                                className="bg-white/5 border-white/10 text-white uppercase tracking-wide"
                                maxLength={24}
                                aria-invalid={refLen > 0 && !refOk}
                            />
                            <p className="text-[11px] text-neutral-600 mt-1 tabular-nums">
                                {refLen}/24 · use 6-24 letters/numbers
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setBankStatus("awaiting_payment");
                                    setBankMessage("Awaiting customer payment...");
                                }}
                                className="flex-1 border-white/15"
                            >
                                Mark awaiting
                            </Button>
                            <Button
                                onClick={() => void handleBankCheckStatus()}
                                disabled={parentProcessing || !refOk || bankStatus === "checking"}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                                {bankStatus === "checking" ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Check status now
                                    </>
                                )}
                            </Button>
                        </div>
                        {bankStatus !== "idle" && (
                            <div
                                className={`rounded-lg border px-3 py-2 text-xs ${
                                    bankStatus === "confirmed"
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                        : bankStatus === "failed"
                                          ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                          : "border-amber-500/35 bg-amber-500/10 text-amber-200"
                                }`}
                            >
                                {bankMessage || "Awaiting update..."}
                            </div>
                        )}
                    </div>
                );
            }

            case "split":
                return (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                            <p className="text-xs text-neutral-400 uppercase tracking-wide">Split total</p>
                            <p className="text-lg font-bold text-white mt-1 tabular-nums">
                                {formatCurrency(splitAllocated)} / {formatCurrency(totalAmount)}
                            </p>
                            {Math.abs(splitRemainder) > SPLIT_EPS && (
                                <p className="text-xs text-amber-300 mt-1">
                                    {splitRemainder > 0
                                        ? `Remaining ${formatCurrency(splitRemainder)}`
                                        : `Over by ${formatCurrency(-splitRemainder)}`}
                                </p>
                            )}
                        </div>

                        <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                            {splitRows.map((row, idx) => (
                                <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-neutral-400 uppercase tracking-wide">Line {idx + 1}</p>
                                        {splitRows.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setSplitRows((prev) => prev.filter((x) => x.id !== row.id))}
                                                className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10"
                                                aria-label="Remove split line"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>

                                    <select
                                        value={row.method}
                                        onChange={(e) =>
                                            setSplitRows((prev) =>
                                                prev.map((x) =>
                                                    x.id === row.id
                                                        ? { ...x, method: e.target.value as ManualMethod, reference: "" }
                                                        : x
                                                )
                                            )
                                        }
                                        className="w-full min-h-[42px] rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white"
                                    >
                                        <option value="cash">Cash</option>
                                        <option value="pdq">PDQ</option>
                                        <option value="mpesa">M-Pesa Paybill</option>
                                        <option value="bank_paybill">Bank Paybill</option>
                                    </select>

                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step="0.01"
                                        placeholder="Amount"
                                        value={row.amount}
                                        onChange={(e) =>
                                            setSplitRows((prev) =>
                                                prev.map((x) =>
                                                    x.id === row.id ? { ...x, amount: e.target.value } : x
                                                )
                                            )
                                        }
                                        className="bg-white/5 border-white/10 text-white tabular-nums"
                                    />

                                    {(row.method === "pdq" || row.method === "mpesa" || row.method === "bank_paybill") && (
                                        <Input
                                            type="text"
                                            placeholder={
                                                row.method === "pdq"
                                                    ? "PDQ code (6 or 12 chars)"
                                                    : row.method === "mpesa"
                                                      ? "M-Pesa code (10 chars)"
                                                      : "Bank reference (6-24 chars)"
                                            }
                                            value={row.reference}
                                            onChange={(e) =>
                                                setSplitRows((prev) =>
                                                    prev.map((x) =>
                                                        x.id === row.id
                                                            ? { ...x, reference: e.target.value.toUpperCase() }
                                                            : x
                                                    )
                                                )
                                            }
                                            className="bg-white/5 border-white/10 text-white uppercase tracking-wide"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setSplitRows((prev) => [...prev, newSplitRow(prev[prev.length - 1]?.method ?? "cash")])}
                                className="border-white/15"
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                Add line
                            </Button>
                            {splitRemainder > SPLIT_EPS && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={addSplitRemainderCashLine}
                                    className="border-white/15"
                                >
                                    Add remaining as cash
                                </Button>
                            )}
                        </div>

                        {splitBlockingMessages.length > 0 && (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                {splitBlockingMessages[0]}
                            </div>
                        )}

                        <Button
                            onClick={() => void handleSplitPayment()}
                            disabled={parentProcessing || !splitReady}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirm split payment
                        </Button>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    resetForm();
                    onClose();
                }
            }}
        >
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle>Select Payment Method</DialogTitle>
                    <DialogDescription className="text-neutral-400">
                        Total: {formatCurrency(totalAmount)}
                    </DialogDescription>
                </DialogHeader>

                <StaffGuidePanel
                    storageKey="pos_staff_guide_pay_now_v1"
                    title="Staff tips — Pay now"
                    lines={STAFF_GUIDE_PAY_NOW}
                    defaultOpen
                    className="mb-4"
                />

                {!selectedMethod ? (
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setSelectedMethod("cash")}
                            className="p-4 rounded-lg border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex flex-col items-center gap-2"
                        >
                            <Banknote className="w-6 h-6 text-emerald-400" />
                            <span className="text-sm font-medium">Cash</span>
                        </button>
                        <button
                            onClick={() => setSelectedMethod("pdq")}
                            className="p-4 rounded-lg border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex flex-col items-center gap-2"
                        >
                            <CreditCard className="w-6 h-6 text-blue-400" />
                            <span className="text-sm font-medium">PDQ</span>
                        </button>
                        <button
                            onClick={() => setSelectedMethod("mpesa")}
                            className="p-4 rounded-lg border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex flex-col items-center gap-2"
                        >
                            <Smartphone className="w-6 h-6 text-green-400" />
                            <span className="text-sm font-medium">M-Pesa Paybill</span>
                        </button>
                        <button
                            onClick={() => setSelectedMethod("paystack")}
                            className="p-4 rounded-lg border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex flex-col items-center gap-2"
                        >
                            <CreditCard className="w-6 h-6 text-purple-400" />
                            <span className="text-sm font-medium">Prompt</span>
                        </button>
                        <button
                            onClick={() => {
                                bankRealtimeAckRef.current = false;
                                setSelectedMethod("bank_paybill");
                            }}
                            className="p-4 rounded-lg border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex flex-col items-center gap-2"
                        >
                            <Smartphone className="w-6 h-6 text-amber-400" />
                            <span className="text-sm font-medium">Bank Paybill</span>
                        </button>
                        <button
                            onClick={() => {
                                setSplitRows([{ ...newSplitRow("cash"), amount: totalAmount.toFixed(2) }]);
                                setSelectedMethod("split");
                            }}
                            className="p-4 rounded-lg border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex flex-col items-center gap-2 col-span-2"
                        >
                            <SplitSquareHorizontal className="w-6 h-6 text-amber-400" />
                            <span className="text-sm font-medium">Split Payment</span>
                            <span className="text-[11px] text-neutral-500">Cash + PDQ + M-Pesa Paybill</span>
                        </button>
                    </div>
                ) : (
                    <>
                        {getContent()}
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSelectedMethod(null);
                            }}
                            className="w-full border-white/15"
                        >
                            Back
                        </Button>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
