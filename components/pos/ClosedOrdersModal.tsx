"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { formatPaymentMethodEntry } from "@/lib/payment-display";
import { extractBankPaybillConfirmation } from "@/lib/payment-realtime";
import { ShoppingBag, AlertCircle, Search, ListTree } from "lucide-react";
import { client } from "@/lib/appwrite-client";
import { subscribeWithRetry } from "@/lib/realtime-subscribe";

const RT_DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID!;
const RT_ORDERS_COLLECTION_ID = process.env.NEXT_PUBLIC_ORDERS_COLLECTION_ID!;

function safeOrderDateTime(iso?: string | null): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

interface ClosedOrderItem {
    $id: string;
    name: string;
    description?: string;
    quantity: number;
    price: number;
}

interface Order {
    $id: string;
    orderNumber: string;
    tableNumber?: number;
    customerName?: string;
    totalAmount: number;
    orderTime: string;
    status: string;
    paymentStatus?: string;
    paymentMethods?: any[];
    items?: ClosedOrderItem[] | string;
    $updatedAt?: string;
}

interface ClosedOrdersModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialSearchQuery?: string;
}

type PaymentTimelineEvent = {
    at: string;
    type: "callback_received" | "reconcile_checked" | "settled" | "receipt_generated";
    title: string;
    detail: string;
    sourceId?: string;
};

export function ClosedOrdersModal({ isOpen, onClose, initialSearchQuery }: ClosedOrdersModalProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [paymentFilter, setPaymentFilter] = useState<string>("all");
    const [timelineOrder, setTimelineOrder] = useState<Order | null>(null);
    const [timelineEvents, setTimelineEvents] = useState<PaymentTimelineEvent[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [timelineError, setTimelineError] = useState<string | null>(null);
    const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchClosedOrders = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            setMessage(null);
            const response = await fetch(`/api/pos/orders?status=closed`);
            if (!response.ok) {
                throw new Error("Failed to load closed orders");
            }
            const data = await response.json();
            setOrders(data.orders || []);
        } catch (err) {
            console.error("Error fetching closed orders:", err);
            setError(err instanceof Error ? err.message : "Unable to load closed orders");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            setSearchQuery(String(initialSearchQuery || ""));
            void fetchClosedOrders();
        } else {
            setOrders([]);
            setMessage(null);
            setError(null);
            setSearchQuery("");
            setPaymentFilter("all");
        }
    }, [isOpen, fetchClosedOrders, initialSearchQuery]);

    // Realtime: new paid/settled orders refresh the audit list
    useEffect(() => {
        if (!isOpen || !RT_DATABASE_ID || !RT_ORDERS_COLLECTION_ID) return;

        const channel = `databases.${RT_DATABASE_ID}.collections.${RT_ORDERS_COLLECTION_ID}.documents`;
        const unsubscribe = subscribeWithRetry(
            () =>
                client.subscribe(channel, () => {
                    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
                    refreshDebounceRef.current = setTimeout(() => {
                        void fetchClosedOrders();
                    }, 450);
                }),
            { maxAttempts: 5, initialDelayMs: 120 }
        );

        return () => {
            unsubscribe();
            if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
        };
    }, [isOpen, fetchClosedOrders]);

    const filteredOrders = orders.filter((order) => {
        const matchesSearch =
            searchQuery === "" ||
            order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (order.customerName && order.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (order.tableNumber && order.tableNumber.toString().includes(searchQuery));

        const matchesPayment =
            paymentFilter === "all" ||
            (paymentFilter === "paid" && order.paymentStatus === "paid") ||
            (paymentFilter === "settled" && order.paymentStatus === "settled");

        return matchesSearch && matchesPayment;
    });

    const parseOrderItems = (order: Order) => {
        if (!order.items) return [];
        if (typeof order.items === "string") {
            try {
                return JSON.parse(order.items) as ClosedOrderItem[];
            } catch {
                return [];
            }
        }
        return Array.isArray(order.items) ? order.items : [];
    };

    const paymentLabel = (method: any) =>
        formatPaymentMethodEntry({
            method: method?.method ?? method?.type ?? method?.channel,
            amount: typeof method?.amount === "number" ? method.amount : undefined,
            reference: method?.reference,
        });

    const openTimeline = async (order: Order) => {
        setTimelineOrder(order);
        setTimelineEvents([]);
        setTimelineError(null);
        setTimelineLoading(true);
        try {
            const response = await fetch(`/api/payments/timeline?orderId=${encodeURIComponent(order.$id)}`, {
                method: "GET",
                credentials: "same-origin",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "Failed to load payment timeline");
            }
            setTimelineEvents(Array.isArray(data?.events) ? data.events : []);
        } catch (err) {
            setTimelineError(err instanceof Error ? err.message : "Failed to load payment timeline");
        } finally {
            setTimelineLoading(false);
        }
    };

    return (
        <>
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-6xl max-h-[85vh] flex flex-col">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-sky-400" />
                        Closed Orders
                    </DialogTitle>
                    <p className="text-sm text-neutral-400">
                        Paid and settled orders — read-only for audit. Staff cannot change history from here.
                    </p>
                </DialogHeader>

                {isLoading ? (
                    <div className="text-center py-12 text-neutral-400 flex-1 flex items-center justify-center">
                        Loading closed orders…
                    </div>
                ) : error ? (
                    <div className="text-center py-12 text-red-400 flex-1 flex items-center justify-center">
                        <p>{error}</p>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-12 flex-1 flex flex-col items-center justify-center">
                        <AlertCircle className="w-12 h-12 text-neutral-600 mb-3" />
                        <p className="text-neutral-400">
                            {orders.length === 0 ? "No closed orders found." : "No orders match your search."}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="shrink-0 space-y-3 pb-4 border-b border-white/10">
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" />
                                    <Input
                                        placeholder="Search by order, customer, or table…"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-10 bg-slate-900/50 border-white/10 text-white placeholder:text-neutral-500"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant={paymentFilter === "all" ? "default" : "outline"}
                                        onClick={() => setPaymentFilter("all")}
                                        className={
                                            paymentFilter === "all"
                                                ? "bg-sky-600 text-white"
                                                : "border-white/10 text-neutral-300"
                                        }
                                    >
                                        All
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={paymentFilter === "paid" ? "default" : "outline"}
                                        onClick={() => setPaymentFilter("paid")}
                                        className={
                                            paymentFilter === "paid"
                                                ? "bg-emerald-600 text-white"
                                                : "border-white/10 text-neutral-300"
                                        }
                                    >
                                        Paid
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={paymentFilter === "settled" ? "default" : "outline"}
                                        onClick={() => setPaymentFilter("settled")}
                                        className={
                                            paymentFilter === "settled"
                                                ? "bg-amber-600 text-white"
                                                : "border-white/10 text-neutral-300"
                                        }
                                    >
                                        Settled
                                    </Button>
                                </div>
                            </div>
                            <p className="text-sm text-neutral-500">
                                Showing {filteredOrders.length} of {orders.length} orders
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-2">
                                {filteredOrders.map((order) => {
                                    const items = parseOrderItems(order);
                                    const paymentBadge = order.paymentStatus === "settled" ? "Settled" : "Paid";
                                    const paymentBadgeColor =
                                        order.paymentStatus === "settled"
                                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
                                    const bankConfirmation = extractBankPaybillConfirmation({
                                        paymentStatus: order.paymentStatus,
                                        paymentMethods: order.paymentMethods,
                                        $updatedAt: order.$updatedAt || order.orderTime,
                                    });

                                    return (
                                        <div
                                            key={order.$id}
                                            className="rounded-2xl border border-white/10 bg-slate-900/50 transition-all hover:border-white/20"
                                        >
                                            <div className="p-4 border-b border-white/5">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div>
                                                        <p className="text-lg font-bold text-white">
                                                            #{order.orderNumber}
                                                        </p>
                                                        <p className="text-sm text-neutral-400">
                                                            {order.customerName || "Walk-in Customer"}
                                                        </p>
                                                    </div>
                                                    <span
                                                        className={`text-xs rounded-full px-2 py-1 border ${paymentBadgeColor}`}
                                                    >
                                                        {paymentBadge}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm text-neutral-500 gap-2">
                                                    <span>Table {order.tableNumber ?? "—"}</span>
                                                    <span className="shrink-0 tabular-nums">
                                                        {safeOrderDateTime(order.orderTime)}
                                                    </span>
                                                </div>
                                                {bankConfirmation && (
                                                    <div className="mt-2 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-200">
                                                        Bank confirmed · {formatCurrency(bankConfirmation.amount)} · {bankConfirmation.reference}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-4">
                                                <div className="mb-3 max-h-40 overflow-y-auto overscroll-contain rounded-lg border border-white/5 bg-black/20 px-2 py-2 space-y-1.5">
                                                    {items.length === 0 ? (
                                                        <p className="text-xs text-neutral-500">No line items</p>
                                                    ) : (
                                                        items.map((item, idx) => (
                                                            <div
                                                                key={`${order.$id}-item-${idx}-${item.$id ?? idx}-${item.name}`}
                                                                className="flex justify-between items-start gap-2 text-sm min-w-0"
                                                            >
                                                                <span className="text-neutral-300 break-words min-w-0 flex-1 leading-snug">
                                                                    {item.quantity}× {item.name}
                                                                </span>
                                                                <span className="text-emerald-400 font-medium shrink-0 tabular-nums">
                                                                    {formatCurrency(
                                                                        (item.price ?? 0) * (item.quantity ?? 1)
                                                                    )}
                                                                </span>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>

                                                {order.paymentMethods && order.paymentMethods.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mb-3">
                                                        {order.paymentMethods.map((method: any, index: number) => (
                                                            <span
                                                                key={`${order.$id}-pm-${index}`}
                                                                className="text-xs rounded-full bg-white/5 text-neutral-400 px-2 py-0.5"
                                                                title={method?.reference ? `Ref: ${method.reference}` : undefined}
                                                            >
                                                                {paymentLabel(method)}
                                                                {method?.reference ? ` · ${String(method.reference).slice(0, 14)}` : ""}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="mb-3">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void openTimeline(order)}
                                                        className="h-8 border-white/15 text-neutral-300 hover:bg-white/5"
                                                    >
                                                        <ListTree className="w-4 h-4 mr-1.5" />
                                                        Payment timeline
                                                    </Button>
                                                </div>

                                                <p className="text-center text-2xl font-bold text-emerald-400">
                                                    {formatCurrency(order.totalAmount)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {(message || error) && (
                            <div
                                className={`rounded-lg p-3 text-sm ${
                                    error
                                        ? "bg-rose-500/10 border border-rose-500/30 text-rose-200"
                                        : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-100"
                                }`}
                            >
                                {error ?? message}
                            </div>
                        )}

                        <div className="shrink-0 flex gap-3 justify-end pt-4 border-t border-white/10">
                            <Button variant="outline" onClick={onClose}>
                                Close
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>

        <Dialog open={!!timelineOrder} onOpenChange={(open) => !open && setTimelineOrder(null)}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-2xl max-h-[80vh]">
                <DialogHeader className="shrink-0">
                    <DialogTitle>
                        Payment Timeline {timelineOrder ? `#${timelineOrder.orderNumber}` : ""}
                    </DialogTitle>
                    <p className="text-sm text-neutral-400">
                        Callback {"->"} reconcile {"->"} settle {"->"} receipt events for dispute resolution.
                    </p>
                </DialogHeader>

                <div className="overflow-y-auto min-h-0 max-h-[56vh] pr-1">
                    {timelineLoading ? (
                        <p className="text-sm text-neutral-400 py-6">Loading timeline...</p>
                    ) : timelineError ? (
                        <p className="text-sm text-rose-300 py-6">{timelineError}</p>
                    ) : timelineEvents.length === 0 ? (
                        <p className="text-sm text-neutral-500 py-6">No timeline events found for this order.</p>
                    ) : (
                        <div className="space-y-3">
                            {timelineEvents.map((event, idx) => (
                                <div
                                    key={`${event.type}-${event.at}-${event.sourceId || idx}`}
                                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold text-white">{event.title}</p>
                                        <span className="text-[11px] text-neutral-500 shrink-0">
                                            {safeOrderDateTime(event.at)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-neutral-300 mt-1">{event.detail}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-2 border-t border-white/10">
                    <Button variant="outline" onClick={() => setTimelineOrder(null)}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
        </>
    );
}
