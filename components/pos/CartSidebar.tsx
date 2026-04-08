"use client";

import { CartItem } from "@/types/pos.types";
import { Minus, Plus, CreditCard, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CartSidebarProps {
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onAddToTab: () => void;
    editingOrderId?: string | null;
    editingCustomerName?: string | null;
    onSaveOrderChanges?: () => void;
    onCancelEdit?: () => void;
    /** Shown only while editing an existing order — opens PayNowModal. */
    onOpenPayNow?: () => void;
}

export const CartSidebar = ({
    cart,
    onUpdateQuantity,
    onAddToTab,
    editingOrderId,
    editingCustomerName,
    onSaveOrderChanges,
    onCancelEdit,
    onOpenPayNow,
}: CartSidebarProps) => {
    const vatRate = 0.16;
    const cartArray = Array.isArray(cart) ? cart : [];
    const subtotalBeforeVat = cartArray.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const subtotal = subtotalBeforeVat / (1 + vatRate);
    const taxAmount = subtotal * vatRate;
    const total = subtotalBeforeVat;

    return (
        <div className="flex h-full flex-col bg-[#0a0a0a] border-l border-white/10 w-[240px] lg:w-[400px]">
            <div className="px-3 py-3 lg:px-6 lg:py-5 border-b border-white/10">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">Current Order</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-500/30 tabular-nums">
                        {cartArray.reduce((s, i) => s + i.quantity, 0)} items
                    </span>
                </div>
            </div>

            {editingOrderId && (
                <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-950/50 border border-emerald-500/25 px-3 py-2.5">
                    <p className="text-sm text-emerald-200/90 truncate">
                        Editing:{" "}
                        <span className="font-medium text-emerald-100">
                            {editingCustomerName?.trim() || "Walk-in Customer"}
                        </span>
                    </p>
                    <button
                        type="button"
                        onClick={onCancelEdit}
                        className="shrink-0 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
                    >
                        Drop / New
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-2 lg:p-4 space-y-2 lg:space-y-3">
                {cartArray.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-neutral-500 space-y-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                            <CreditCard className="w-8 h-8 opacity-50" />
                        </div>
                        <p>No items in order</p>
                    </div>
                ) : (
                    cartArray.map((item, index) => (
                        <div
                            key={`${item.$id}-row-${index}`}
                            className="flex gap-3 bg-white/[0.04] hover:bg-white/[0.06] rounded-xl p-2 lg:p-3 border border-white/[0.06] transition-all cart-item-enter"
                            style={{ animationDelay: `${index * 0.05}s` }}
                        >
                            {item.imageUrl ? (
                                <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="hidden lg:block w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5"
                                />
                            ) : (
                                <div className="hidden lg:flex w-10 h-10 rounded-lg bg-white/5 items-center justify-center shrink-0 mt-0.5 text-base">
                                    🍽️
                                </div>
                            )}

                            <div className="flex-1 min-w-0 py-0.5">
                                <div className="flex justify-between items-start gap-2">
                                    <h4 className="font-medium text-neutral-100 truncate text-sm max-w-[120px] lg:max-w-none">{item.name}</h4>
                                    <span className="font-bold text-emerald-400 whitespace-nowrap text-sm tabular-nums">
                                        {formatCurrency(item.price * item.quantity)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5">
                                    <div className="flex items-center gap-1 bg-black/35 rounded-lg px-1 py-0.5">
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQuantity(item.$id, -1)}
                                            className="p-1 hover:text-rose-400 transition-colors text-neutral-400"
                                        >
                                            <Minus size={12} />
                                        </button>
                                        <span className="text-xs font-bold text-white w-4 text-center">{item.quantity}</span>
                                        <button
                                            type="button"
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
                        </div>
                    ))
                )}
            </div>

            <div className="bg-neutral-900/80 p-3 space-y-3 lg:p-6 lg:space-y-4 border-t border-white/10 backdrop-blur-sm">
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-neutral-400">
                        <span>Subtotal (ex VAT)</span>
                        <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                        <span>VAT (16%)</span>
                        <span className="text-amber-400 tabular-nums">{formatCurrency(taxAmount)}</span>
                    </div>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-3">
                    <div className="flex justify-between items-end">
                        <span className="text-neutral-300">Total</span>
                        <span className="text-xl lg:text-3xl font-bold text-white tabular-nums">{formatCurrency(total)}</span>
                    </div>

                    {editingOrderId ? (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={onSaveOrderChanges}
                                    disabled={cart.length === 0}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm lg:text-lg font-bold py-2.5 lg:py-3 rounded-lg shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <Check className="w-4 h-4 lg:w-5 lg:h-5" />
                                    Update Order
                                </button>
                                <button
                                    type="button"
                                    onClick={onCancelEdit}
                                    className="w-full bg-neutral-800 hover:bg-neutral-700 text-white text-sm lg:text-lg font-semibold py-2.5 lg:py-3 rounded-lg border border-white/10 transition-all flex items-center justify-center gap-2"
                                >
                                    <X className="w-4 h-4 lg:w-5 lg:h-5" />
                                    Cancel
                                </button>
                            </div>
                            {onOpenPayNow && (
                                <button
                                    type="button"
                                    onClick={onOpenPayNow}
                                    disabled={cart.length === 0}
                                    className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm font-bold py-2.5 rounded-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <CreditCard className="w-4 h-4" />
                                    Pay now
                                </button>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={onAddToTab}
                            disabled={cart.length === 0}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm lg:text-lg font-bold py-2.5 lg:py-3 rounded-lg shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            Add To Tab
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
