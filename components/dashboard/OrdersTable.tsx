"use client";

import { useState } from "react";
import { Order } from "@/types/pos.types";
import { formatCurrency } from "@/lib/utils";
import { formatPaymentMethodEntry } from "@/lib/payment-display";
import { Receipt, Search, Filter } from "lucide-react";
import Link from "next/link";

interface OrdersTableProps {
    orders: Order[];
}

export function OrdersTable({ orders }: OrdersTableProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const filteredOrders = orders.filter(order => {
        const matchesSearch = order.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.$id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || order.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusColors = {
        paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        cancelled: "bg-red-500/10 text-red-400 border-red-500/20"
    };

    return (
        <div className="bg-neutral-900/50 border border-white/10 rounded-xl p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-emerald-400" />
                        All Orders
                    </h3>
                    <p className="text-sm text-neutral-400 mt-1">{filteredOrders.length} orders found</p>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:flex-initial">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                        <input
                            type="text"
                            placeholder="Search orders..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-64 bg-neutral-800 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder:text-neutral-500 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                        />
                    </div>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-neutral-800 border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                    >
                        <option value="all">All Status</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            {filteredOrders.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">
                    <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No orders found</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider py-3 px-4">Order #</th>
                                <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider py-3 px-4">Date</th>
                                <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider py-3 px-4">Table</th>
                                <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider py-3 px-4">Amount</th>
                                <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider py-3 px-4">Payment</th>
                                <th className="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider py-3 px-4">Status</th>
                                <th className="text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider py-3 px-4">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredOrders.map((order) => (
                                <tr key={order.$id} className="hover:bg-white/5 transition-colors">
                                    <td className="py-4 px-4">
                                        <span className="font-mono text-sm text-white">
                                            {order.orderNumber || order.$id.substring(0, 8)}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className="text-sm text-neutral-300">
                                            {new Date(order.$createdAt!).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className="text-sm text-neutral-300">
                                            Table {order.tableNumber}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className="text-sm font-bold text-emerald-400">
                                            {formatCurrency(order.totalAmount)}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 max-w-[280px]">
                                        {Array.isArray(order.paymentMethods) && order.paymentMethods.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {order.paymentMethods.map((m: any, i: number) => (
                                                    <span
                                                        key={`${order.$id}-method-${i}`}
                                                        className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-neutral-300"
                                                        title={m?.reference ? `Ref: ${m.reference}` : undefined}
                                                    >
                                                        {formatPaymentMethodEntry({
                                                            method: m?.method,
                                                            amount: m?.amount,
                                                            reference: m?.reference,
                                                        })}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-neutral-500">—</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[order.status as keyof typeof statusColors] || statusColors.pending}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <Link
                                            href={`/pos/receipt/${order.$id}`}
                                            className="text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                                        >
                                            View Receipt
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
