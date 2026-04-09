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
import { Clock, AlertCircle, Edit2, Printer, RefreshCw, User, Trash2 } from "lucide-react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { getOpenOrdersSummary, voidOrderValidated } from "@/lib/actions/pos.actions";
import { VOID_ORDER_CATEGORIES, type VoidOrderCategory } from "@/lib/schemas/void-order";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { client } from "@/lib/appwrite-client";
import { subscribeWithRetry } from "@/lib/realtime-subscribe";

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
    waiterName?: string;
    totalAmount: number;
    orderTime: string;
    status: string;
    paymentStatus?: string;
    isDeleted?: boolean;
    waiterId?: string;
    paymentMethods?: Array<{ method?: string; amount?: number; reference?: string }>;
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
    const { user, isLoaded: userLoaded } = useUser();
    const isAdmin = membership?.role === "org:admin";

    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [voidTarget, setVoidTarget] = useState<Order | null>(null);
    const [voidCategory, setVoidCategory] = useState<VoidOrderCategory>("CUSTOMER_WALK_OUT");
    const [voidReason, setVoidReason] = useState("");
    const [voidSubmitting, setVoidSubmitting] = useState(false);

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
            if (!isAdmin && (!userLoaded || !user?.id)) {
                setOrders([]);
                return;
            }
            // Admins see all orders; waiters (org:member) see only their own
            const opts = (!isAdmin && user?.id) ? { waiterId: user.id } : undefined;
            const summary = await getOpenOrdersSummary(opts);

            // Map OpenOrder to local Order shape; optionally filter by tableNumber prop
            let result: Order[] = summary.orders.map((o) => ({
                $id: o.$id,
                orderNumber: o.orderNumber,
                tableNumber: o.tableNumber,
                customerName: o.customerName,
                waiterId: o.waiterId,
                waiterName: o.waiterName,
                totalAmount: o.totalAmount,
                orderTime: o.orderTime,
                status: "active",
                paymentStatus: o.paymentStatus,
                isDeleted: (o as any).isDeleted,
                items: o.items as OpenOrderItem[],
            }));

            // Keep Open Orders strictly unpaid + not deleted (extra guard against stale or mixed records).
            result = result.filter((o) => !o.isDeleted && String(o.paymentStatus || "unpaid") === "unpaid");

            if (tableNumber != null) {
                result = result.filter((o) => o.tableNumber === tableNumber);
            }

            setOrders(result);
        } catch (error) {
            console.error("Error fetching orders:", error);
        } finally {
            setIsLoading(false);
        }
    }, [tableNumber, isAdmin, user?.id, userLoaded]);

    useEffect(() => {
        if (isOpen) {
            void fetchOpenOrders();
        }
    }, [isOpen, fetchOpenOrders]);

    // Live refresh while modal is open so paid/settled orders disappear immediately.
    useEffect(() => {
        if (!isOpen) return;
        const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
        const ordersCollectionId = process.env.NEXT_PUBLIC_ORDERS_COLLECTION_ID;
        if (!databaseId || !ordersCollectionId) return;
        const unsub = subscribeWithRetry(
            () =>
                client.subscribe(
                    `databases.${databaseId}.collections.${ordersCollectionId}.documents`,
                    (response: { events?: string[] }) => {
                        const ev = response.events || [];
                        const changed =
                            ev.some((x) => x.includes(".update")) ||
                            ev.some((x) => x.includes(".create")) ||
                            ev.some((x) => x.includes(".delete"));
                        if (changed) void fetchOpenOrders();
                    }
                ),
            { maxAttempts: 5, initialDelayMs: 120 }
        );
        return () => unsub();
    }, [isOpen, fetchOpenOrders]);

    const submitVoid = async () => {
        if (!voidTarget) return;
        setVoidSubmitting(true);
        try {
            await voidOrderValidated({
                orderId: voidTarget.$id,
                voidCategory,
                reason: voidReason,
            });
            toast.success("Order voided");
            setVoidTarget(null);
            setVoidReason("");
            await fetchOpenOrders();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Void failed");
        } finally {
            setVoidSubmitting(false);
        }
    };

    return (
        <>
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

                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => onEdit?.(order)}
                                            className="flex-1 min-w-[120px] h-10 bg-neutral-950 border-2 border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400"
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
                                        {isAdmin && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => {
                                                    setVoidTarget(order);
                                                    setVoidCategory("CUSTOMER_WALK_OUT");
                                                    setVoidReason("");
                                                }}
                                                className="h-10 px-3 bg-rose-950/80 border border-rose-500/40 text-rose-200 hover:bg-rose-900/80 shrink-0"
                                            >
                                                <Trash2 className="w-4 h-4 mr-1" />
                                                Void
                                            </Button>
                                        )}
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

        <Dialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle>Void order</DialogTitle>
                    <DialogDescription className="text-neutral-400">
                        Admin only — requires category and a reason (min. 15 characters).
                    </DialogDescription>
                </DialogHeader>
                {voidTarget && (
                    <div className="space-y-3">
                        <p className="text-sm text-neutral-300">
                            #{voidTarget.orderNumber} · {formatCurrency(voidTarget.totalAmount)}
                        </p>
                        <div>
                            <label className="text-xs text-neutral-500 block mb-1">Category</label>
                            <select
                                value={voidCategory}
                                onChange={(e) => setVoidCategory(e.target.value as VoidOrderCategory)}
                                className="w-full rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm text-white"
                            >
                                {VOID_ORDER_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c.replace(/_/g, " ")}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-neutral-500 block mb-1">Reason (15+ chars)</label>
                            <Textarea
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="Describe why this order is being voided…"
                                className="bg-neutral-900 border-white/10 text-white min-h-[100px]"
                            />
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-white/15"
                                onClick={() => setVoidTarget(null)}
                                disabled={voidSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={voidSubmitting || voidReason.trim().length < 15}
                                onClick={() => void submitVoid()}
                            >
                                {voidSubmitting ? "Voiding…" : "Confirm void"}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
        </>
    );
}
