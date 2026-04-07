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
    onSelectOrder?: (order: Order) => void;
    onPrint?: (order: Order) => void;
    onDelete?: (order: Order) => void;
    onEdit?: (order: Order) => void;
    tableNumber?: number;
}

export function OpenOrdersModal({
    isOpen,
    onClose,
    onSelectOrder,
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

    const handleSelectOrder = (order: Order) => {
        setSelectedOrderId(order.$id);
        onSelectOrder?.(order);
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
                                className={`w-full rounded-2xl border transition-all p-4 ${
                                    selectedOrderId === order.$id
                                        ? 'border-emerald-500/40 bg-emerald-500/10'
                                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                                }`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="space-y-2 text-left">
                                        <p className="text-sm font-bold text-white">Order #{order.orderNumber}</p>
                                        <p className="text-xs text-neutral-400">
                                            {order.customerName || 'Walk-in Customer'} • Table {order.tableNumber ?? 'TBD'}
                                        </p>
                                        <p className="text-xs text-neutral-400">{new Date(order.orderTime).toLocaleTimeString()}</p>
                                    </div>

                                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                                        {formatCurrency(order.totalAmount)}
                                        <span className="px-2 py-1 rounded-full bg-white/5 text-neutral-300 text-xs">
                                            {order.paymentStatus || order.status}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleSelectOrder(order)}
                                    >
                                        Select
                                    </Button>
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
