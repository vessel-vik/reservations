"use client";

import { useState } from "react";
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
import { CreditCard, Smartphone, Banknote, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { settleSelectedOrders } from "@/lib/actions/pos.actions";
import { initializePaystackTransaction } from "@/lib/actions/paystack.actions";
import { CashCameraCapture } from "@/components/pos/CashCameraCapture";
import { enqueueCashVerification } from "@/lib/pos-cash-verification-client";

type PaymentMethod = "cash" | "pdq" | "mpesa" | "paystack";

interface PayNowModalProps {
    isOpen: boolean;
    onClose: () => void;
    totalAmount: number;
    orderId: string;
    onPaymentSuccess?: (reference: string, method: PaymentMethod) => void;
    isProcessing?: boolean;
}

export function PayNowModal({
    isOpen,
    onClose,
    totalAmount,
    orderId,
    onPaymentSuccess,
    isProcessing: parentProcessing,
}: PayNowModalProps) {
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [cashPhotoDataUrl, setCashPhotoDataUrl] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        amountReceived: "",
        cardApprovalCode: "",
        customerPhone: "",
    });

    const resetForm = () => {
        setFormData({
            amountReceived: "",
            cardApprovalCode: "",
            customerPhone: "",
        });
        setSelectedMethod(null);
        setCashPhotoDataUrl(null);
    };

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
        if (!cashPhotoDataUrl) {
            toast.error("Capture a cash photo before confirming");
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
            const result = await settleSelectedOrders({
                orderIds: [orderId],
                paymentMethod: "cash",
                paymentReference: reference,
            });
            if (!result.success) {
                throw new Error(result.message || "Settlement failed");
            }
            enqueueCashVerification({
                paymentReference: reference,
                imageDataUrl: cashPhotoDataUrl,
                orderIds: [orderId],
            });
            toast.success(`Paid. Change: ${formatCurrency(change)}`, { duration: 5000 });
            onPaymentSuccess?.(reference, "cash");
            resetForm();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Payment failed");
        }
    };

    const handlePDQPayment = async () => {
        if (!formData.cardApprovalCode) {
            toast.error("Please enter card approval code");
            return;
        }
        const reference = `PDQ-${formData.cardApprovalCode.trim().toUpperCase()}-${Date.now()}`;
        try {
            const result = await settleSelectedOrders({
                orderIds: [orderId],
                paymentMethod: "pdq",
                paymentReference: reference,
            });
            if (!result.success) throw new Error(result.message || "Settlement failed");
            toast.success("Card payment recorded");
            onPaymentSuccess?.(reference, "pdq");
            resetForm();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Payment failed");
        }
    };

    const handleMpesaPayment = async () => {
        if (!formData.customerPhone) {
            toast.error("Please enter customer phone number");
            return;
        }
        const reference = `MPESA-${formData.customerPhone.replace(/\W/g, "").toUpperCase()}-${Date.now()}`;
        try {
            const result = await settleSelectedOrders({
                orderIds: [orderId],
                paymentMethod: "mpesa",
                paymentReference: reference,
            });
            if (!result.success) throw new Error(result.message || "Settlement failed");
            toast.success("M-Pesa payment recorded");
            onPaymentSuccess?.(reference, "mpesa");
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

    const getContent = () => {
        switch (selectedMethod) {
            case "cash":
                return (
                    <div className="space-y-4">
                        <CashCameraCapture
                            capturedDataUrl={cashPhotoDataUrl}
                            onCapture={setCashPhotoDataUrl}
                            compact
                        />
                        <div>
                            <label className="text-xs font-semibold text-neutral-300 block mb-2">
                                Amount Received
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
                            />
                        </div>
                        <Button
                            onClick={() => void handleCashPayment()}
                            disabled={parentProcessing || !cashPhotoDataUrl}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirm Cash Payment
                        </Button>
                    </div>
                );

            case "pdq":
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-neutral-300 block mb-2">
                                Card Approval Code
                            </label>
                            <Input
                                type="text"
                                placeholder="Enter approval code"
                                value={formData.cardApprovalCode}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        cardApprovalCode: e.target.value,
                                    })
                                }
                                className="bg-white/5 border-white/10 text-white"
                                maxLength={10}
                            />
                        </div>
                        <Button
                            onClick={() => void handlePDQPayment()}
                            disabled={parentProcessing}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirm PDQ Payment
                        </Button>
                    </div>
                );

            case "mpesa":
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-neutral-300 block mb-2">
                                Customer Phone Number
                            </label>
                            <Input
                                type="tel"
                                placeholder="254712345678"
                                value={formData.customerPhone}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        customerPhone: e.target.value,
                                    })
                                }
                                className="bg-white/5 border-white/10 text-white"
                            />
                        </div>
                        <Button
                            onClick={() => void handleMpesaPayment()}
                            disabled={parentProcessing}
                            className="w-full bg-green-600 hover:bg-green-500 text-white"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Confirm M-Pesa
                        </Button>
                    </div>
                );

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
                                Customer phone (optional — sets Paystack email)
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
                                    Pay with Paystack
                                </>
                            )}
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
                            <span className="text-sm font-medium">M-Pesa</span>
                        </button>
                        <button
                            onClick={() => setSelectedMethod("paystack")}
                            className="p-4 rounded-lg border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex flex-col items-center gap-2"
                        >
                            <CreditCard className="w-6 h-6 text-purple-400" />
                            <span className="text-sm font-medium">Paystack</span>
                        </button>
                    </div>
                ) : (
                    <>
                        {getContent()}
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSelectedMethod(null);
                                setCashPhotoDataUrl(null);
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
