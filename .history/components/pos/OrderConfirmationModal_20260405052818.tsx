"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Trash2, Edit2, Printer, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { CartItem } from "@/types/pos.types";

interface OrderConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: CartItem[];
    total: number;
    tableNumber?: number;
    customerName?: string;
    onPrint?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
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
    onPrint,
    onEdit,
    onDelete,
    onConfirm,
    isLoading,
    confirmLabel = "Confirm",
    title = "Order Details",
    description = "Review the order before taking action.",
}: OrderConfirmationModalProps) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    const handleDelete = () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }

        onDelete?.();
        setConfirmDelete(false);
        onClose();
    };

    const handlePrint = () => {
        onPrint?.();
        toast.success("Print job queued");
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="text-neutral-400">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                {/* Order Details */}
                <div className="space-y-4">
                    {/* Header Info */}
                    <div className="grid grid-cols-2 gap-4 p-3 bg-white/5 rounded-lg border border-white/10">
                        {tableNumber && (
                            <div>
                                <p className="text-xs text-neutral-400 mb-1">Table</p>
                                <p className="text-lg font-bold text-emerald-400">
                                    #{tableNumber}
                                </p>
                            </div>
                        )}
                        {customerName && (
                            <div>
                                <p className="text-xs text-neutral-400 mb-1">Customer</p>
                                <p className="text-sm font-medium text-white">
                                    {customerName}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Items List */}
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-neutral-300">Items</p>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                            {items.length === 0 ? (
                                <p className="text-sm text-neutral-400">No items</p>
                            ) : (
                                items.map((item) => (
                                    <div
                                        key={item.$id}
                                        className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5"
                                    >
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-white">
                                                {item.name}
                                            </p>
                                            {item.description && (
                                                <p className="text-[11px] text-neutral-500 line-clamp-2">
                                                    {item.description}
                                                </p>
                                            )}
                                            <p className="text-xs text-neutral-400 mt-1">
                                                {item.quantity}x @ {formatCurrency(item.price / item.quantity)}
                                            </p>
                                        </div>
                                        <p className="text-sm font-bold text-emerald-400">
                                            {formatCurrency(item.price * item.quantity)}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Total */}
                    <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 rounded-lg border border-emerald-500/20">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-neutral-300">
                                Order Total
                            </p>
                            <p className="text-2xl font-bold text-emerald-400">
                                {formatCurrency(total)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end pt-4 border-t border-white/10">
                    {confirmDelete && (
                        <div className="flex-1 flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                            <p className="text-xs text-red-300">
                                Click again to confirm deletion
                            </p>
                        </div>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            setConfirmDelete(false);
                            onEdit?.();
                        }}
                        disabled={isLoading}
                    >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrint}
                        disabled={isLoading}
                    >
                        <Printer className="w-4 h-4 mr-2" />
                        Print Docket
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isLoading}
                        className="border-red-500/20 text-red-400 hover:bg-red-500/10"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {confirmDelete ? "Confirm Delete" : "Delete"}
                    </Button>

                    <Button
                        onClick={onConfirm}
                        disabled={isLoading || items.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                        {isLoading ? "Confirming..." : confirmLabel}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
