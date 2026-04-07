"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Clock, AlertCircle, Edit2, Printer, RefreshCw, User } from "lucide-react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { getOpenOrdersSummary } from "@/lib/actions/pos.actions";

interface OpenOrderItem {
    $id: string;
    name: string;
    description?: string;
    quantity: number;
    price: number;
    imageUrl?: string;
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
    items?: OpenOrderItem[] | string;
}

interface OpenOrdersModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPrint?: (order: Order) => void;
    onEdit?: (order: Order) => void;
    tableNumber?: number;
}

export function OpenOrdersModal({
    isOpen,
    onClose,
    onPrint,
    onEdit,
    tableNumber,
}: OpenOrdersModalProps) {
    const { membership } = useOrganization();
    const { user } = useUser();
    const isAdmin = membership?.role === "org:admin";

    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const parseOrderItems = (order: Order): OpenOrderItem[] => {
        if (!order.items) return [];
        if (typeof order.items === "string") {
            try {
                return JSON.parse(order.items) as OpenOrderItem[];
            } catch {
                return [];
            }
        }
        return Array.isArray(order.items) ? order.items : [];
    };

    const fetchOpenOrders = useCallback(async () => {
        try {
            setIsLoading(true);
            // Admins see all orders; waiters (org:member) see only their own
            const opts = (!isAdmin && user?.id) ? { waiterId: user.id } : undefined;
            const summary = await getOpenOrdersSummary(opts);

            // Map OpenOrder to local Order shape; optionally filter by tableNumber prop
            let result: Order[] = summary.orders.map((o) => ({
                $id: o.$id,
                orderNumber: o.orderNumber,
                tableNumber: o.tableNumber,
                customerName: o.customerName,
                totalAmount: o.totalAmount,
                orderTime: o.orderTime,
                status: "active",
                paymentStatus: o.paymentStatus,
                items: o.items as OpenOrderItem[],
            }));

            if (tableNumber != null) {
                result = result.filter((o) => o.tableNumber === tableNumber);
            }

            setOrders(result);
        } catch (error) {
            console.error("Error fetching orders:", error);
        } finally {
            setIsLoading(false);
        }
    }, [tableNumber, isAdmin, user?.id]);

    useEffect(() => {
        if (isOpen) {
            void fetchOpenOrders();
        }
    }, [isOpen, fetchOpenOrders]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden sm:max-w-lg">
                <DialogHeader className="shrink-0 px-6 pt-6 pb-2 pr-14">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <DialogTitle className="text-xl font-bold text-white tracking-tight">
                                My Open Orders
                            </DialogTitle>
                            <DialogDescription className="text-neutral-400 text-sm mt-1.5 leading-snug">
                                Your unpaid tabs — edit or print a captain docket for any order.
                            </DialogDescription>
                        </div>
                        <button
                            type="button"
                            onClick={() => void fetchOpenOrders()}
                            disabled={isLoading}
                            className="shrink-0 mt-1 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                            aria-label="Refresh orders"
                        >
                            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0 space-y-4">
                    {isLoading ? (
                        <div className="text-center py-16 text-neutral-400 text-sm">Loading open orders…</div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-16 flex flex-col items-center">
                            <AlertCircle className="w-12 h-12 text-neutral-600 mb-3" />
                            <p className="text-neutral-400 text-sm">No open orders</p>
                        </div>
                    ) : (
                        orders.map((order) => {
                            const items = parseOrderItems(order);
                            const preview = items.slice(0, 4);
                            const more = Math.max(0, items.length - 4);

                            return (
                                <div
                                    key={order.$id}
                                    className="rounded-2xl border border-white/10 bg-neutral-900/80 p-4 shadow-sm"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                                            <span className="font-bold text-white text-sm truncate">
                                                # {order.orderNumber}
                                            </span>
                                            <span className="text-xs font-medium rounded-full border border-amber-500/50 text-amber-300 px-2.5 py-0.5 whitespace-nowrap">
                                                Table {order.tableNumber ?? "—"}
                                            </span>
                                        </div>
                                        <p className="text-lg font-bold text-emerald-400 tabular-nums whitespace-nowrap">
                                            {formatCurrency(order.totalAmount)}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 mb-3">
                                        <span className="inline-flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 opacity-70" />
                                            {order.customerName || "Walk-in Customer"}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5 opacity-70" />
                                            {new Date(order.orderTime).toLocaleString("en-KE", {
                                                day: "2-digit",
                                                month: "short",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        {preview.map((item, idx) => (
                                            <div
                                                key={`${order.$id}-${idx}-${item.$id}-${item.name}`}
                                                className="flex justify-between gap-3 text-sm"
                                            >
                                                <span className="text-neutral-300 truncate">
                                                    {item.quantity}× {item.name}
                                                </span>
                                                <span className="text-emerald-400 font-medium shrink-0 tabular-nums">
                                                    {formatCurrency((item.price ?? 0) * (item.quantity ?? 1))}
                                                </span>
                                            </div>
                                        ))}
                                        {more > 0 && (
                                            <p className="text-xs text-neutral-500">+{more} more items</p>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => onEdit?.(order)}
                                            className="flex-1 h-10 bg-neutral-950 border-2 border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400"
                                        >
                                            <Edit2 className="w-4 h-4 mr-2" />
                                            Edit Order
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => onPrint?.(order)}
                                            className="h-10 px-4 bg-neutral-950 border-2 border-amber-600/50 text-amber-400 hover:bg-amber-500/10 shrink-0"
                                        >
                                            <Printer className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="shrink-0 border-t border-white/10 px-6 py-4 flex justify-end">
                    <Button variant="outline" onClick={onClose} className="border-white/15">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
