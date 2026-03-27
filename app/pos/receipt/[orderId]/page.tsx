"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Order } from "@/types/pos.types";
import { getOrder } from "@/lib/actions/pos.actions";
import { CheckCircle, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { PrinterSetup } from "@/components/pos/PrinterSetup";
import { useUser } from "@clerk/nextjs";

export default function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
    const { orderId } = use(params);
    const [order, setOrder] = useState<Order | null>(null);
    const [qrCode, setQrCode] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchOrder = async () => {
            if (orderId) {
                // Add artificial delay for smooth transition
                await new Promise(resolve => setTimeout(resolve, 800));

                const fetchedOrder = await getOrder(orderId);
                if (fetchedOrder) {
                    setOrder(fetchedOrder as Order);

                    // Generate QR code for order number
                    try {
                        const qr = await QRCode.toDataURL(fetchedOrder.orderNumber, {
                            width: 200,
                            margin: 1,
                            color: {
                                dark: '#000000',
                                light: '#FFFFFF'
                            }
                        });
                        setQrCode(qr);
                    } catch (err) {
                        console.error('QR Code generation failed:', err);
                    }
                }
                setIsLoading(false);
            }
        };

        fetchOrder();
    }, [orderId]);

    const handleNewOrder = () => {
        router.push('/pos');
    };

    // Loading state with animation (generic - not tied to payment status)
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center">
                <div className="text-center space-y-6 animate-fade-in">
                    <div className="relative">
                        <div className="w-24 h-24 mx-auto">
                            <Loader2 className="w-full h-full text-emerald-500 animate-spin" />
                        </div>
                        <div className="absolute inset-0 w-24 h-24 mx-auto">
                            <CheckCircle className="w-full h-full text-emerald-500 opacity-20" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-emerald-900">Generating Receipt</h2>
                        <p className="text-emerald-700">Preparing your order summary...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
                <div className="text-center text-white">
                    <p>Receipt not found</p>
                    <button onClick={handleNewOrder} className="mt-4 text-emerald-400 hover:underline">
                        Return to POS
                    </button>
                </div>
            </div>
        );
    }

    // Check if order is paid - includes both "paid" and "settled" status
    // "settled" is used for child orders that were consolidated into a table tab
    const paymentStatus = order.paymentStatus?.toLowerCase?.();
    const orderStatus = order.status?.toLowerCase?.();
    const isPaid =
        paymentStatus === "paid" ||
        paymentStatus === "settled" ||  // Child orders in a tab settlement
        orderStatus === "paid";

    // Determine display label for payment status
    // Show "PAID" for both "paid" and "settled" statuses to avoid confusing customers
    let paymentLabel: string;
    if (order.paymentStatus) {
        const upperStatus = order.paymentStatus.toUpperCase();
        paymentLabel = upperStatus === "SETTLED" ? "PAID" : upperStatus;
    } else {
        paymentLabel = isPaid ? "PAID" : "UNPAID";
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-emerald-100 py-8 px-4 animate-fade-in">
            {/* Action Buttons - Hidden on print */}
            <div className="max-w-md mx-auto mb-6 space-y-3 no-print">
                <PrinterSetup orderId={orderId} />

                <button
                    onClick={handleNewOrder}
                    className="w-full bg-white hover:bg-gray-50 text-emerald-600 py-3 px-6 rounded-lg font-bold transition-all shadow-lg hover:shadow-xl border-2 border-emerald-500"
                >
                    New Order
                </button>
            </div>

            {/* Receipt */}
            <div className="max-w-md mx-auto bg-white p-8 text-black font-mono text-sm shadow-2xl receipt-paper">
                {/* Header */}
                <div className="text-center space-y-2 mb-6 border-b pb-6 border-dashed border-gray-300">
                    <h1 className="text-3xl font-bold uppercase tracking-wider">AM | PM</h1>
                    <h2 className="text-lg font-semibold">LOUNGE</h2>
                    <p className="text-gray-600 text-xs">Northern Bypass, Thome</p>
                    <p className="text-gray-600 text-xs">After Windsor, Nairobi</p>
                    <p className="text-gray-600 text-xs">Tel: +254 757 650 125</p>
                    <p className="text-gray-600 text-xs">info@ampm.co.ke</p>
                </div>

                {/* Order Info */}
                <div className="mb-4 text-xs space-y-1">
                    <div className="flex justify-between">
                        <span className="font-semibold">Order #:</span>
                        <span>{order.orderNumber}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="font-semibold">Date:</span>
                        <span>{new Date(order.orderTime).toLocaleDateString('en-KE')}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="font-semibold">Time:</span>
                        <span>{new Date(order.orderTime).toLocaleTimeString('en-KE')}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="font-semibold">Server:</span>
                        <span>{order.waiterName}</span>
                    </div>
                </div>

                {/* Items */}
                <div className="mb-6 border-b border-dashed border-gray-300 pb-4">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left border-b border-gray-300">
                                <th className="pb-2 w-12">Qty</th>
                                <th className="pb-2">Item</th>
                                <th className="pb-2 text-right">Unit Price</th>
                                <th className="pb-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {order.items.map((item, i) => (
                                <tr key={i}>
                                    <td className="py-2 pr-2">{item.quantity} x </td>
                                    <td className="py-2 pr-2">{item.name}</td>
                                    <td className="py-2 text-right whitespace-nowrap">{formatCurrency(item.price)}</td>
                                    <td className="py-2 text-right whitespace-nowrap">{formatCurrency(item.price * item.quantity)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Totals */}
                <div className="space-y-2 mb-6 border-b border-dashed border-gray-300 pb-6">
                    <div className="flex justify-between text-sm">
                        <span>Subtotal</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                    </div>
                    <div className="text-xs text-gray-500 italic text-center">
                        *Prices include VAT
                    </div>
                    <div className="flex justify-between font-bold text-xl pt-3 border-t-2 border-gray-800 mt-3">
                        <span>GRAND TOTAL</span>
                        <span>{formatCurrency(order.totalAmount)}</span>
                    </div>
                </div>

                {/* Payment Status */}
                <div className="text-center mb-6">
                    {isPaid ? (
                        <div className="inline-block bg-emerald-100 text-emerald-800 px-6 py-2 rounded-full font-bold text-sm">
                            ✓ PAID - THANK YOU
                        </div>
                    ) : (
                        <div className="inline-block bg-yellow-100 text-yellow-800 px-6 py-2 rounded-full font-bold text-sm">
                            {paymentLabel === "UNPAID" ? "UNPAID - TO BE SETTLED" : paymentLabel}
                        </div>
                    )}
                </div>

                {/* QR Code */}
                {qrCode && (
                    <div className="text-center space-y-3">
                        <img
                            src={qrCode}
                            alt="Order QR Code"
                            className="mx-auto w-32 h-32 border-2 border-gray-200 rounded-lg"
                        />
                        <p className="text-xs text-gray-500">Scan for order details & loyalty points</p>
                    </div>
                )}

                {/* Footer */}
                <div className="text-center mt-8 pt-6 border-t border-dashed border-gray-300 text-xs text-gray-500 space-y-1">
                    <p>Thank you for choosing AM | PM</p>
                    <p>We hope to see you again soon</p>
                </div>
            </div>

            <style jsx global>{`
                @keyframes fade-in {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .animate-fade-in {
                    animation: fade-in 0.6s ease-out;
                }

                .receipt-paper {
                    box-shadow: 
                        0 1px 3px rgba(0,0,0,0.12),
                        0 1px 2px rgba(0,0,0,0.24),
                        0 10px 40px rgba(0,0,0,0.1);
                }

                @media print {
                    body { 
                        background: white !important;
                        margin: 0;
                        padding: 0;
                    }
                    .no-print { 
                        display: none !important;
                    }
                    .receipt-paper { 
                        box-shadow: none !important;
                        max-width: 80mm;
                        margin: 0 auto;
                        padding: 10mm;
                    }
                    .animate-fade-in {
                        animation: none;
                    }
                }
            `}</style>
        </div>
    );
}
