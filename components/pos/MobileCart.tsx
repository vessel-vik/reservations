"use client";

import { useState } from "react";
import { ShoppingCart, X, Minus, Plus, CreditCard, Check } from "lucide-react";
import { CartItem } from "@/types/pos.types";
import { formatCurrency } from "@/lib/utils";

interface MobileCartProps {
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onAddToTab: () => void;
    editingOrderId?: string | null;
    editingCustomerName?: string | null;
    onSaveOrderChanges?: () => void;
    onCancelEdit?: () => void;
    onOpenOrders?: () => void;
    onSettle?: () => void;
    onClosedOrders?: () => void;
}

export function MobileCart({
    cart,
    onUpdateQuantity,
    onAddToTab,
    editingOrderId,
    editingCustomerName,
    onSaveOrderChanges,
    onCancelEdit,
    onOpenOrders,
    onSettle,
    onClosedOrders,
}: MobileCartProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"menu" | "cart" | "orders" | "settle" | "closed">("menu");
    const [isCartPanelOpen, setIsCartPanelOpen] = useState(false);
    const vatRate = 0.16;
    const cartArray = Array.isArray(cart) ? cart : [];
    const subtotalBeforeVat = cartArray.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const subtotal = subtotalBeforeVat / (1 + vatRate);
    const taxAmount = subtotal * vatRate;
    const total = subtotalBeforeVat;
    const itemCount = cartArray.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="floating-cart-btn md:hidden touch-feedback"
                aria-label="Open cart"
            >
                <ShoppingCart className="w-6 h-6 text-white" />
                {itemCount > 0 && <span className="badge animate-scale-bounce">{itemCount}</span>}
            </button>

            <div className={`mobile-overlay ${isOpen ? "active" : ""}`} onClick={() => setIsOpen(false)} />

            <div className={`cart-drawer ${isOpen ? "open" : ""}`}>
                <div className="sticky top-0 bg-[#0a0a0a] border-b border-white/10 p-4 safe-area-top">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            Current Order
                            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded-full border border-emerald-500/30">
                                {itemCount} items
                            </span>
                        </h2>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors touch-feedback"
                        >
                            <X className="w-6 h-6 text-white" />
                        </button>
                    </div>
                    {editingOrderId && (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-950/50 border border-emerald-500/25 px-3 py-2">
                            <p className="text-xs text-emerald-200/90 truncate">
                                Editing:{" "}
                                <span className="font-medium text-emerald-100">
                                    {editingCustomerName?.trim() || "Walk-in Customer"}
                                </span>
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    onCancelEdit?.();
                                    setIsOpen(false);
                                }}
                                className="shrink-0 text-xs font-semibold text-rose-400"
                            >
                                Drop / New
                            </button>
                        </div>
                    )}
                    <div className="swipe-indicator" />
                </div>

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
                                key={`${item.$id}-m-${index}`}
                                className="flex gap-3 bg-white/[0.04] hover:bg-white/[0.06] rounded-xl p-3 border border-white/[0.06] transition-all cart-item-enter"
                                style={{ animationDelay: `${index * 0.05}s` }}
                            >
                                <div className="flex flex-col items-center justify-between bg-black/25 rounded-lg w-10 py-2">
                                    <button
                                        type="button"
                                        onClick={() => onUpdateQuantity(item.$id, 1)}
                                        disabled={item.stock !== undefined && item.quantity >= item.stock}
                                        className="p-2 hover:text-emerald-400 transition-colors touch-feedback disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <Plus size={16} />
                                    </button>
                                    <span className="text-base font-bold">{item.quantity}</span>
                                    <button
                                        type="button"
                                        onClick={() => onUpdateQuantity(item.$id, -1)}
                                        className="p-2 hover:text-rose-400 transition-colors touch-feedback"
                                    >
                                        <Minus size={16} />
                                    </button>
                                </div>

                                <div className="flex-1 min-w-0 py-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-medium text-neutral-200 truncate pr-2 text-base">{item.name}</h4>
                                        <span className="font-bold text-emerald-400 whitespace-nowrap text-base tabular-nums">
                                            {formatCurrency(item.price * item.quantity)}
                                        </span>
                                    </div>
                                    <div className="text-sm text-neutral-500 mt-1">{formatCurrency(item.price)} each</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-sm border-t border-white/10 p-4 space-y-4 safe-area-bottom">
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

                    <div className="pt-3 border-t border-white/10 space-y-3">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-lg text-neutral-300">Total</span>
                            <span className="text-2xl font-bold text-white tabular-nums">{formatCurrency(total)}</span>
                        </div>

                        {editingOrderId ? (
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSaveOrderChanges?.();
                                        setIsOpen(false);
                                    }}
                                    disabled={cart.length === 0}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-lg font-bold py-3 rounded-lg shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 touch-feedback"
                                >
                                    <Check className="w-5 h-5" />
                                    Update Order
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onCancelEdit?.();
                                        setIsOpen(false);
                                    }}
                                    className="w-full bg-neutral-800 hover:bg-neutral-700 text-white text-lg font-semibold py-3 rounded-lg border border-white/10 transition-all touch-feedback flex items-center justify-center gap-2"
                                >
                                    <X className="w-5 h-5" />
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    onAddToTab();
                                    setIsOpen(false);
                                }}
                                disabled={cart.length === 0}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-lg font-bold py-3 rounded-lg shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] touch-feedback"
                            >
                                Add To Tab
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Portrait tablet (≥768px portrait) — bottom tab bar */}
            <div
                className="hidden tablet-portrait-only fixed bottom-0 left-0 right-0 z-40 bg-neutral-900/98 backdrop-blur-md border-t border-white/10 items-stretch"
                style={{ height: '76px', paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {([
                    { id: "menu" as const, icon: "🍽️", label: "Menu" },
                    { id: "cart" as const, icon: "🛒", label: "Cart", badge: itemCount },
                    { id: "orders" as const, icon: "📋", label: "Orders" },
                    { id: "settle" as const, icon: "💳", label: "Settle" },
                    { id: "closed" as const, icon: "📁", label: "Closed" },
                ] as const).map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                            setActiveTab(tab.id);
                            if (tab.id === "cart") {
                                setIsCartPanelOpen(true);
                            } else if (tab.id === "orders") {
                                onOpenOrders?.();
                            } else if (tab.id === "settle") {
                                onSettle?.();
                            } else if (tab.id === "closed") {
                                onClosedOrders?.();
                            }
                        }}
                        className={`relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200 hover:scale-110 active:scale-90 ${
                            activeTab === tab.id
                                ? "text-emerald-400"
                                : "text-neutral-400 hover:text-neutral-100"
                        }`}
                    >
                        {/* Active top bar */}
                        {activeTab === tab.id && (
                            <span className="absolute top-0 inset-x-3 h-[3px] bg-emerald-400 rounded-full" />
                        )}
                        {/* Active background pill */}
                        {activeTab === tab.id && (
                            <span className="absolute inset-x-2 inset-y-1.5 rounded-2xl bg-emerald-500/10" />
                        )}
                        <span className="text-[22px] relative z-10">
                            {tab.icon}
                            {'badge' in tab && tab.badge > 0 && (
                                <span className="absolute -top-1 -right-2 bg-emerald-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                                    {tab.badge > 9 ? "9+" : tab.badge}
                                </span>
                            )}
                        </span>
                        <span className="text-[11px] font-semibold leading-none relative z-10">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Portrait tablet cart panel — slides up from bottom */}
            {isCartPanelOpen && (
                <div
                    className="hidden tablet-portrait-only fixed inset-x-0 bottom-0 z-50 flex-col bg-neutral-900 border-t border-white/10 rounded-t-2xl"
                    style={{ height: '80vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                    <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
                        <h2 className="text-lg font-bold text-white">Current Order</h2>
                        <button
                            type="button"
                            onClick={() => setIsCartPanelOpen(false)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-36">
                        {cartArray.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-neutral-500 space-y-4">
                                <CreditCard className="w-8 h-8 opacity-50" />
                                <p>No items in order</p>
                            </div>
                        ) : (
                            cartArray.map((item, index) => (
                                <div
                                    key={`${item.$id}-tp-${index}`}
                                    className="flex gap-3 bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]"
                                >
                                    <div className="flex flex-col items-center justify-between bg-black/25 rounded-lg w-10 py-2">
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQuantity(item.$id, 1)}
                                            disabled={item.stock !== undefined && item.quantity >= item.stock}
                                            className="p-2 hover:text-emerald-400 transition-colors disabled:opacity-30"
                                        >
                                            <Plus size={16} />
                                        </button>
                                        <span className="text-base font-bold">{item.quantity}</span>
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQuantity(item.$id, -1)}
                                            className="p-2 hover:text-rose-400 transition-colors"
                                        >
                                            <Minus size={16} />
                                        </button>
                                    </div>
                                    <div className="flex-1 min-w-0 py-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-medium text-neutral-200 truncate pr-2">{item.name}</h4>
                                            <span className="font-bold text-emerald-400 whitespace-nowrap tabular-nums">
                                                {formatCurrency(item.price * item.quantity)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-neutral-500 mt-1">{formatCurrency(item.price)} each</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div
                        className="absolute bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-sm border-t border-white/10 p-4 space-y-3"
                        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
                    >
                        <div className="flex justify-between items-end">
                            <span className="text-neutral-300">Total</span>
                            <span className="text-2xl font-bold text-white tabular-nums">{formatCurrency(total)}</span>
                        </div>
                        {editingOrderId ? (
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => { onSaveOrderChanges?.(); setIsCartPanelOpen(false); }}
                                    disabled={cart.length === 0}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"
                                >
                                    <Check className="w-5 h-5" /> Update Order
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { onCancelEdit?.(); setIsCartPanelOpen(false); }}
                                    className="w-full bg-neutral-800 text-white font-semibold py-3 rounded-lg border border-white/10 flex items-center justify-center gap-2"
                                >
                                    <X className="w-5 h-5" /> Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { onAddToTab(); setIsCartPanelOpen(false); }}
                                disabled={cart.length === 0}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 text-white text-lg font-bold py-3 rounded-lg"
                            >
                                Add To Tab
                            </button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
