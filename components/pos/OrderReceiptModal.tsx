"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { Printer } from "lucide-react";
import { printReceipt } from "@/lib/print.utils";
import { displayPaymentMethod, formatPaymentMethodEntry } from "@/lib/payment-display";
import { buildPaybillReceiptLines } from "@/lib/receipt-paybill";
import { toast } from "sonner";

interface ReceiptOrder {
    $id: string;
    orderNumber?: string;
    tableNumber?: number;
    customerName?: string;
    waiterName?: string;
    orderTime: string;
    items: any[];
    subtotal: number;
    totalAmount: number;
    paymentStatus: string;
    paymentMethods?: Array<{ method?: string; amount?: number; reference?: string }>;
}

interface OrderReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: ReceiptOrder;
    paymentMethod?: string;
    paymentReference?: string;
}

function parseItems(raw: any[]): { name: string; quantity: number; price: number }[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => ({
        name: item.name || "Item",
        quantity: typeof item.quantity === "number" ? item.quantity : 1,
        price: typeof item.price === "number" ? item.price : 0,
    }));
}

function Dashes() {
    return <div className="border-t border-dashed border-neutral-300/40 my-2" />;
}

export function OrderReceiptModal({
    isOpen,
    onClose,
    order,
    paymentMethod,
    paymentReference,
}: OrderReceiptModalProps) {
    const [isPrinting, setIsPrinting] = useState(false);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const isPaid = order.paymentStatus === "paid" || order.paymentStatus === "settled";

    const subtotal = order.subtotal > 0 ? order.subtotal : order.totalAmount / 1.16;
    const vat = order.totalAmount - subtotal;

    const items = parseItems(order.items);

    const orderDate = new Date(order.orderTime);
    const dateStr = orderDate.toLocaleDateString("en-KE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
    const timeStr = orderDate.toLocaleTimeString("en-KE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const orderRef = order.orderNumber
        ? `ORD #: ${order.orderNumber}`
        : `ORD #: ${order.$id.slice(-12).toUpperCase()}`;

    const tableLine = order.tableNumber
        ? `Table: ${order.tableNumber}`
        : "Table: Bar";

    const refForPaybill = order.orderNumber || order.$id.slice(-12).toUpperCase();
    const paybillLines = buildPaybillReceiptLines(refForPaybill);

    const resolvedMethods =
        order.paymentMethods?.length
            ? order.paymentMethods
            : paymentMethod
              ? [
                    {
                        method: paymentMethod,
                        amount: order.totalAmount,
                        reference: paymentReference,
                    },
                ]
              : [];

    const paymentLabel = (() => {
        if (!isPaid) return "UNPAID";
        if (resolvedMethods.length > 1) return "PAID — Split payment";
        if (resolvedMethods.length === 1) {
            return `PAID — ${displayPaymentMethod(resolvedMethods[0]?.method)}`;
        }
        return paymentMethod ? `PAID — ${displayPaymentMethod(paymentMethod)}` : "PAID";
    })();

    const isCoolingDown = Date.now() < cooldownUntil;

    const handlePrintReceipt = async () => {
        if (isPrinting || isCoolingDown) return;
        setIsPrinting(true);
        try {
            const result = await printReceipt(order.$id);
            if (!result.success) {
                toast.error(result.error || "Failed to queue receipt print");
                return;
            }
            if (result.deduped) {
                toast.message("Receipt is already queued or printing.");
            } else {
                toast.success("Receipt queued for printing.");
            }
            setCooldownUntil(Date.now() + 4000);
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="p-0 overflow-hidden max-w-[360px] rounded-2xl border border-white/10 bg-neutral-950"
                aria-describedby="receipt-description"
            >
                <DialogTitle className="sr-only">
                    Order Receipt {order.orderNumber ?? order.$id.slice(-6)}
                </DialogTitle>
                <DialogDescription id="receipt-description" className="sr-only">
                    {isPaid ? "Paid" : "Unpaid"} receipt for order {order.orderNumber ?? order.$id.slice(-6)}
                </DialogDescription>

                {/* Receipt paper surface */}
                <div className="bg-white text-neutral-900 font-mono text-[11px] leading-[1.5] px-5 py-5 select-text">

                    {/* Header */}
                    <div className="text-center mb-3">
                        <div className="text-[18px] font-black tracking-tight leading-none mb-0.5">AM | PM</div>
                        <div className="text-[13px] font-bold tracking-widest">LOUNGE</div>
                        <div className="text-[9px] text-neutral-500 mt-1.5 leading-snug">
                            Northern Bypass, Thome · After Windsor, Nairobi<br />
                            Tel: +254 757 650 125 · info@ampm.co.ke
                        </div>
                    </div>

                    <Dashes />

                    {/* Order metadata */}
                    <div className="space-y-0.5 text-[10px]">
                        <div>{orderRef} | Date: {dateStr}</div>
                        <div>Time: {timeStr}</div>
                        {order.waiterName && <div>Server: {order.waiterName}</div>}
                        <div className="flex gap-4">
                            <span>{tableLine}</span>
                            {order.customerName && order.customerName !== "Walk-in" && (
                                <span>Guest: {order.customerName}</span>
                            )}
                        </div>
                    </div>

                    <Dashes />

                    {/* Column headers */}
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                        <span className="flex-1">QTY  ITEM DESCRIPTION</span>
                        <span className="text-right w-20">TOTAL (KSh)</span>
                    </div>

                    <Dashes />

                    {/* Line items */}
                    {items.length === 0 ? (
                        <p className="text-neutral-400 text-center py-1 text-[10px]">No item breakdown available</p>
                    ) : (
                        <div className="space-y-0.5">
                            {items.map((item, i) => (
                                <div key={i} className="flex justify-between gap-2">
                                    <span className="flex-1 truncate">
                                        {item.quantity}x  {item.name}
                                    </span>
                                    <span className="text-right w-20 tabular-nums shrink-0">
                                        {(item.price * item.quantity).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <Dashes />

                    {/* Totals */}
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

                    <Dashes />

                    {/* Grand total */}
                    <div className="flex justify-between items-baseline text-[15px] font-black my-1">
                        <span>GRAND TOTAL:</span>
                        <span className="tabular-nums">KSh {order.totalAmount.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>

                    {/* Payment status */}
                    <div className={`text-center font-black text-[13px] tracking-widest my-2 py-1 ${isPaid ? "" : "border border-dashed border-neutral-400 rounded"}`}>
                        {isPaid ? (
                            <span>{paymentLabel} — THANK YOU</span>
                        ) : (
                            <span className="text-neutral-600">⚠ UNPAID — PENDING</span>
                        )}
                    </div>

                    {isPaid && resolvedMethods.length > 0 && (
                        <div className="text-[9px] text-neutral-600 space-y-0.5 mb-2">
                            <div className="font-bold text-neutral-800 text-center uppercase tracking-wide">
                                Payment breakdown
                            </div>
                            {resolvedMethods.map((m, i) => (
                                <div key={i} className="space-y-0.5">
                                    <div className="flex justify-between gap-2">
                                        <span className="truncate">
                                            {formatPaymentMethodEntry({
                                                method: m.method,
                                                amount: m.amount,
                                            })}
                                        </span>
                                    </div>
                                    {m.reference && (
                                        <div className="text-[8px] text-neutral-500 break-all">
                                            Ref: {m.reference}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {!isPaid && paymentReference && (
                        <div className="text-[9px] text-neutral-500 text-center">
                            Ref: {paymentReference}
                        </div>
                    )}

                    <Dashes />

                    <div className="text-[8px] text-neutral-700 space-y-0.5 leading-snug">
                        {paybillLines.map((line, i) => (
                            <div
                                key={i}
                                className={
                                    line.startsWith("─") || line === ""
                                        ? "text-neutral-400 text-center"
                                        : ""
                                }
                            >
                                {line || "\u00a0"}
                            </div>
                        ))}
                    </div>

                    <Dashes />

                    {/* Footer */}
                    <div className="text-center text-[9px] text-neutral-500 space-y-0.5">
                        <p>Thank you for choosing AM | PM.</p>
                        <p>We hope to see you again soon.</p>
                        <p className="mt-1 text-[8px]">Terminal: front desk</p>
                    </div>
                </div>

                {/* Dark action bar */}
                <div className="flex gap-2 bg-neutral-900 border-t border-white/10 px-4 py-3">
                    <button
                        type="button"
                        disabled={isPrinting || isCoolingDown}
                        onClick={() => void handlePrintReceipt()}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-[12px] font-semibold text-neutral-300 hover:bg-white/10 hover:text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        {isPrinting
                            ? "Printing..."
                            : isCoolingDown
                              ? "Please wait..."
                              : "Print Receipt"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-[12px] font-bold text-white transition"
                    >
                        Done
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
