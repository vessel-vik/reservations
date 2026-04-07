"use client";

import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import {
    getOpenOrdersSummary,
    settleSelectedOrders,
} from "@/lib/actions/pos.actions";
import { initializePaystackTransaction } from "@/lib/actions/paystack.actions";
import { Loader2, Search, X, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useOrganization, useUser } from "@clerk/nextjs";
import type { OpenOrder } from "@/types/pos.types";

type PaymentMethod = "cash" | "pdq" | "mpesa" | "paystack";

interface SettleTableTabModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSettlementSuccess?: (
        consolidatedOrderId: string,
        totalAmount: number,
        paymentMethod: string,
        paymentReference: string,
    ) => void;
}

/** Exported for unit tests */
export function orderAgeColor(ageMinutes: number): "green" | "amber" | "red" {
    if (ageMinutes < 60) return "green";
    if (ageMinutes < 180) return "amber";
    return "red";
}

function ageBadgeLabel(ageMinutes: number): string {
    if (ageMinutes < 60) return `${ageMinutes}m`;
    const h = Math.floor(ageMinutes / 60);
    const m = ageMinutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const COLOR_STYLES = {
    green: {
        card: "border-emerald-500/25 bg-emerald-500/[0.04]",
        dot: "#10b981",
        badge: "bg-emerald-500/15 text-emerald-300",
        amount: "text-emerald-400",
    },
    amber: {
        card: "border-amber-500/25 bg-amber-500/[0.04]",
        dot: "#f59e0b",
        badge: "bg-amber-500/15 text-amber-300",
        amount: "text-amber-400",
    },
    red: {
        card: "border-red-500/25 bg-red-500/[0.04]",
        dot: "#ef4444",
        badge: "bg-red-500/15 text-red-300",
        amount: "text-red-400",
    },
} as const;

function parseOrderItems(order: OpenOrder): { name: string; quantity: number; price: number }[] {
    const raw = order.items;
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => ({
        name: item.name || "Item",
        quantity: typeof item.quantity === "number" ? item.quantity : 1,
        price: typeof item.price === "number" ? item.price : 0,
    }));
}

export function SettleTableTabModal({
    isOpen,
    onClose,
    onSettlementSuccess,
}: SettleTableTabModalProps) {
    const { membership } = useOrganization();
    const { user } = useUser();
    const isAdmin = membership?.role === "org:admin";

    const [orders, setOrders] = useState<OpenOrder[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
    const [search, setSearch] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [urgentOnly, setUrgentOnly] = useState(false);

    // Payment sub-view state
    const [paymentSubview, setPaymentSubview] = useState<{
        type: "cash" | "pdq" | "mpesa";
        amount: number;
        orderIds: string[];
    } | null>(null);
    const [cashReceived, setCashReceived] = useState("");
    const [pdqCode, setPdqCode] = useState("");
    const [mpesaRef, setMpesaRef] = useState("");

    // Auto-load on open
    useEffect(() => {
        if (!isOpen) return;
        void loadOrders();
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadOrders = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const opts = (!isAdmin && user?.id) ? { waiterId: user.id } : undefined;
            const summary = await getOpenOrdersSummary(opts);
            setOrders(summary.orders);
            setSelectedIds([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load orders");
        } finally {
            setIsLoading(false);
        }
    };

    // Derived
    const filtered = orders.filter((o) => {
        if (urgentOnly && orderAgeColor(o.ageMinutes) !== "red") return false;
        if (!search) return true;
        return (
            String(o.tableNumber ?? "").includes(search) ||
            (o.orderNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (o.customerName ?? "").toLowerCase().includes(search.toLowerCase())
        );
    });

    const selectedOrders = orders.filter((o) => selectedIds.includes(o.$id));
    const selectedTotal = selectedOrders.reduce((s, o) => s + o.totalAmount, 0);
    const grandTotal = orders.reduce((s, o) => s + o.totalAmount, 0);

    const freshCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "green").length;
    const ageingCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "amber").length;
    const urgentCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "red").length;

    const handleToggleSelect = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        setSelectedIds(
            selectedIds.length === orders.length ? [] : orders.map((o) => o.$id)
        );
    };

    /**
     * Redirect-based Paystack flow — safe for tablet/mobile browsers.
     * Stores pending settlement in sessionStorage, then sends the browser
     * to Paystack's hosted page. On return, /pos/paystack-callback verifies
     * and settles the orders server-side.
     */
    const handlePaystackRedirect = async (orderIds: string[], amount: number): Promise<void> => {
        const syntheticOrderId = `tab-multi-${Date.now()}`;
        const uniqueEmail = `${syntheticOrderId}@ampm.co.ke`;
        const callbackUrl = `${window.location.origin}/pos/paystack-callback`;

        const initResult = await initializePaystackTransaction({
            email: uniqueEmail,
            amount,
            orderId: syntheticOrderId,
            metadata: { type: "table_tab_multi", orderIds },
            callback_url: callbackUrl,
        });

        if (!initResult.success || !initResult.authorization_url || !initResult.reference) {
            throw new Error(initResult.error || "Failed to initialize payment");
        }

        // Persist settlement context so the callback page can complete the job
        sessionStorage.setItem("paystack_pending_settlement", JSON.stringify({
            orderIds,
            amount,
            reference: initResult.reference,
        }));

        // Full-page redirect — Paystack's mobile-optimised payment interface
        window.location.href = initResult.authorization_url;
    };

    const settle = async (orderIds: string[], explicitRef?: string) => {
        if (!orderIds.length) return;
        setIsProcessing(true);
        setError(null);

        try {
            const amount = orders
                .filter((o) => orderIds.includes(o.$id))
                .reduce((s, o) => s + o.totalAmount, 0);

            let paymentReference = explicitRef ?? `manual-${paymentMethod}-${Date.now()}`;

            const result = await settleSelectedOrders({
                orderIds,
                paymentMethod,
                paymentReference,
            });

            if (!result.success) {
                throw new Error(result.message || "Settlement failed.");
            }

            toast.success(`${result.updatedCount} order(s) settled`);

            if (result.consolidatedOrderId) {
                onSettlementSuccess?.(result.consolidatedOrderId, amount, paymentMethod, paymentReference);
            }

            await loadOrders();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to settle orders.";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsProcessing(false);
        }
    };

    /** Open the appropriate payment sub-view, or redirect to Paystack for card/mobile-money. */
    const handleCharge = (orderIds: string[]) => {
        if (!orderIds.length) return;
        const amount = orders
            .filter((o) => orderIds.includes(o.$id))
            .reduce((s, o) => s + o.totalAmount, 0);

        if (paymentMethod === "paystack") {
            setIsProcessing(true);
            setError(null);
            handlePaystackRedirect(orderIds, amount).catch((err) => {
                const msg = err instanceof Error ? err.message : "Failed to start payment.";
                setError(msg);
                toast.error(msg);
                setIsProcessing(false);
            });
            return;
        }

        // Non-Paystack: open local sub-view for manual reference capture
        setCashReceived(amount.toFixed(2));
        setPdqCode("");
        setMpesaRef("");
        setPaymentSubview({ type: paymentMethod as "cash" | "pdq" | "mpesa", amount, orderIds });
    };

    const handleCloseSubview = () => setPaymentSubview(null);

    const handleConfirmCash = () => {
        if (!paymentSubview) return;
        const received = parseFloat(cashReceived) || 0;
        if (received < paymentSubview.amount) return;
        const change = Math.round((received - paymentSubview.amount) * 100);
        const ref = `CASH-CHG${change}-${Date.now()}`;
        void settle(paymentSubview.orderIds, ref);
        setPaymentSubview(null);
    };

    const handleConfirmPdq = () => {
        if (!paymentSubview || pdqCode.trim().length < 4) return;
        const ref = `PDQ-${pdqCode.trim().toUpperCase()}-${Date.now()}`;
        void settle(paymentSubview.orderIds, ref);
        setPaymentSubview(null);
    };

    const handleConfirmMpesa = () => {
        if (!paymentSubview || mpesaRef.trim().length < 6) return;
        const ref = `MPESA-${mpesaRef.trim().toUpperCase()}-${Date.now()}`;
        void settle(paymentSubview.orderIds, ref);
        setPaymentSubview(null);
    };

    const handleClose = () => {
        setOrders([]);
        setSelectedIds([]);
        setSearch("");
        setError(null);
        setUrgentOnly(false);
        setPaymentSubview(null);
        onClose();
    };

    const paymentChips: { value: PaymentMethod; label: string }[] = [
        { value: "cash", label: "Cash" },
        { value: "pdq", label: "PDQ" },
        { value: "mpesa", label: "M-Pesa" },
        { value: "paystack", label: "Paystack" },
    ];

    // Cash sub-view derived
    const cashReceivedNum = parseFloat(cashReceived) || 0;
    const cashChange = paymentSubview ? cashReceivedNum - paymentSubview.amount : 0;
    const cashShortfall = cashChange < 0;
    const cashConfirmReady = !cashShortfall && cashReceivedNum > 0;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-[#0a0a0f] border-white/[0.08] text-white max-w-3xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
                <DialogTitle className="sr-only">Settle Tab</DialogTitle>

                {/* Top bar */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 bg-neutral-900/80 border-b border-white/[0.07]">
                    {paymentSubview ? (
                        <button
                            type="button"
                            onClick={handleCloseSubview}
                            className="flex items-center gap-2 text-neutral-300 hover:text-white transition"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span className="text-[14px] font-semibold">
                                {paymentSubview.type === "cash" && "Cash Payment"}
                                {paymentSubview.type === "pdq" && "PDQ / Card Payment"}
                                {paymentSubview.type === "mpesa" && "M-Pesa Payment"}
                            </span>
                        </button>
                    ) : (
                        <div>
                            <h2 className="text-[15px] font-bold">Settle Tab</h2>
                            <p className="text-[11px] text-neutral-500 mt-0.5">
                                {orders.length} open order{orders.length !== 1 ? "s" : ""} · Today
                            </p>
                        </div>
                    )}
                    <button
                        onClick={handleClose}
                        className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-neutral-400 hover:text-white transition"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Stats row — hidden in sub-view */}
                {!paymentSubview && (
                    <div className="flex-shrink-0 flex gap-2.5 px-5 py-3 bg-neutral-950/70 border-b border-white/[0.06]">
                        {[
                            { label: "Fresh <1hr", value: freshCount, color: "text-emerald-400" },
                            { label: "Ageing 1–3hr", value: ageingCount, color: "text-amber-400" },
                            { label: "Urgent >3hr", value: urgentCount, color: "text-red-400" },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3 py-1.5">
                                <div className="text-[9px] uppercase tracking-[0.1em] text-neutral-500">{label}</div>
                                <div className={`text-[14px] font-bold ${color}`}>{value}</div>
                            </div>
                        ))}
                        <div className="rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 ml-auto">
                            <div className="text-[9px] uppercase tracking-[0.1em] text-neutral-500">Total outstanding</div>
                            <div className="text-[14px] font-bold text-white">{formatCurrency(grandTotal)}</div>
                        </div>
                    </div>
                )}

                {/* Filter bar — hidden in sub-view */}
                {!paymentSubview && (
                    <div className="flex-shrink-0 flex gap-2 px-5 py-2.5 bg-neutral-950/70 border-b border-white/[0.06]">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by table, order #, name…"
                                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-[10px] pl-8 pr-3 py-1.5 text-[11px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-white/20"
                            />
                        </div>
                        <button
                            onClick={() => setUrgentOnly(false)}
                            className={`rounded-[20px] px-3 py-1 text-[10px] font-semibold border transition ${!urgentOnly ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-white/[0.04] border-white/10 text-neutral-400"}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setUrgentOnly(true)}
                            className={`rounded-[20px] px-3 py-1 text-[10px] font-semibold border transition ${urgentOnly ? "bg-red-500/15 border-red-500/40 text-red-300" : "bg-white/[0.04] border-white/10 text-neutral-400"}`}
                        >
                            Urgent
                        </button>
                    </div>
                )}

                {/* Main area: payment sub-view OR order list */}
                {paymentSubview ? (
                    <div className="flex-1 flex flex-col justify-between overflow-hidden">
                        {/* Amount banner */}
                        <div className="flex-shrink-0 text-center px-6 pt-8 pb-6 border-b border-white/[0.06]">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-500 mb-1">
                                Amount to collect
                            </div>
                            <div className="text-[42px] font-extrabold text-white leading-none">
                                {formatCurrency(paymentSubview.amount)}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-2">
                                {paymentSubview.orderIds.length} order{paymentSubview.orderIds.length !== 1 ? "s" : ""}
                            </div>
                        </div>

                        {/* Sub-view input */}
                        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
                            {paymentSubview.type === "cash" && (
                                <>
                                    <div className="w-full max-w-xs">
                                        <label className="block text-[11px] text-neutral-400 mb-1.5">
                                            Cash received (KES)
                                        </label>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            step="0.01"
                                            value={cashReceived}
                                            onChange={(e) => setCashReceived(e.target.value)}
                                            className="w-full bg-white/[0.06] border border-white/[0.12] rounded-[12px] px-4 py-3 text-[20px] font-bold text-white text-center focus:outline-none focus:border-emerald-500/60 tabular-nums"
                                            autoFocus
                                        />
                                    </div>
                                    {cashReceived && (
                                        <div className={`rounded-[12px] px-5 py-3 text-center ${cashShortfall ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
                                            <div className="text-[10px] uppercase tracking-[0.1em] mb-0.5 text-neutral-400">
                                                {cashShortfall ? "Shortfall" : "Change due"}
                                            </div>
                                            <div className={`text-[22px] font-extrabold ${cashShortfall ? "text-red-400" : "text-emerald-400"}`}>
                                                {formatCurrency(Math.abs(cashChange))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {paymentSubview.type === "pdq" && (
                                <div className="w-full max-w-xs">
                                    <label className="block text-[11px] text-neutral-400 mb-1.5">
                                        Terminal approval code
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={10}
                                        value={pdqCode}
                                        onChange={(e) => setPdqCode(e.target.value.toUpperCase())}
                                        placeholder="e.g. 123456"
                                        className="w-full bg-white/[0.06] border border-white/[0.12] rounded-[12px] px-4 py-3 text-[20px] font-bold text-white text-center tracking-[0.18em] focus:outline-none focus:border-sky-500/60 uppercase"
                                        autoFocus
                                    />
                                    <p className="text-[10px] text-neutral-600 text-center mt-2">
                                        6-digit code from the card terminal receipt
                                    </p>
                                </div>
                            )}

                            {paymentSubview.type === "mpesa" && (
                                <div className="w-full max-w-xs">
                                    <label className="block text-[11px] text-neutral-400 mb-1.5">
                                        M-Pesa transaction code
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={12}
                                        value={mpesaRef}
                                        onChange={(e) => setMpesaRef(e.target.value.toUpperCase())}
                                        placeholder="e.g. RGH12345XY"
                                        className="w-full bg-white/[0.06] border border-white/[0.12] rounded-[12px] px-4 py-3 text-[20px] font-bold text-white text-center tracking-[0.12em] focus:outline-none focus:border-green-500/60 uppercase"
                                        autoFocus
                                    />
                                    <p className="text-[10px] text-neutral-600 text-center mt-2">
                                        Confirmation code from the M-Pesa SMS
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Sub-view action buttons */}
                        <div className="flex-shrink-0 bg-neutral-900/95 border-t border-white/10 px-5 py-4 flex gap-3">
                            <button
                                type="button"
                                onClick={handleCloseSubview}
                                className="flex-1 rounded-[12px] py-3 text-[13px] font-bold bg-transparent text-neutral-400 border border-white/10 hover:border-white/20 transition"
                            >
                                ← Back
                            </button>

                            {paymentSubview.type === "cash" && (
                                <button
                                    type="button"
                                    onClick={handleConfirmCash}
                                    disabled={!cashConfirmReady || isProcessing}
                                    className="flex-[2] rounded-[12px] py-3 text-[13px] font-bold bg-emerald-500 text-white hover:bg-emerald-400 transition disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Confirm Cash · {formatCurrency(paymentSubview.amount)}
                                </button>
                            )}

                            {paymentSubview.type === "pdq" && (
                                <button
                                    type="button"
                                    onClick={handleConfirmPdq}
                                    disabled={pdqCode.trim().length < 4 || isProcessing}
                                    className="flex-[2] rounded-[12px] py-3 text-[13px] font-bold bg-sky-500 text-white hover:bg-sky-400 transition disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Confirm PDQ · {formatCurrency(paymentSubview.amount)}
                                </button>
                            )}

                            {paymentSubview.type === "mpesa" && (
                                <button
                                    type="button"
                                    onClick={handleConfirmMpesa}
                                    disabled={mpesaRef.trim().length < 6 || isProcessing}
                                    className="flex-[2] rounded-[12px] py-3 text-[13px] font-bold bg-green-500 text-white hover:bg-green-400 transition disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Confirm M-Pesa · {formatCurrency(paymentSubview.amount)}
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Order list */}
                        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                            {isLoading && (
                                <div className="flex justify-center items-center py-10">
                                    <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                                </div>
                            )}

                            {!isLoading && error && (
                                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                                    {error}
                                </div>
                            )}

                            {!isLoading && !error && filtered.length === 0 && (
                                <div className="text-center py-10 text-sm text-neutral-500">
                                    {orders.length === 0 ? "No unpaid orders — all tabs are clear." : "No orders match the filter."}
                                </div>
                            )}

                            {filtered.map((order) => {
                                const color = orderAgeColor(order.ageMinutes);
                                const styles = COLOR_STYLES[color];
                                const isSelected = selectedIds.includes(order.$id);
                                const isExpanded = expandedId === order.$id;
                                const items = parseOrderItems(order);
                                const tableLabel = order.tableNumber ? `Table ${order.tableNumber}` : "Bar";

                                return (
                                    <div
                                        key={order.$id}
                                        className={`rounded-[14px] border overflow-hidden ${styles.card} ${isSelected ? "ring-2 ring-emerald-500" : ""}`}
                                    >
                                        {/* Card row */}
                                        <div
                                            className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer"
                                            onClick={() => setExpandedId(isExpanded ? null : order.$id)}
                                        >
                                            {/* Checkbox */}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleToggleSelect(order.$id); }}
                                                className={`w-[22px] h-[22px] rounded-[7px] border flex items-center justify-center flex-shrink-0 text-[12px] transition ${isSelected ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white/[0.04] border-white/15 text-neutral-300"}`}
                                            >
                                                {isSelected ? "✓" : ""}
                                            </button>

                                            {/* Age dot */}
                                            <div
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: styles.dot }}
                                            />

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[12px] font-semibold truncate">
                                                    {tableLabel} &nbsp;·&nbsp; #{order.orderNumber || order.$id.slice(-6)}
                                                </div>
                                                <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-1.5">
                                                    {order.customerName || "Walk-in"}
                                                    &nbsp;·&nbsp;
                                                    {new Date(order.orderTime).toLocaleTimeString("en-KE", { timeStyle: "short" })}
                                                    &nbsp;
                                                    <span className={`rounded-[20px] px-1.5 py-0.5 text-[9px] font-bold ${styles.badge}`}>
                                                        {ageBadgeLabel(order.ageMinutes)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Amount */}
                                            <div className={`text-[13px] font-bold flex-shrink-0 ${styles.amount}`}>
                                                {formatCurrency(order.totalAmount)}
                                            </div>

                                            {/* Expand icon */}
                                            <div className="text-neutral-500 flex-shrink-0">
                                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            </div>
                                        </div>

                                        {/* Expanded items */}
                                        {isExpanded && (
                                            <div className="border-t border-white/[0.06] px-3.5 pb-3 pt-2 space-y-1">
                                                {items.length === 0 ? (
                                                    <p className="text-[10px] text-neutral-500">No item breakdown.</p>
                                                ) : (
                                                    items.map((item, i) => (
                                                        <div key={i} className="flex justify-between text-[10px] text-neutral-400 py-0.5">
                                                            <span>{item.quantity}× {item.name}</span>
                                                            <span>{formatCurrency(item.price * item.quantity)}</span>
                                                        </div>
                                                    ))
                                                )}
                                                <div className="flex justify-between text-[10px] font-bold border-t border-dashed border-white/[0.08] mt-1 pt-1.5">
                                                    <span className={styles.amount}>Total</span>
                                                    <span className={styles.amount}>{formatCurrency(order.totalAmount)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Sticky bottom bar */}
                        <div className="flex-shrink-0 bg-neutral-900/95 border-t border-white/10 px-5 py-3">
                            {/* Selection summary + payment chips */}
                            <div className="flex items-end justify-between mb-2.5">
                                <div>
                                    <div className="text-[11px] text-neutral-500">
                                        {selectedIds.length} order{selectedIds.length !== 1 ? "s" : ""} selected
                                    </div>
                                    <div className="text-[18px] font-extrabold text-white">
                                        {formatCurrency(selectedTotal)}
                                    </div>
                                </div>
                                <div className="flex gap-1.5">
                                    {paymentChips.map(({ value, label }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setPaymentMethod(value)}
                                            className={`rounded-[20px] px-2.5 py-1 text-[10px] font-semibold border transition ${paymentMethod === value ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white/[0.04] border-white/10 text-neutral-400"}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleSelectAll}
                                    disabled={orders.length === 0}
                                    className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold bg-transparent text-neutral-400 border border-white/10 hover:border-white/20 transition disabled:opacity-40"
                                >
                                    {selectedIds.length === orders.length && orders.length > 0 ? "Deselect All" : "Select All"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCharge(selectedIds)}
                                    disabled={!selectedIds.length || isProcessing}
                                    className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold bg-sky-500 text-white hover:bg-sky-400 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                                >
                                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                    Charge Selected · {formatCurrency(selectedTotal)}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCharge(orders.map((o) => o.$id))}
                                    disabled={orders.length === 0 || isProcessing}
                                    className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold bg-emerald-500 text-white hover:bg-emerald-400 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                                >
                                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                    Charge All · {formatCurrency(grandTotal)}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
