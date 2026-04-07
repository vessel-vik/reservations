"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { ShoppingBag, AlertCircle, Search } from "lucide-react";

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
}

interface ClosedOrdersModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ClosedOrdersModal({ isOpen, onClose }: ClosedOrdersModalProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [paymentFilter, setPaymentFilter] = useState<string>("all");

    useEffect(() => {
        if (isOpen) {
            void fetchClosedOrders();
        } else {
            setOrders([]);
            setMessage(null);
            setError(null);
            setSearchQuery("");
            setPaymentFilter("all");
        }
    }, [isOpen]);

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

    const fetchClosedOrders = async () => {
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
    };

    const paymentLabel = (method: any) =>
        method?.method || method?.type || method?.channel || "Payment";

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-4xl max-h-[85vh] flex flex-col">
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
                                                <div className="flex items-center justify-between text-sm text-neutral-500">
                                                    <span>Table {order.tableNumber ?? "—"}</span>
                                                    <span>{new Date(order.orderTime).toLocaleTimeString()}</span>
                                                </div>
                                            </div>

                                            <div className="p-4">
                                                <div className="space-y-2 mb-3">
                                                    {items.slice(0, 2).map((item, idx) => (
                                                        <div
                                                            key={`${order.$id}-item-${idx}-${item.$id}-${item.name}`}
                                                            className="flex justify-between items-center text-sm"
                                                        >
                                                            <span className="text-neutral-300 truncate">
                                                                {item.quantity}× {item.name}
                                                            </span>
                                                            <span className="text-emerald-400 font-medium shrink-0">
                                                                {formatCurrency(
                                                                    (item.price ?? 0) * (item.quantity ?? 1)
                                                                )}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {items.length > 2 && (
                                                        <p className="text-xs text-neutral-500">
                                                            +{items.length - 2} more items
                                                        </p>
                                                    )}
                                                </div>

                                                {order.paymentMethods && order.paymentMethods.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mb-3">
                                                        {order.paymentMethods.map((method: any, index: number) => (
                                                            <span
                                                                key={`${order.$id}-pm-${index}`}
                                                                className="text-xs rounded-full bg-white/5 text-neutral-400 px-2 py-0.5"
                                                            >
                                                                {paymentLabel(method)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

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
    );
}
