"use client";

import { useState } from "react";
import { ShoppingCart, X, Trash2, Minus, Plus, CreditCard, Check } from "lucide-react";
import { CartItem } from "@/types/pos.types";
import { formatCurrency } from "@/lib/utils";

interface MobileCartProps {
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onRemove: (id: string) => void;
    onAddToTab: () => void;
    editingOrderId?: string | null;
    onSaveOrderChanges?: () => void;
    onCancelEdit?: () => void;
}

export function MobileCart({ cart, onUpdateQuantity, onRemove, onAddToTab, editingOrderId, onSaveOrderChanges, onCancelEdit }: MobileCartProps) {
    const [isOpen, setIsOpen] = useState(false);
    // Prices are VAT-inclusive (16%)
    const vatRate = 0.16;
    const cartArray = Array.isArray(cart) ? cart : [];
    const subtotalBeforeVat = cartArray.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const subtotal = subtotalBeforeVat / (1 + vatRate);
    const taxAmount = subtotal * vatRate;
    const total = subtotalBeforeVat;
    const itemCount = cartArray.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <>
            {/* Floating Cart Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="floating-cart-btn md:hidden touch-feedback"
                aria-label="Open cart"
            >
                <ShoppingCart className="w-6 h-6 text-white" />
                {itemCount > 0 && (
                    <span className="badge animate-scale-bounce">
                        {itemCount}
                    </span>
                )}
            </button>

            {/* Mobile Overlay */}
            <div
                className={`mobile-overlay ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(false)}
            />

            {/* Cart Drawer */}
            <div className={`cart-drawer ${isOpen ? 'open' : ''}`}>
                {/* Header */}
                <div className="sticky top-0 bg-neutral-900 border-b border-white/10 p-4 safe-area-top">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            Current Order
                            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded-full border border-emerald-500/20">
                                {itemCount} items
                            </span>
                        </h2>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors touch-feedback"
                        >
                            <X className="w-6 h-6 text-white" />
                        </button>
                    </div>
                    <div className="swipe-indicator" />
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32">
                    {cartArray.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-neutral-500 space-y-4">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                <CreditCard className="w-8 h-8 opacity-50" />
                            </div>
                            <p>No items in order</p>
                        </div>
                    ) : (
                        cartArray.map((item, index) => (
                            <div
                                key={item.$id}
                                className="group relative flex gap-3 bg-white/5 hover:bg-white/10 rounded-xl p-3 border border-transparent hover:border-white/10 transition-all cart-item-enter"
                                style={{ animationDelay: `${index * 0.05}s` }}
                            >
                                {/* Quantity Controls */}
                                <div className="flex flex-col items-center justify-between bg-black/20 rounded-lg w-10 py-2">
                                    <button
                                        onClick={() => onUpdateQuantity(item.$id, 1)}
                                        disabled={item.stock !== undefined && item.quantity >= item.stock}
                                        className="p-2 hover:text-emerald-400 transition-colors touch-feedback disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <Plus size={16} />
                                    </button>
                                    <span className="text-base font-bold">{item.quantity}</span>
                                    <button
                                        onClick={() => onUpdateQuantity(item.$id, -1)}
                                        className="p-2 hover:text-rose-400 transition-colors touch-feedback"
                                    >
                                        <Minus size={16} />
                                    </button>
                                </div>

                                {/* Item Details */}
                                <div className="flex-1 min-w-0 py-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-medium text-neutral-200 truncate pr-2 text-base">
                                            {item.name}
                                        </h4>
                                        <span className="font-bold text-emerald-400 whitespace-nowrap text-base">
                                            {formatCurrency(item.price * item.quantity)}
                                        </span>
                                    </div>
                                    <div className="text-sm text-neutral-500 mt-1">
                                        {formatCurrency(item.price)} each
                                    </div>
                                </div>

                                {/* Remove Button */}
                                <button
                                    onClick={() => onRemove(item.$id)}
                                    className="absolute -right-2 -top-2 bg-rose-500 text-white p-2 rounded-full shadow-lg hover:bg-rose-600 transition-all touch-feedback"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Totals Section - Fixed at bottom */}
                <div className="fixed bottom-0 left-0 right-0 bg-neutral-800/95 backdrop-blur-sm border-t border-white/10 p-4 space-y-4 safe-area-bottom">
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

                    <div className="pt-3 border-t border-white/10 space-y-3">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-lg text-neutral-300">Total</span>
                            <span className="text-2xl font-bold text-white">
                                {formatCurrency(total)}
                            </span>
                        </div>

                        {editingOrderId ? (
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => {
                                        onSaveOrderChanges?.();
                                        setIsOpen(false);
                                    }}
                                    disabled={cart.length === 0}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-lg font-bold py-3 rounded-3xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 touch-feedback"
                                >
                                    <Check className="w-5 h-5" />
                                    Save
                                </button>
                                <button
                                    onClick={() => {
                                        onCancelEdit?.();
                                        setIsOpen(false);
                                    }}
                                    className="w-full bg-neutral-700 hover:bg-neutral-600 text-white text-lg font-semibold py-3 rounded-3xl border border-white/10 transition-all touch-feedback flex items-center justify-center gap-2"
                                >
                                    <X className="w-5 h-5" />
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    onAddToTab();
                                    setIsOpen(false);
                                }}
                                disabled={cart.length === 0}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-lg font-bold py-3 rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 touch-feedback"
                            >
                                Add To Tab
                            </button>
                        )}

                    </div>
                </div>
            </div>
        </>
    );
}
