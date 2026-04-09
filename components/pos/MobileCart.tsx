"use client";

import { useState, useEffect } from "react";
import {
    ShoppingCart,
    X,
    Minus,
    Plus,
    CreditCard,
    UtensilsCrossed,
    ClipboardList,
    FolderArchive,
} from "lucide-react";
import { CartItem } from "@/types/pos.types";
import { formatCurrency } from "@/lib/utils";

interface MobileCartProps {
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onAddToTab: () => void;
    editingOrderId?: string | null;
    editingCustomerName?: string | null;
    editingCustomerNameDraft?: string;
    onEditCustomerName?: (nextTitle: string) => void;
    onSaveOrderChanges?: () => void;
    onCancelEdit?: () => void;
    onOpenOrders?: () => void;
    onSettle?: () => void;
    onClosedOrders?: () => void;
    /** Closes cart/drawer overlays when a full-screen modal (e.g. Settle tab) opens. */
    settleModalOpen?: boolean;
}

export function MobileCart({
    cart,
    onUpdateQuantity,
    onAddToTab,
    editingOrderId,
    editingCustomerName,
    editingCustomerNameDraft,
    onEditCustomerName,
    onSaveOrderChanges,
    onCancelEdit,
    onOpenOrders,
    onSettle,
    onClosedOrders,
    settleModalOpen = false,
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

    useEffect(() => {
        if (!settleModalOpen) return;
        setIsCartPanelOpen(false);
        setIsOpen(false);
    }, [settleModalOpen]);

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
                        <div className="mt-3 rounded-lg bg-emerald-950/50 border border-emerald-500/25 px-3 py-2 space-y-2">
                            <div className="flex items-center justify-between gap-2">
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
                            <input
                                type="text"
                                value={editingCustomerNameDraft ?? ""}
                                onChange={(e) => onEditCustomerName?.(e.target.value)}
                                placeholder="Order title (e.g. Jane - Patio)"
                                className="w-full rounded-lg bg-black/30 border border-emerald-500/25 px-3 py-2 text-sm text-emerald-100 placeholder:text-emerald-300/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                            />
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
                                    Update
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onCancelEdit?.();
                                        setIsOpen(false);
                                    }}
                                    className="w-full bg-neutral-800 hover:bg-neutral-700 text-white text-lg font-semibold py-3 rounded-lg border border-white/10 transition-all touch-feedback flex items-center justify-center"
                                >
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

            {/* Portrait tablet — bottom tab bar (Lucide icons, 44px+ targets, no emoji — UIpro) */}
            <div
                className="hidden tablet-portrait-only fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 backdrop-blur-md border-t border-white/10 shadow-[0_-4px_24px_rgba(0,0,0,0.35)] items-stretch"
                style={{ minHeight: "120px", paddingBottom: "env(safe-area-inset-bottom)" }}
            >
                {(
                    [
                        { id: "menu" as const, Icon: UtensilsCrossed, label: "Menu" },
                        { id: "cart" as const, Icon: ShoppingCart, label: "Cart", badge: true },
                        { id: "orders" as const, Icon: ClipboardList, label: "Orders" },
                        { id: "settle" as const, Icon: CreditCard, label: "Settle" },
                        { id: "closed" as const, Icon: FolderArchive, label: "Closed" },
                    ] as const
                ).map((tab) => {
                    const Icon = tab.Icon;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab.id);
                                if (tab.id === "menu") {
                                    setIsCartPanelOpen(false);
                                } else if (tab.id === "cart") {
                                    setIsCartPanelOpen(true);
                                } else if (tab.id === "orders") {
                                    onOpenOrders?.();
                                } else if (tab.id === "settle") {
                                    onSettle?.();
                                } else if (tab.id === "closed") {
                                    onClosedOrders?.();
                                }
                            }}
                            className={`relative flex-1 flex flex-col items-center justify-center gap-1.5 min-h-[72px] py-2 px-0.5 rounded-xl transition-colors duration-200 ease-out cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                                activeTab === tab.id
                                    ? "text-emerald-400"
                                    : "text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] active:bg-white/[0.08]"
                            }`}
                        >
                            {activeTab === tab.id && (
                                <span
                                    className="absolute inset-x-0.5 inset-y-0.5 rounded-xl bg-emerald-500/12 ring-1 ring-emerald-500/30 pointer-events-none"
                                    aria-hidden
                                />
                            )}
                            <span className="relative z-10 inline-flex h-9 w-9 items-center justify-center">
                                <Icon
                                    className="w-6 h-6 shrink-0"
                                    strokeWidth={activeTab === tab.id ? 2.25 : 2}
                                    aria-hidden
                                />
                                {"badge" in tab && tab.badge && itemCount > 0 && (
                                    <span className="absolute -right-0.5 -top-1 bg-emerald-500 text-white text-[11px] font-bold rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1 border-2 border-neutral-950 tabular-nums">
                                        {itemCount > 9 ? "9+" : itemCount}
                                    </span>
                                )}
                            </span>
                            <span className="text-[13px] font-semibold leading-tight relative z-10 max-w-full truncate px-0.5">
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Portrait tablet cart panel — slides up from bottom */}
            {isCartPanelOpen && (
                <div
                    className="hidden tablet-portrait-only fixed inset-x-0 bottom-0 z-50 flex flex-col bg-neutral-900 border-t border-white/10 rounded-t-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.45)]"
                    style={{
                        height: "min(82vh, 44rem)",
                        paddingBottom: "env(safe-area-inset-bottom)",
                    }}
                >
                    <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/10 gap-3">
                        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                            Current Order
                        </h2>
                        <button
                            type="button"
                            onClick={() => setIsCartPanelOpen(false)}
                            aria-label="Close cart"
                            className="min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <X className="w-6 h-6 text-white" strokeWidth={2} />
                        </button>
                    </div>
                    {editingOrderId && (
                        <div className="px-5 pb-3 space-y-2 border-b border-white/10">
                            <p className="text-xs text-emerald-200/90 truncate">
                                Editing:{" "}
                                <span className="font-medium text-emerald-100">
                                    {editingCustomerName?.trim() || "Walk-in Customer"}
                                </span>
                            </p>
                            <input
                                type="text"
                                value={editingCustomerNameDraft ?? ""}
                                onChange={(e) => onEditCustomerName?.(e.target.value)}
                                placeholder="Order title (e.g. Jane - Patio)"
                                className="w-full min-h-11 rounded-lg bg-black/30 border border-emerald-500/25 px-3 py-2 text-sm text-emerald-100 placeholder:text-emerald-300/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                            />
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-5 space-y-3 pb-40">
                        {cartArray.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-neutral-500 space-y-4">
                                <CreditCard className="w-8 h-8 opacity-50" />
                                <p>No items in order</p>
                            </div>
                        ) : (
                            cartArray.map((item, index) => (
                                <div
                                    key={`${item.$id}-tp-${index}`}
                                    className="flex gap-4 bg-white/[0.05] rounded-2xl p-4 border border-white/[0.08]"
                                >
                                    <div className="flex flex-col items-center justify-between bg-black/30 rounded-xl w-[52px] py-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQuantity(item.$id, 1)}
                                            disabled={item.stock !== undefined && item.quantity >= item.stock}
                                            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:text-emerald-400 hover:bg-white/5 transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                                            aria-label="Increase quantity"
                                        >
                                            <Plus className="w-5 h-5" strokeWidth={2.25} />
                                        </button>
                                        <span className="text-lg font-bold tabular-nums py-0.5">{item.quantity}</span>
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQuantity(item.$id, -1)}
                                            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:text-rose-400 hover:bg-white/5 transition-colors cursor-pointer"
                                            aria-label="Decrease quantity"
                                        >
                                            <Minus className="w-5 h-5" strokeWidth={2.25} />
                                        </button>
                                    </div>
                                    <div className="flex-1 min-w-0 py-0.5">
                                        <div className="flex justify-between items-start gap-2">
                                            <h4 className="font-semibold text-neutral-100 truncate text-[15px] leading-snug pr-2">
                                                {item.name}
                                            </h4>
                                            <span className="font-bold text-emerald-400 whitespace-nowrap tabular-nums text-[15px]">
                                                {formatCurrency(item.price * item.quantity)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-neutral-400 mt-1.5">
                                            {formatCurrency(item.price)} each
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div
                        className="absolute bottom-0 left-0 right-0 bg-neutral-950/95 backdrop-blur-md border-t border-white/10 p-5 space-y-4"
                        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
                    >
                        <div className="flex justify-between items-end gap-4">
                            <span className="text-base text-neutral-300 font-medium">Total</span>
                            <span className="text-3xl font-bold text-white tabular-nums tracking-tight">
                                {formatCurrency(total)}
                            </span>
                        </div>
                        {editingOrderId ? (
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSaveOrderChanges?.();
                                        setIsCartPanelOpen(false);
                                    }}
                                    disabled={cart.length === 0}
                                    className="min-h-[52px] w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-base font-bold py-3.5 rounded-xl flex items-center justify-center transition-colors cursor-pointer"
                                >
                                    Update
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onCancelEdit?.();
                                        setIsCartPanelOpen(false);
                                    }}
                                    className="min-h-[52px] w-full bg-neutral-800 hover:bg-neutral-700 text-white text-base font-semibold py-3.5 rounded-xl border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    onAddToTab();
                                    setIsCartPanelOpen(false);
                                }}
                                disabled={cart.length === 0}
                                className="min-h-[52px] w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-lg font-bold py-3.5 rounded-xl transition-colors cursor-pointer"
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
