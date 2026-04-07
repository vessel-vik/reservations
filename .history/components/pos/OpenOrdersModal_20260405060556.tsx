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
import { Clock, ShoppingBag, AlertCircle, Edit2, Printer, ChevronDown } from "lucide-react";

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
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

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

    const toggleOrderExpanded = (orderId: string) => {
        setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-emerald-400" />
                        Open Orders {tableNumber ? `(Table ${tableNumber})` : ""}
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="text-center py-12 text-neutral-400 flex-1 flex items-center justify-center">
                        <div>Loading open orders...</div>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="text-center py-12 flex-1 flex flex-col items-center justify-center">
                        <AlertCircle className="w-12 h-12 text-neutral-600 mb-3" />
                        <p className="text-neutral-400">No open orders</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-2">
                        {orders.map((order) => {
                            const items = parseOrderItems(order);
                            const isExpanded = expandedOrderId === order.$id;

                            return (
                                <div
                                    key={order.$id}
                                    className="w-full rounded-2xl border border-white/10 bg-slate-900/50 transition-all hover:border-white/20"
                                >
                                    {/* Order Header - Always Visible */}
                                    <button
                                        onClick={() => toggleOrderExpanded(order.$id)}
                                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <p className="text-sm font-semibold text-white truncate">
                                                    Order #{order.orderNumber}
                                                </p>
                                                <span className="text-xs rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 whitespace-nowrap">
                                                    Table {order.tableNumber ?? 'TBD'}
                                                </span>
                                                <span className="text-xs rounded-full bg-white/5 text-neutral-400 px-2 py-0.5 whitespace-nowrap">
                                                    {items.length} items
                                                </span>
                                            </div>
                                            <p className="text-xs text-neutral-500">
                                                {order.customerName || 'Walk-in Customer'} • {new Date(order.orderTime).toLocaleTimeString()}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-3 ml-4 shrink-0">
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-emerald-400">
                                                    {formatCurrency(order.totalAmount)}
                                                </p>
                                                <p className="text-xs text-neutral-400 capitalize">
                                                    {order.paymentStatus || order.status}
                                                </p>
                                            </div>
                                            <ChevronDown
                                                className={`w-5 h-5 text-neutral-500 transition-transform ${
                                                    isExpanded ? 'rotate-180' : ''
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Expanded Items List */}
                                    {isExpanded && (
                                        <>
                                            <div className="border-t border-white/5" />

                                            <div className="px-4 py-3">
                                                {items.length === 0 ? (
                                                    <p className="text-xs text-neutral-500 py-2">No items available</p>
                                                ) : (
                                                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                                                        {items.map((item) => (
                                                            <div
                                                                key={item.$id}
                                                                className="flex items-start justify-between gap-3 text-sm p-2 rounded-lg bg-slate-950/50 hover:bg-slate-950/80 transition-colors"
                                                            >
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-white font-medium">
                                                                        {item.quantity}× {item.name}
                                                                    </p>
                                                                    {item.description && (
                                                                        <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">
                                                                            {item.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div className="text-right whitespace-nowrap shrink-0">
                                                                    <p className="font-semibold text-emerald-400">
                                                                        {formatCurrency(item.price * item.quantity)}
                                                                    </p>
                                                                    <p className="text-xs text-neutral-500">
                                                                        {formatCurrency(item.price)} ea
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="border-t border-white/5" />

                                            {/* Action Buttons - Only visible when expanded */}
                                            <div className="px-4 py-3 bg-slate-900/30 rounded-b-2xl flex gap-3">
                                                <Button
                                                    size="sm"
                                                    onClick={() => onEdit?.(order)}
                                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                                >
                                                    <Edit2 className="w-4 h-4 mr-2" />
                                                    Edit Order
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => onPrint?.(order)}
                                                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                                                >
                                                    <Printer className="w-4 h-4 mr-2" />
                                                    Print
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="shrink-0 flex gap-3 justify-end pt-4 border-t border-white/10">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onClose}
                    >
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
