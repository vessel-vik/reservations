"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { Clock, ShoppingBag, AlertCircle, Edit2, Trash2, Printer, ChevronDown, AlertTriangle } from "lucide-react";

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
    onPrint?: (order: Order) => void;
    onEdit?: (order: Order) => void;
    onDeleteOrder?: (order: Order) => void;
}

export function ClosedOrdersModal({
    isOpen,
    onClose,
    onPrint,
    onEdit,
    onDeleteOrder,
}: ClosedOrdersModalProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Delete confirmation modal state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
    const [orderCodeInput, setOrderCodeInput] = useState("");
    const [deletionReason, setDeletionReason] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchClosedOrders();
        } else {
            setOrders([]);
            setExpandedOrderId(null);
            setMessage(null);
            setError(null);
            // Reset delete confirmation state
            setShowDeleteConfirm(false);
            setOrderToDelete(null);
            setOrderCodeInput("");
            setDeletionReason("");
            setIsDeleting(false);
        }
    }, [isOpen]);

    const parseOrderItems = (order: Order) => {
        if (!order.items) return [];
        if (typeof order.items === "string") {
            try {
                return JSON.parse(order.items) as ClosedOrderItem[];
            } catch (err) {
                console.warn("Failed to parse order items:", err);
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

    const handleDeleteOrder = (order: Order) => {
        setOrderToDelete(order);
        setOrderCodeInput("");
        setDeletionReason("");
        setShowDeleteConfirm(true);
    };

    const confirmDeleteOrder = async () => {
        if (!orderToDelete) return;

        // Validate order code
        if (orderCodeInput !== orderToDelete.orderNumber) {
            setError("Order code does not match. Please enter the correct order number.");
            return;
        }

        try {
            setIsDeleting(true);
            setError(null);

            const reason = deletionReason.trim() || "Order deleted by staff";

            const response = await fetch(`/api/pos/orders?orderId=${orderToDelete.$id}&reason=${encodeURIComponent(reason)}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to delete order");
            }

            setMessage(`Order #${orderToDelete.orderNumber} has been deleted successfully.`);
            setOrders((prev) => prev.filter((order) => order.$id !== orderToDelete.$id));
            setShowDeleteConfirm(false);
            setOrderToDelete(null);
        } catch (err) {
            console.error("Error deleting order:", err);
            setError(err instanceof Error ? err.message : "Failed to delete order");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRemoveItem = async (order: Order, itemId: string) => {
        try {
            setError(null);
            setMessage(null);
            const items = parseOrderItems(order);
            const updatedItems = items.filter((item) => item.$id !== itemId);
            const totalAmount = updatedItems.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0);

            if (updatedItems.length === 0) {
                const response = await fetch(`/api/pos/orders?orderId=${order.$id}`, {
                    method: "DELETE",
                });
                if (!response.ok) throw new Error("Failed to delete empty order");
                setMessage("Order removed after last item was deleted.");
                setOrders((prev) => prev.filter((current) => current.$id !== order.$id));
                return;
            }

            const response = await fetch(`/api/pos/orders`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: order.$id,
                    data: {
                        items: updatedItems,
                        subtotal: totalAmount,
                        totalAmount,
                    },
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || "Failed to update order items");
            }

            setOrders((prev) =>
                prev.map((current) =>
                    current.$id === order.$id
                        ? { ...current, items: updatedItems, totalAmount }
                        : current
                )
            );
            setMessage("Item removed from closed order successfully.");
        } catch (err) {
            console.error("Failed to remove item from closed order:", err);
            setError(err instanceof Error ? err.message : "Failed to remove item");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-sky-400" />
                        Closed Orders
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="text-center py-12 text-neutral-400 flex-1 flex items-center justify-center">
                        <div>Loading closed orders...</div>
                    </div>
                ) : error ? (
                    <div className="text-center py-12 text-red-400 flex-1 flex items-center justify-center">
                        <p>{error}</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-12 flex-1 flex flex-col items-center justify-center">
                        <AlertCircle className="w-12 h-12 text-neutral-600 mb-3" />
                        <p className="text-neutral-400">No closed orders found.</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-2">
                        {orders.map((order) => {
                            const items = parseOrderItems(order);
                            const isExpanded = expandedOrderId === order.$id;
                            const paymentBadge = order.paymentStatus === "settled" ? "Settled" : "Paid";

                            return (
                                <div key={order.$id} className="w-full rounded-2xl border border-white/10 bg-slate-900/50 transition-all hover:border-white/20">
                                    <button
                                        onClick={() => toggleOrderExpanded(order.$id)}
                                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <p className="text-sm font-semibold text-white truncate">Order #{order.orderNumber}</p>
                                                <span className="text-xs rounded-full bg-sky-500/15 text-sky-300 px-2 py-0.5 whitespace-nowrap">Table {order.tableNumber ?? 'TBD'}</span>
                                                <span className="text-xs rounded-full bg-white/5 text-neutral-400 px-2 py-0.5 whitespace-nowrap">{paymentBadge}</span>
                                            </div>
                                            <p className="text-xs text-neutral-500">{order.customerName || 'Walk-in Customer'} • {new Date(order.orderTime).toLocaleTimeString()}</p>
                                        </div>

                                        <div className="flex items-center gap-3 ml-4 shrink-0 text-right">
                                            <div>
                                                <p className="text-lg font-bold text-emerald-400">{formatCurrency(order.totalAmount)}</p>
                                                <p className="text-xs text-neutral-400">{String(order.paymentMethods?.length ?? 0)} payment method(s)</p>
                                            </div>
                                            <ChevronDown className={`w-5 h-5 text-neutral-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <>
                                            <div className="border-t border-white/5" />
                                            <div className="px-4 py-3">
                                                {items.length === 0 ? (
                                                    <p className="text-xs text-neutral-500 py-2">No items available for this order.</p>
                                                ) : (
                                                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                                                        {items.map((item) => (
                                                            <div key={item.$id} className="flex items-start justify-between gap-3 text-sm p-2 rounded-lg bg-slate-950/50 hover:bg-slate-950/80 transition-colors">
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-white font-medium">{item.quantity}× {item.name}</p>
                                                                    {item.description && <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">{item.description}</p>}
                                                                </div>
                                                                <div className="text-right whitespace-nowrap shrink-0">
                                                                    <p className="font-semibold text-emerald-400">{formatCurrency((item.price ?? 0) * (item.quantity ?? 1))}</p>
                                                                    <p className="text-xs text-neutral-500">{formatCurrency(item.price)} ea</p>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="mt-2 text-rose-300 border-rose-500/20 hover:bg-rose-500/10"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleRemoveItem(order, item.$id);
                                                                        }}
                                                                    >
                                                                        Remove
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="border-t border-white/5" />
                                            <div className="px-4 py-3 bg-slate-900/30 rounded-b-2xl flex flex-wrap gap-2">
                                                <Button size="sm" onClick={() => onEdit?.(order)} className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500/30">
                                                    <Edit2 className="w-4 h-4 mr-2" />
                                                    Edit
                                                </Button>
                                                <Button size="sm" onClick={() => onPrint?.(order)} className="flex-1 max-w-[148px] bg-amber-600 text-white hover:bg-amber-500 border border-amber-500/30">
                                                    <Printer className="w-4 h-4 mr-2" />
                                                    Print
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="flex-1 max-w-[148px] border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                                                    onClick={() => handleDeleteOrder(order)}
                                                >
                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {(message || error) && (
                    <div className={`mt-4 rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-100'}`}>
                        {error ?? message}
                    </div>
                )}

                <div className="shrink-0 flex gap-3 justify-end pt-4 border-t border-white/10">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
