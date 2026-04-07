"use client";

import { CartItem } from "@/types/pos.types";
import { Trash2, Minus, Plus, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CartSidebarProps {
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onRemove: (id: string) => void;
    onAddToTab: () => void;
    editingOrderId?: string | null;
    onSaveOrderChanges?: () => void;
    onCancelEdit?: () => void;
}

export const CartSidebar = ({ cart, onUpdateQuantity, onRemove, onAddToTab, editingOrderId, onSaveOrderChanges, onCancelEdit }: CartSidebarProps) => {
    // Prices are VAT-inclusive (16%)
    // Calculate: subtotal = total / 1.16, taxAmount = subtotal × 0.16
    const vatRate = 0.16;
    const cartArray = Array.isArray(cart) ? cart : [];
    const subtotalBeforeVat = cartArray.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const subtotal = subtotalBeforeVat / (1 + vatRate);
    const taxAmount = subtotal * vatRate;
    const total = subtotalBeforeVat;

    return (
        <div className="flex h-full flex-col bg-neutral-900 border-l border-white/10 w-[400px]">
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-neutral-900 to-neutral-800/50">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">Current Order</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-500/20 tabular-nums">
                        {cartArray.reduce((s, i) => s + i.quantity, 0)} items
                    </span>
                </div>
            </div>

            {/* Cart Items - Scrollable area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cartArray.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-500 space-y-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                            <CreditCard className="w-8 h-8 opacity-50" />
                        </div>
                        <p>No items in order</p>
                    </div>
                ) : (
                    cartArray.map((item, index) => (
                        <div
                            key={item.$id}
                            className="group relative flex gap-3 bg-white/5 hover:bg-white/8 rounded-xl p-3 border border-transparent hover:border-white/10 transition-all cart-item-enter"
                            style={{ animationDelay: `${index * 0.05}s` }}
                        >
                            {/* Thumbnail */}
                            {item.imageUrl ? (
                                <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5 text-base">
                                    🍽️
                                </div>
                            )}

                            {/* Item Details */}
                            <div className="flex-1 min-w-0 py-0.5">
                                <div className="flex justify-between items-start gap-2">
                                    <h4 className="font-medium text-neutral-200 truncate text-sm">
                                        {item.name}
                                    </h4>
                                    <span className="font-bold text-emerald-400 whitespace-nowrap text-sm">
                                        {formatCurrency(item.price * item.quantity)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5">
                                    {/* Quantity Controls */}
                                    <div className="flex items-center gap-1 bg-black/30 rounded-lg px-1 py-0.5">
                                        <button
                                            onClick={() => onUpdateQuantity(item.$id, -1)}
                                            className="p-1 hover:text-rose-400 transition-colors text-neutral-400"
                                        >
                                            <Minus size={12} />
                                        </button>
                                        <span className="text-xs font-bold text-white w-4 text-center">{item.quantity}</span>
                                        <button
                                            onClick={() => onUpdateQuantity(item.$id, 1)}
                                            disabled={item.stock !== undefined && item.quantity >= item.stock}
                                            className="p-1 hover:text-emerald-400 transition-colors text-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Plus size={12} />
                                        </button>
                                    </div>
                                    <span className="text-xs text-neutral-500">{formatCurrency(item.price)} each</span>
                                </div>
                            </div>

                            {/* Remove Button */}
                            <button
                                onClick={() => onRemove(item.$id)}
                                className="opacity-0 group-hover:opacity-100 absolute -right-2 -top-2 bg-rose-500 text-white p-1.5 rounded-full shadow-lg hover:bg-rose-600 transition-all scale-75 group-hover:scale-100"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Totals Section */}
            <div className="bg-neutral-800/50 p-6 space-y-4 border-t border-white/10 backdrop-blur-sm">
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-neutral-400">
                        <span>Subtotal (ex VAT)</span>
                        <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                        <span>VAT (16%)</span>
                        <span className="text-amber-400">{formatCurrency(taxAmount)}</span>
                    </div>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-3">
                    <div className="flex justify-between items-end">
                        <span className="text-neutral-300">Total</span>
                        <span className="text-3xl font-bold text-white">
                            {formatCurrency(total)}
                        </span>
                    </div>

                    {editingOrderId ? (
                        <div className="space-y-3">
                            <button
                                onClick={onSaveOrderChanges}
                                disabled={cart.length === 0}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-lg font-bold py-3 rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                Save Order Changes
                            </button>
                            <button
                                onClick={onCancelEdit}
                                className="w-full bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-semibold py-3 rounded-xl border border-white/10 transition-all"
                            >
                                Cancel Edit
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={onAddToTab}
                            disabled={cart.length === 0}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-lg font-bold py-3 rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            Add To Tab
                        </button>
                    )}

                </div>
            </div>
        </div>
    );
};
