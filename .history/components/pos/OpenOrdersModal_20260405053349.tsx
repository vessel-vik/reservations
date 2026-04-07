"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Clock, ShoppingBag, AlertCircle, Edit2, Trash2, Printer } from "lucide-react";

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
    onDelete?: (order: Order) => void;
    onEdit?: (order: Order) => void;
    tableNumber?: number;
}

export function OpenOrdersModal({
    isOpen,
    onClose,
    onPrint,
    onDelete,
    onEdit,
    tableNumber,
}: OpenOrdersModalProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchOpenOrders();
        }
    }, [isOpen, tableNumber]);

    const parseOrderItems = (order: Order): OpenOrderItem[] => {
        if (!order.items) return [];
        if (typeof order.items === 'string') {
            try {
                return JSON.parse(order.items) as OpenOrderItem[];
            } catch (error) {
                console.warn('Failed to parse order items:', error);
                return [];
            }
        }
        return Array.isArray(order.items) ? order.items : [];
    };

    const fetchOpenOrders = async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (tableNumber) params.set('table', String(tableNumber));
            params.set('status', 'open');

            const response = await fetch(`/api/pos/orders?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setOrders(data.orders || []);
            }
        } catch (error) {
            console.error("Error fetching orders:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-emerald-400" />
                        Open Orders {tableNumber ? `- Table ${tableNumber}` : ""}
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="text-center py-8 text-neutral-400">
                        Loading open orders...
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-8">
                        <AlertCircle className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                        <p className="text-neutral-400">No open orders</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {orders.map((order) => (
                            <div
                                key={order.$id}
                                className={`w-full rounded-3xl border border-white/10 bg-slate-900/95 p-4 shadow-sm shadow-black/10 transition-all ${
                                    selectedOrderId === order.$id ? 'ring-1 ring-emerald-400/30' : 'hover:border-white/15'
                                }`}
                            >
                                <div className="flex flex-col gap-3 sm:items-center sm:flex-row sm:justify-between">
                                    <div className="min-w-0 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-white truncate">Order #{order.orderNumber}</p>
                                            <span className="rounded-full bg-emerald-500/10 text-emerald-300 text-[11px] px-2 py-1">Table {order.tableNumber ?? 'TBD'}</span>
                                        </div>
                                        <p className="text-xs text-slate-400">{order.customerName || 'Walk-in Customer'} • {new Date(order.orderTime).toLocaleTimeString()}</p>
                                    </div>
                                    <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                                        <span>{formatCurrency(order.totalAmount)}</span>
                                        <span className="rounded-full bg-white/5 px-2 py-1 text-neutral-300 text-xs">{order.paymentStatus || order.status}</span>
                                    </div>
                                </div>

                                <div className="mt-4 space-y-2">
                                    {parseOrderItems(order).length === 0 ? (
                                        <p className="text-xs text-slate-400">No items available</p>
                                    ) : (
                                        parseOrderItems(order).map((item) => (
                                            <div key={item.$id} className="flex flex-col gap-1 rounded-2xl bg-slate-950/80 border border-white/10 p-3">
                                                <div className="flex items-center justify-between gap-4">
                                                    <p className="text-sm font-medium text-white truncate">{item.quantity}× {item.name}</p>
                                                    <span className="text-sm font-semibold text-emerald-300">{formatCurrency(item.price * item.quantity)}</span>
                                                </div>
                                                {item.description && (
                                                    <p className="text-xs text-slate-500 line-clamp-2">{item.description}</p>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onEdit?.(order)}
                                    >
                                        <Edit2 className="w-4 h-4 mr-2" />
                                        Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onPrint?.(order)}
                                    >
                                        <Printer className="w-4 h-4 mr-2" />
                                        Print
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                                        onClick={() => onDelete?.(order)}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
