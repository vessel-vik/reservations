"use client";

import { useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Edit2 } from "lucide-react";
import { CartItem } from "@/types/pos.types";

function safeConfirmationItems(raw: CartItem[] | undefined): CartItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item, idx) => {
        const qty = Math.max(1, Math.floor(Number(item?.quantity) || 1));
        const price = typeof item?.price === "number" && !Number.isNaN(item.price) ? item.price : 0;
        return {
            $id: String(item?.$id ?? `line-${idx}`),
            name: String(item?.name ?? "Unknown"),
            description: typeof item?.description === "string" ? item.description : "",
            price,
            category: item?.category ?? "",
            imageUrl: item?.imageUrl,
            isAvailable: item?.isAvailable !== false,
            preparationTime: Number(item?.preparationTime) || 0,
            popularity: Number(item?.popularity) || 0,
            isVegetarian: Boolean(item?.isVegetarian),
            isVegan: Boolean(item?.isVegan),
            isGlutenFree: Boolean(item?.isGlutenFree),
            quantity: qty,
            notes: item?.notes,
        } as CartItem;
    });
}

interface OrderConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: CartItem[];
    total: number;
    tableNumber?: number;
    customerName?: string;
    onEdit?: () => void;
    onConfirm?: () => void;
    isLoading?: boolean;
    confirmLabel?: string;
    title?: string;
    description?: string;
}

export function OrderConfirmationModal({
    isOpen,
    onClose,
    items,
    total,
    tableNumber,
    customerName,
    onEdit,
    onConfirm,
    isLoading,
    confirmLabel = "Confirm",
    title = "Order Details",
    description = "Review the order before taking action.",
}: OrderConfirmationModalProps) {
    const displayItems = useMemo(() => safeConfirmationItems(items), [items]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="text-neutral-400">{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 p-3 bg-white/5 rounded-lg border border-white/10">
                        {tableNumber != null && (
                            <div>
                                <p className="text-xs text-neutral-400 mb-1">Table</p>
                                <p className="text-lg font-bold text-emerald-400">#{tableNumber}</p>
                            </div>
                        )}
                        {customerName && (
                            <div>
                                <p className="text-xs text-neutral-400 mb-1">Customer</p>
                                <p className="text-sm font-medium text-white">{customerName}</p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-neutral-300">Items</p>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                            {displayItems.length === 0 ? (
                                <p className="text-sm text-neutral-400">No items</p>
                            ) : (
                                displayItems.map((item, idx) => (
                                    <div
                                        key={`${item.$id}-${idx}`}
                                        className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5"
                                    >
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-white">{item.name}</p>
                                            {item.description && (
                                                <p className="text-[11px] text-neutral-500 line-clamp-2">
                                                    {item.description}
                                                </p>
                                            )}
                                            <p className="text-xs text-neutral-400 mt-1">
                                                {item.quantity}× @ {formatCurrency(item.price)}
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-emerald-400 tabular-nums">
                                            {formatCurrency(item.price * item.quantity)}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 rounded-lg border border-emerald-500/20">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-neutral-300">Order Total</p>
                            <p className="text-2xl font-bold text-emerald-400 tabular-nums">
                                {formatCurrency(total)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end pt-4 border-t border-white/10">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit?.()}
                        disabled={isLoading}
                    >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit
                    </Button>

                    <Button
                        onClick={onConfirm}
                        disabled={isLoading || displayItems.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                        {isLoading ? "Confirming…" : confirmLabel}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
