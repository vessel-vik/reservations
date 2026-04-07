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
import { Clock, ShoppingBag, AlertCircle, Edit2, Trash2, Printer, ChevronDown, AlertTriangle, Search, Filter } from "lucide-react";

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
}

export function ClosedOrdersModal({
    isOpen,
    onClose,
    onPrint,
    onEdit,
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

    // Search and filter state
    const [searchQuery, setSearchQuery] = useState("");
    const [paymentFilter, setPaymentFilter] = useState<string>("all"); // all, paid, settled

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
            // Reset search and filter
            setSearchQuery("");
            setPaymentFilter("all");
        }
    }, [isOpen]);

    // Filter orders based on search and payment status
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
                ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-12 flex-1 flex flex-col items-center justify-center">
                        <AlertCircle className="w-12 h-12 text-neutral-600 mb-3" />
                        <p className="text-neutral-400">
                            {orders.length === 0 ? "No closed orders found." : "No orders match your search criteria."}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Search and Filter Controls */}
                        <div className="shrink-0 space-y-3 pb-4 border-b border-white/10">
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500" />
                                    <Input
                                        placeholder="Search by order number, customer name, or table..."
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
                                        className={paymentFilter === "all" ? "bg-sky-600 text-white" : "border-white/10 text-neutral-300"}
                                    >
                                        All
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={paymentFilter === "paid" ? "default" : "outline"}
                                        onClick={() => setPaymentFilter("paid")}
                                        className={paymentFilter === "paid" ? "bg-emerald-600 text-white" : "border-white/10 text-neutral-300"}
                                    >
                                        Paid
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={paymentFilter === "settled" ? "default" : "outline"}
                                        onClick={() => setPaymentFilter("settled")}
                                        className={paymentFilter === "settled" ? "bg-amber-600 text-white" : "border-white/10 text-neutral-300"}
                                    >
                                        Settled
                                    </Button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-sm text-neutral-400">
                                <span>Showing {filteredOrders.length} of {orders.length} orders</span>
                                {(searchQuery || paymentFilter !== "all") && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setSearchQuery("");
                                            setPaymentFilter("all");
                                        }}
                                        className="text-neutral-400 hover:text-white"
                                    >
                                        Clear filters
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Orders Grid */}
                        <div className="flex-1 overflow-y-auto min-h-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-2">
                                {filteredOrders.map((order) => {
                                    const items = parseOrderItems(order);
                                    const paymentBadge = order.paymentStatus === "settled" ? "Settled" : "Paid";
                                    const paymentBadgeColor = order.paymentStatus === "settled"
                                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";

                                    return (
                                        <div key={order.$id} className="rounded-2xl border border-white/10 bg-slate-900/50 transition-all hover:border-white/20 hover:shadow-lg">
                                            {/* Order Header */}
                                            <div className="p-4 border-b border-white/5">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div>
                                                        <p className="text-lg font-bold text-white">#{order.orderNumber}</p>
                                                        <p className="text-sm text-neutral-400">{order.customerName || 'Walk-in Customer'}</p>
                                                    </div>
                                                    <span className={`text-xs rounded-full px-2 py-1 border ${paymentBadgeColor}`}>
                                                        {paymentBadge}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-neutral-500">Table {order.tableNumber ?? 'TBD'}</span>
                                                    <span className="text-sm text-neutral-500">{new Date(order.orderTime).toLocaleTimeString()}</span>
                                                </div>
                                            </div>

                                            {/* Order Items Preview */}
                                            <div className="p-4">
                                                <div className="space-y-2 mb-3">
                                                    {items.slice(0, 2).map((item) => (
                                                        <div key={item.$id} className="flex justify-between items-center text-sm">
                                                            <span className="text-neutral-300 truncate">{item.quantity}× {item.name}</span>
                                                            <span className="text-emerald-400 font-medium">{formatCurrency((item.price ?? 0) * (item.quantity ?? 1))}</span>
                                                        </div>
                                                    ))}
                                                    {items.length > 2 && (
                                                        <p className="text-xs text-neutral-500">+{items.length - 2} more items</p>
                                                    )}
                                                </div>

                                                {/* Payment Methods */}
                                                {order.paymentMethods && order.paymentMethods.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mb-3">
                                                        {order.paymentMethods.map((method: any, index: number) => (
                                                            <span key={index} className="text-xs rounded-full bg-white/5 text-neutral-400 px-2 py-0.5">
                                                                {method.type || 'Unknown'}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Total and Actions */}
                                                <div className="space-y-3">
                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-emerald-400">{formatCurrency(order.totalAmount)}</p>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => onEdit?.(order)}
                                                            className="bg-emerald-600 text-white hover:bg-emerald-500 border border-emerald-500/30 text-xs"
                                                        >
                                                            <Edit2 className="w-3 h-3 mr-1" />
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => onPrint?.(order)}
                                                            className="bg-amber-600 text-white hover:bg-amber-500 border border-amber-500/30 text-xs"
                                                        >
                                                            <Printer className="w-3 h-3 mr-1" />
                                                            Print
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleDeleteOrder(order)}
                                                            className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs"
                                                        >
                                                            <Trash2 className="w-3 h-3 mr-1" />
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Messages and Close Button */}
                        {(message || error) && (
                            <div className={`mt-4 rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-100'}`}>
                                {error ?? message}
                            </div>
                        )}

                        <div className="shrink-0 flex gap-3 justify-end pt-4 border-t border-white/10">
                            <Button variant="outline" onClick={onClose}>Close</Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-rose-400">
                        <AlertTriangle className="w-5 h-5" />
                        Confirm Order Deletion
                    </DialogTitle>
                    <DialogDescription className="text-neutral-300">
                        This action cannot be undone. The order will be marked as deleted and moved to the audit log.
                    </DialogDescription>
                </DialogHeader>

                {orderToDelete && (
                    <div className="space-y-4">
                        <div className="bg-slate-900/50 rounded-lg p-3 border border-white/5">
                            <p className="text-sm text-neutral-400 mb-1">Order Details</p>
                            <p className="font-semibold">Order #{orderToDelete.orderNumber}</p>
                            <p className="text-sm text-neutral-500">
                                {orderToDelete.customerName || 'Walk-in Customer'} • {formatCurrency(orderToDelete.totalAmount)}
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <Label htmlFor="orderCode" className="text-sm font-medium text-neutral-300">
                                    Confirm Order Code *
                                </Label>
                                <Input
                                    id="orderCode"
                                    type="text"
                                    placeholder={`Enter ${orderToDelete.orderNumber}`}
                                    value={orderCodeInput}
                                    onChange={(e) => setOrderCodeInput(e.target.value)}
                                    className="mt-1 bg-slate-900/50 border-white/10 text-white placeholder:text-neutral-500"
                                />
                                <p className="text-xs text-neutral-500 mt-1">
                                    Enter the exact order number to confirm deletion
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="deletionReason" className="text-sm font-medium text-neutral-300">
                                    Reason for Deletion (Optional)
                                </Label>
                                <Input
                                    id="deletionReason"
                                    type="text"
                                    placeholder="e.g., Customer request, Duplicate order, etc."
                                    value={deletionReason}
                                    onChange={(e) => setDeletionReason(e.target.value)}
                                    className="mt-1 bg-slate-900/50 border-white/10 text-white placeholder:text-neutral-500"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                                <p className="text-sm text-rose-200">{error}</p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4">
                            <Button
                                variant="outline"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1"
                                disabled={isDeleting}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={confirmDeleteOrder}
                                className="flex-1 bg-rose-600 text-white hover:bg-rose-500 border border-rose-500/30"
                                disabled={isDeleting || !orderCodeInput.trim()}
                            >
                                {isDeleting ? "Deleting..." : "Delete Order"}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
