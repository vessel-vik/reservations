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
    isProcessing,
}: PayNowModalProps) {
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        amountReceived: "",
        cardApprovalCode: "",
        customerPhone: "",
    });

    const handleCashPayment = () => {
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
        const reference = `CASH-${Date.now()}`;

        toast.success(
            `Payment successful. Change: ${formatCurrency(change)}`,
            { duration: 5000 }
        );

        onPaymentSuccess?.(reference, "cash");
        resetForm();
        onClose();
    };

    const handlePDQPayment = () => {
        if (!formData.cardApprovalCode) {
            toast.error("Please enter card approval code");
            return;
        }

        const reference = `PDQ-${Date.now()}`;
        toast.success("Card payment confirmed");

        onPaymentSuccess?.(reference, "pdq");
        resetForm();
        onClose();
    };

    const handleMpesaPayment = () => {
        if (!formData.customerPhone) {
            toast.error("Please enter customer phone number");
            return;
        }

        const reference = `MPESA-${Date.now()}`;
        toast.success("M-Pesa prompt sent to customer");

        onPaymentSuccess?.(reference, "mpesa");
        resetForm();
        onClose();
    };

    const handlePaystackPayment = async () => {
        setIsLoading(true);
        try {
            // This would integrate with your Paystack initialization logic
            toast.success("Redirecting to Paystack...");
            // onPaymentSuccess would be called from the Paystack success handler
        } catch (error) {
            toast.error("Failed to initialize Paystack payment");
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            amountReceived: "",
            cardApprovalCode: "",
            customerPhone: "",
        });
        setSelectedMethod(null);
    };

    const getContent = () => {
        switch (selectedMethod) {
            case "cash":
                return (
                    <div className="space-y-4">
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
                            <p className="text-xs text-neutral-400 mt-1">
                                Enter amount ≥ {formatCurrency(totalAmount)}
                            </p>
                        </div>

                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                            <p className="text-xs text-emerald-300 font-medium">
                                Change: {formatCurrency(
                                    Math.max(0, parseFloat(formData.amountReceived) - totalAmount) ||
                                    0
                                )}
                            </p>
                        </div>

                        <Button
                            onClick={handleCashPayment}
                            disabled={isProcessing}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Confirm Cash Payment
                                </>
                            )}
                        </Button>
                    </div>
                );

            case "pdq":
                return (
                    <div className="space-y-4">
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <p className="text-xs text-blue-300">
                                Process the card through your PDQ terminal
                            </p>
                        </div>

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
                                maxLength={6}
                            />
                        </div>

                        <Button
                            onClick={handlePDQPayment}
                            disabled={isProcessing}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Confirm PDQ Payment
                                </>
                            )}
                        </Button>
                    </div>
                );

            case "mpesa":
                return (
                    <div className="space-y-4">
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <p className="text-xs text-green-300">
                                Customer will receive M-Pesa prompt
                            </p>
                        </div>

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
                            onClick={handleMpesaPayment}
                            disabled={isProcessing}
                            className="w-full bg-green-600 hover:bg-green-500 text-white"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Send M-Pesa Prompt
                                </>
                            )}
                        </Button>
                    </div>
                );

            case "paystack":
                return (
                    <div className="space-y-4">
                        <div className="p-4 bg-neutral-900/50 border border-white/5 rounded-lg">
                            <p className="text-sm text-white font-medium mb-2">
                                Total Amount
                            </p>
                            <p className="text-2xl font-bold text-emerald-400">
                                {formatCurrency(totalAmount)}
                            </p>
                        </div>

                        <Button
                            onClick={handlePaystackPayment}
                            disabled={isProcessing || isLoading}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            {isLoading || isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Redirecting...
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
        <Dialog open={isOpen} onOpenChange={onClose}>
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
                            onClick={() => setSelectedMethod(null)}
                            className="w-full"
                        >
                            Back
                        </Button>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
