"use client";

import { CartItem } from "@/types/pos.types";
import { Minus, Plus, CreditCard, UtensilsCrossed } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CartSidebarProps {
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onAddToTab: () => void;
    editingOrderId?: string | null;
    editingCustomerName?: string | null;
    editingCustomerNameDraft?: string;
    onEditCustomerName?: (nextTitle: string) => void;
    onSaveOrderChanges?: () => void;
    onCancelEdit?: () => void;
}

export const CartSidebar = ({
    cart,
    onUpdateQuantity,
    onAddToTab,
    editingOrderId,
    editingCustomerName,
    editingCustomerNameDraft,
    onEditCustomerName,
    onSaveOrderChanges,
    onCancelEdit,
}: CartSidebarProps) => {
    const vatRate = 0.16;
    const cartArray = Array.isArray(cart) ? cart : [];
    const subtotalBeforeVat = cartArray.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const subtotal = subtotalBeforeVat / (1 + vatRate);
    const taxAmount = subtotal * vatRate;
    const total = subtotalBeforeVat;

    return (
        <div className="flex h-full flex-col bg-[#0a0a0a] border-l border-white/10 w-[260px] md:w-[292px] lg:w-[400px] shrink-0">
            <div className="px-3 py-3 lg:px-6 lg:py-5 border-b border-white/10">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">Current Order</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs md:text-sm font-bold px-2.5 py-1 rounded-full border border-emerald-500/30 tabular-nums shrink-0">
                        {cartArray.reduce((s, i) => s + i.quantity, 0)} items
                    </span>
                </div>
            </div>

            {editingOrderId && (
                <div className="mx-4 mt-3 rounded-lg bg-emerald-950/50 border border-emerald-500/25 px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
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
                    <input
                        type="text"
                        value={editingCustomerNameDraft ?? ""}
                        onChange={(e) => onEditCustomerName?.(e.target.value)}
                        placeholder="Order title (e.g. Jane - Patio)"
                        className="w-full rounded-lg bg-black/30 border border-emerald-500/25 px-3 py-2 text-sm text-emerald-100 placeholder:text-emerald-300/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
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
                                <div className="hidden md:flex w-11 h-11 rounded-xl bg-white/5 items-center justify-center shrink-0 mt-0.5 text-emerald-500/80">
                                    <UtensilsCrossed className="w-5 h-5" strokeWidth={2} aria-hidden />
                                </div>
                            )}

                            <div className="flex-1 min-w-0 py-0.5">
                                <div className="flex justify-between items-start gap-2">
                                    <h4 className="font-semibold text-neutral-100 truncate text-sm md:text-[15px] max-w-[120px] lg:max-w-none leading-snug">
                                        {item.name}
                                    </h4>
                                    <span className="font-bold text-emerald-400 whitespace-nowrap text-sm md:text-[15px] tabular-nums">
                                        {formatCurrency(item.price * item.quantity)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5">
                                    <div className="flex items-center gap-0.5 bg-black/35 rounded-xl px-0.5 py-0.5">
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQuantity(item.$id, -1)}
                                            className="min-h-9 min-w-9 flex items-center justify-center rounded-lg hover:text-rose-400 hover:bg-white/5 transition-colors text-neutral-400 cursor-pointer"
                                            aria-label="Decrease quantity"
                                        >
                                            <Minus className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={2.25} />
                                        </button>
                                        <span className="text-sm font-bold text-white min-w-[1.5rem] text-center tabular-nums">
                                            {item.quantity}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQuantity(item.$id, 1)}
                                            disabled={item.stock !== undefined && item.quantity >= item.stock}
                                            className="min-h-9 min-w-9 flex items-center justify-center rounded-lg hover:text-emerald-400 hover:bg-white/5 transition-colors text-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                            aria-label="Increase quantity"
                                        >
                                            <Plus className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={2.25} />
                                        </button>
                                    </div>
                                    <span className="text-xs md:text-sm text-neutral-400">{formatCurrency(item.price)} each</span>
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
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={onSaveOrderChanges}
                                disabled={cart.length === 0}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm lg:text-lg font-bold py-2.5 lg:py-3 rounded-lg shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center"
                            >
                                Update
                            </button>
                            <button
                                type="button"
                                onClick={onCancelEdit}
                                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white text-sm lg:text-lg font-semibold py-2.5 lg:py-3 rounded-lg border border-white/10 transition-all flex items-center justify-center"
                            >
                                Cancel
                            </button>
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
