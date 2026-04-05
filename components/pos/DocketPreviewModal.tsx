"use client";

import { CartItem } from "@/types/pos.types";

interface DocketPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
    order: {
        orderNumber?: string;
        tableNumber?: number;
        waiterName?: string;
        totalAmount: number;
        items: CartItem[];
        createdAt?: string;
    };
    /** Enriched delta items (price from cart). Only used when type='addition'. */
    deltaItems?: { name: string; quantity: number; price: number }[];
    type: "new" | "addition";
}

export function DocketPreviewModal({
    isOpen,
    onClose,
    onEdit,
    order,
    deltaItems,
    type,
}: DocketPreviewModalProps) {
    if (!isOpen) return null;

    const isAddition = type === "addition";
    const displayItems = isAddition
        ? (deltaItems ?? []).map((d) => ({ name: d.name, quantity: d.quantity, price: d.price }))
        : order.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price }));

    const lineTotal = displayItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const now = order.createdAt ? new Date(order.createdAt) : new Date();
    const dateStr = now.toLocaleDateString("en-KE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xs flex flex-col items-center gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Paper receipt */}
                <div className="relative w-full bg-white rounded text-black font-mono text-[11px] px-3.5 py-4 shadow-2xl">
                    {/* Torn-paper top edge */}
                    <div
                        className="absolute -top-1.5 left-0 right-0 h-1.5"
                        style={{
                            background:
                                "repeating-linear-gradient(90deg,#fff 0px,#fff 8px,transparent 8px,transparent 12px)",
                        }}
                    />
                    {/* Header */}
                    <p className="text-center font-black text-sm tracking-wide">AM | PM</p>
                    <p className="text-center font-bold text-xs">CAPTAIN ORDER</p>
                    <p className="text-center text-[10px] text-gray-500">Terminal: Main Counter</p>
                    <hr className="border-dashed border-gray-400 my-1.5" />

                    {/* Addition banner */}
                    {isAddition && (
                        <div className="bg-black text-yellow-400 font-black text-[10px] text-center tracking-widest py-0.5 rounded mb-1.5">
                            ⚡ ADDITION — NOT A FULL ORDER ⚡
                        </div>
                    )}

                    {/* Metadata */}
                    <p className="text-[10px]">Order #: {order.orderNumber ?? "—"}</p>
                    <p className="text-[10px]">Date: {dateStr}</p>
                    <p className="text-[10px]">Time: {timeStr}</p>
                    <p className="text-[10px]">Server: {order.waiterName ?? "—"}</p>
                    <p className="text-[10px]">
                        Type: dine_in&nbsp;&nbsp;|&nbsp;&nbsp;Table: #{order.tableNumber ?? "—"}
                    </p>
                    <hr className="border-dashed border-gray-400 my-1.5" />

                    {/* Column header */}
                    <div className="flex justify-between text-[10px] font-bold">
                        <span>Qty&nbsp;&nbsp;Item</span>
                        <span>Price</span>
                    </div>
                    <hr className="border-dashed border-gray-400 my-1" />

                    {/* Items */}
                    {displayItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[11px] py-0.5">
                            <span>
                                <span className="mr-1">{item.quantity}x</span>
                                <span>{item.name}</span>
                            </span>
                            <span>
                                {(item.price * item.quantity).toLocaleString("en-KE", {
                                    minimumFractionDigits: 2,
                                })}
                            </span>
                        </div>
                    ))}

                    <hr className="border-dashed border-gray-400 my-1.5" />

                    {/* Total row */}
                    <div className="flex justify-between text-[13px] font-black">
                        <span>{isAddition ? "ADD TOTAL:" : "TOTAL:"}</span>
                        <span>
                            {lineTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    {/* Torn-paper bottom edge */}
                    <div
                        className="absolute -bottom-1.5 left-0 right-0 h-1.5"
                        style={{
                            background:
                                "repeating-linear-gradient(90deg,#fff 0px,#fff 8px,transparent 8px,transparent 12px)",
                        }}
                    />
                </div>

                {/* Status pill */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] rounded-full px-3 py-1 font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        ✓ Sent to printer
                    </span>
                    <span className="text-[10px] text-gray-600">Admin terminal printing…</span>
                </div>

                {/* Buttons */}
                <div className="flex gap-2.5 w-full">
                    <button
                        type="button"
                        onClick={onEdit}
                        className="flex-1 bg-neutral-800 border border-neutral-600 rounded-lg py-2.5 text-xs font-semibold text-neutral-200"
                    >
                        ✏️ {isAddition ? "Edit Again" : "Edit Order"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 bg-emerald-500 rounded-lg py-2.5 text-xs font-bold text-white"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
