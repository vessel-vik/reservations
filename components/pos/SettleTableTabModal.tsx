"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import {
    getOpenOrdersSummary,
} from "@/lib/actions/pos.actions";
import { initializePaystackTransaction } from "@/lib/actions/paystack.actions";
import {
    Loader2,
    Search,
    ChevronDown,
    ChevronUp,
    ArrowLeft,
    Plus,
    Trash2,
    ArrowUp,
    ArrowDown,
    Copy,
    Eraser,
} from "lucide-react";
import { toast } from "sonner";
import { useOrganization, useUser } from "@clerk/nextjs";
import type { OpenOrder } from "@/types/pos.types";
import { client } from "@/lib/appwrite-client";
import { displayPaymentMethod } from "@/lib/payment-display";
import { StaffGuidePanel } from "@/components/pos/StaffGuidePanel";
import {
    STAFF_GUIDE_SETTLE_SPLIT,
    STAFF_GUIDE_SETTLE_TAB_LIST,
    SPLIT_HINT_CASH,
    SPLIT_HINT_MPESA,
    SPLIT_HINT_PDQ,
} from "@/lib/pos-settlement-staff-guide";
import { getSplitBlockingMessages } from "@/lib/pos-split-validation";
import { getOrCreateTerminalInstallId } from "@/lib/terminal-id";
import { settleViaQueue } from "@/lib/payment-settlement-client";
import { PAYBILL_INFO } from "@/lib/receipt-paybill";
import { normalizeReference, validateReferenceForMethod } from "@/lib/payment-reference-policy";
import { extractBankPaybillConfirmation } from "@/lib/payment-realtime";
import { subscribeWithRetry } from "@/lib/realtime-subscribe";

const RT_DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID!;
const RT_ORDERS_COLLECTION_ID = process.env.NEXT_PUBLIC_ORDERS_COLLECTION_ID!;

type PaymentMethod = "cash" | "pdq" | "mpesa" | "paystack" | "bank_paybill";

export type SettlementSuccessMeta = {
    paymentMethods?: Array<{ method: string; amount: number; reference?: string }>;
    paymentReference?: string;
    primaryPaymentLabel?: string;
};

interface SettleTableTabModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSettlementSuccess?: (
        consolidatedOrderId: string,
        totalAmount: number,
        meta: SettlementSuccessMeta,
    ) => void;
    onBankRealtimeConfirmed?: (payload: {
        amount: number;
        reference: string;
        settledAt?: string;
        orderIds?: string[];
    }) => void;
}

type SplitRow = {
    id: string;
    method: "cash" | "pdq" | "mpesa" | "bank_paybill";
    amount: string;
    reference: string;
};
type SplitField = "method" | "amount" | "reference";

type ListFilter = "all" | "newest" | "recent" | "urgent";
type SplitTemplate = "cash_mpesa" | "pdq_cash" | "equal" | "sixty_forty" | "seventy_thirty";

const SPLIT_EPS = 0.05;
const RECENT_ORDER_WINDOW_MINUTES = 15;
const RECENT_EXTENDED_WINDOW_MINUTES = 30;
const SPLIT_PREFS_KEY_BASE = "pos_split_prefs_v1";

function newSplitRow(method: SplitRow["method"]): SplitRow {
    return { id: crypto.randomUUID(), method, amount: "", reference: "" };
}

/** Exported for unit tests */
export function orderAgeColor(ageMinutes: number): "green" | "amber" | "red" {
    if (ageMinutes < 60) return "green";
    if (ageMinutes < 180) return "amber";
    return "red";
}

/** Human-readable age (avoids confusing multi-day orders as "739h"). */
export function formatOrderAge(ageMinutes: number): string {
    if (!Number.isFinite(ageMinutes) || ageMinutes < 0) return "—";
    if (ageMinutes < 60) return `${Math.floor(ageMinutes)}m`;
    if (ageMinutes < 1440) {
        const h = Math.floor(ageMinutes / 60);
        const m = Math.floor(ageMinutes % 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.floor(ageMinutes / 1440);
    const remMin = ageMinutes % 1440;
    const h = Math.floor(remMin / 60);
    if (d >= 14) return `${d}d`;
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
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
    onBankRealtimeConfirmed,
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
    const [listFilter, setListFilter] = useState<ListFilter>("all");

    // Split-payment sub-view (cash / PDQ / M-Pesa Paybill — any mix that totals the bill)
    const [paymentSubview, setPaymentSubview] = useState<{
        amount: number;
        orderIds: string[];
    } | null>(null);
    const [bankSubview, setBankSubview] = useState<{
        amount: number;
        orderIds: string[];
        orderReferenceHint?: string;
    } | null>(null);
    const [bankReference, setBankReference] = useState("");
    const [bankStatus, setBankStatus] = useState<"idle" | "awaiting_payment" | "checking" | "confirmed" | "failed">("idle");
    const [bankMessage, setBankMessage] = useState("");
    const [bankProviderAmount, setBankProviderAmount] = useState<number | null>(null);
    const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
    const [splitGuideOpen, setSplitGuideOpen] = useState(true);
    const [compactSplitRows, setCompactSplitRows] = useState(false);
    const [lastSplitTemplate, setLastSplitTemplate] = useState<SplitTemplate | null>(null);
    const [splitBalancedPulse, setSplitBalancedPulse] = useState(false);
    const [movedSplitRowId, setMovedSplitRowId] = useState("");
    const [splitRowMenuId, setSplitRowMenuId] = useState("");
    const [splitKeypadMode, setSplitKeypadMode] = useState(false);
    const [activeSplitAmountRowId, setActiveSplitAmountRowId] = useState("");
    const [splitReadyFlashRowId, setSplitReadyFlashRowId] = useState("");
    const [paystackCustomerPhone, setPaystackCustomerPhone] = useState("");
    const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bankRealtimeAckRef = useRef(false);
    const prevBalancedRef = useRef(false);
    const splitRefInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const splitMethodRefs = useRef<Record<string, HTMLSelectElement | null>>({});
    const splitAmountRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const splitRowMenuRef = useRef<HTMLDivElement | null>(null);
    const rowLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevRowReadyRef = useRef<Record<string, boolean>>({});

    const splitPrefsKey = `${SPLIT_PREFS_KEY_BASE}:${user?.id || "anon"}`;

    const loadOrders = useCallback(async () => {
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
    }, [isAdmin, user?.id]);

    // Initial load when opened
    useEffect(() => {
        if (!isOpen) return;
        void loadOrders();
    }, [isOpen, loadOrders]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(splitPrefsKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                compact?: boolean;
                lastTemplate?: SplitTemplate;
                keypad?: boolean;
            };
            if (typeof parsed.compact === "boolean") {
                setCompactSplitRows(parsed.compact);
            }
            if (typeof parsed.lastTemplate === "string") {
                setLastSplitTemplate(parsed.lastTemplate);
            }
            if (typeof parsed.keypad === "boolean") {
                setSplitKeypadMode(parsed.keypad);
            }
        } catch {
            // ignore malformed preferences
        }
    }, [splitPrefsKey]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            localStorage.setItem(
                splitPrefsKey,
                JSON.stringify({
                    compact: compactSplitRows,
                    lastTemplate: lastSplitTemplate,
                    keypad: splitKeypadMode,
                })
            );
        } catch {
            // ignore storage failures
        }
    }, [compactSplitRows, lastSplitTemplate, splitKeypadMode, splitPrefsKey]);

    useEffect(() => {
        if (!splitRowMenuId) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!splitRowMenuRef.current) return;
            const target = event.target as Node | null;
            if (target && splitRowMenuRef.current.contains(target)) return;
            setSplitRowMenuId("");
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [splitRowMenuId]);

    useEffect(() => {
        if (!activeSplitAmountRowId) return;
        const exists = splitRows.some((row) => row.id === activeSplitAmountRowId);
        if (!exists) {
            setActiveSplitAmountRowId("");
        }
    }, [activeSplitAmountRowId, splitRows]);

    useEffect(() => {
        return () => {
            if (rowLongPressTimerRef.current) {
                clearTimeout(rowLongPressTimerRef.current);
            }
        };
    }, []);

    // Appwrite Realtime: refresh unpaid list when orders collection changes (Pro)
    useEffect(() => {
        if (!isOpen || !RT_DATABASE_ID || !RT_ORDERS_COLLECTION_ID) return;

        const channel = `databases.${RT_DATABASE_ID}.collections.${RT_ORDERS_COLLECTION_ID}.documents`;
        const unsubscribe = subscribeWithRetry(
            () =>
                client.subscribe(channel, (response) => {
                    const payload = response?.payload as Record<string, unknown> | null;
                    const payloadOrderId = String(payload?.$id || "");
                    if (bankSubview && payloadOrderId && bankSubview.orderIds.includes(payloadOrderId)) {
                        const confirmation = extractBankPaybillConfirmation(payload as any, {
                            referenceContains: normalizeReference(bankReference),
                        });
                        if (confirmation && !bankRealtimeAckRef.current) {
                            bankRealtimeAckRef.current = true;
                            setBankStatus("confirmed");
                            setBankProviderAmount(confirmation.amount);
                            const settledLabel = confirmation.settledAt
                                ? new Date(confirmation.settledAt).toLocaleTimeString("en-KE", { timeStyle: "short" })
                                : "now";
                            setBankMessage(
                                `Realtime confirmed: ${formatCurrency(confirmation.amount)} · Ref ${confirmation.reference} · ${settledLabel}`
                            );
                            toast.success("Bank paybill confirmed from callback.");
                            onBankRealtimeConfirmed?.({
                                amount: confirmation.amount,
                                reference: confirmation.reference,
                                settledAt: confirmation.settledAt,
                                orderIds: bankSubview.orderIds,
                            });
                        }
                    }
                    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
                    refreshDebounceRef.current = setTimeout(() => {
                        void loadOrders();
                    }, 450);
                }),
            { maxAttempts: 5, initialDelayMs: 120 }
        );

        return () => {
            unsubscribe();
            if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
        };
    }, [bankReference, bankSubview, isOpen, loadOrders, onBankRealtimeConfirmed]);

    // Derived
    const nowMs = Date.now();
    const isRecentOrder = (order: OpenOrder): boolean => {
        const createdMs = new Date(String(order.orderTime || "")).getTime();
        if (!Number.isFinite(createdMs)) {
            return order.ageMinutes <= RECENT_ORDER_WINDOW_MINUTES;
        }
        return nowMs - createdMs <= RECENT_ORDER_WINDOW_MINUTES * 60_000;
    };
    const isExtendedRecentOrder = (order: OpenOrder): boolean => {
        const createdMs = new Date(String(order.orderTime || "")).getTime();
        if (!Number.isFinite(createdMs)) {
            return order.ageMinutes <= RECENT_EXTENDED_WINDOW_MINUTES;
        }
        return nowMs - createdMs <= RECENT_EXTENDED_WINDOW_MINUTES * 60_000;
    };

    const filtered = orders.filter((o) => {
        if (listFilter === "urgent" && orderAgeColor(o.ageMinutes) !== "red") return false;
        if (listFilter === "newest" && !isRecentOrder(o)) return false;
        if (listFilter === "recent" && !isExtendedRecentOrder(o)) return false;
        if (!search) return true;
        return (
            String(o.tableNumber ?? "").includes(search) ||
            (o.orderNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (o.customerName ?? "").toLowerCase().includes(search.toLowerCase())
        );
    });
    const visibleOrders = [...filtered].sort((a, b) => {
        const ta = new Date(String(a.orderTime || 0)).getTime();
        const tb = new Date(String(b.orderTime || 0)).getTime();
        if (listFilter === "newest" || listFilter === "recent") return tb - ta;
        if (listFilter === "urgent") return b.ageMinutes - a.ageMinutes;
        return ta - tb;
    });

    const selectedOrders = orders.filter((o) => selectedIds.includes(o.$id));
    const selectedTotal = selectedOrders.reduce((s, o) => s + o.totalAmount, 0);
    const grandTotal = orders.reduce((s, o) => s + o.totalAmount, 0);

    const freshCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "green").length;
    const newestCount = orders.filter((o) => isRecentOrder(o)).length;
    const recentCount = orders.filter((o) => isExtendedRecentOrder(o)).length;
    const ageingCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "amber").length;
    const urgentCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "red").length;

    const handleToggleSelect = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        const visibleIds = visibleOrders.map((o) => o.$id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
        setSelectedIds(allVisibleSelected ? [] : visibleIds);
    };

    /**
     * Redirect-based Paystack flow — safe for tablet/mobile browsers.
     * Stores pending settlement in sessionStorage, then sends the browser
     * to Paystack's hosted page. On return, /pos/paystack-callback verifies
     * and settles the orders server-side.
     */
    const paystackCheckoutEmail = (syntheticOrderId: string): string => {
        const digits = paystackCustomerPhone.replace(/\D/g, "");
        if (digits.length >= 9) return `${digits}@ampm.co.ke`;
        return `${syntheticOrderId}@ampm.co.ke`;
    };

    const handlePaystackRedirect = async (orderIds: string[], amount: number): Promise<void> => {
        const syntheticOrderId = `tab-multi-${Date.now()}`;
        const uniqueEmail = paystackCheckoutEmail(syntheticOrderId);
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
            flow: "tab_multi" as const,
            orderIds,
            amount,
            reference: initResult.reference,
        }));

        // Full-page redirect — Paystack's mobile-optimised payment interface
        window.location.href = initResult.authorization_url;
    };

    const settle = async (
        orderIds: string[],
        paymentSplits: { method: string; amount: number; reference?: string; terminalId?: string }[]
    ): Promise<boolean> => {
        if (!orderIds.length || !paymentSplits.length) return false;
        setIsProcessing(true);
        setError(null);

        try {
            const amount = orders
                .filter((o) => orderIds.includes(o.$id))
                .reduce((s, o) => s + o.totalAmount, 0);

            const result = await settleViaQueue({
                orderIds,
                paymentSplits,
                paymentMethod: paymentSplits[0]?.method || "cash",
                terminalId: getOrCreateTerminalInstallId(),
            });

            if (!result.success) {
                throw new Error(result.message || "Settlement failed.");
            }

            toast.success(`${result.updatedCount || 0} order(s) settled`);

            if (result.consolidatedOrderId) {
                const methods = "paymentMethods" in result && Array.isArray(result.paymentMethods)
                    ? result.paymentMethods
                    : paymentSplits;
                const primary =
                    methods.length > 1
                        ? "Split payment"
                        : methods[0]
                          ? displayPaymentMethod(methods[0].method)
                          : displayPaymentMethod(paymentMethod);
                onSettlementSuccess?.(result.consolidatedOrderId, amount, {
                    paymentMethods: methods as SettlementSuccessMeta["paymentMethods"],
                    paymentReference: result.paymentReference,
                    primaryPaymentLabel: primary,
                });
            }

            await loadOrders();
            return true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to settle orders.";
            setError(msg);
            toast.error(msg);
            return false;
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

        if (paymentMethod === "bank_paybill") {
            const selected = orders.filter((o) => orderIds.includes(o.$id));
            bankRealtimeAckRef.current = false;
            setBankSubview({
                amount,
                orderIds,
                orderReferenceHint: selected[0]?.orderNumber || selected[0]?.$id,
            });
            setBankReference("");
            setBankStatus("awaiting_payment");
            setBankMessage("Awaiting customer payment...");
            setBankProviderAmount(null);
            return;
        }

        const defaultMethod: SplitRow["method"] =
            paymentMethod === "pdq" || paymentMethod === "mpesa" || paymentMethod === "bank_paybill"
                ? paymentMethod
                : "cash";
        setSplitRows([{ ...newSplitRow(defaultMethod), amount: amount.toFixed(2) }]);
        setPaymentSubview({ amount, orderIds });
    };

    const handleCloseSubview = () => {
        setPaymentSubview(null);
        setBankSubview(null);
        setSplitRows([]);
        setSplitGuideOpen(true);
        setCompactSplitRows(false);
        setBankReference("");
        setBankStatus("idle");
        setBankMessage("");
        setBankProviderAmount(null);
        bankRealtimeAckRef.current = false;
    };

    const handleConfirmSplit = () => {
        if (!paymentSubview) return;
        const due = paymentSubview.amount;
        const blockers = getSplitBlockingMessages(splitRows, due, formatCurrency);
        if (blockers.length > 0) {
            toast.error(blockers[0] ?? "Check the payment lines.");
            return;
        }

        const parsed = splitRows.map((r) => ({
            method: r.method,
            amount: parseFloat(r.amount) || 0,
            reference: r.reference.trim(),
        }));

        const forApi = parsed.map((row) => ({
            method: row.method,
            amount: row.amount,
            ...(row.method === "pdq" || row.method === "mpesa" || row.method === "bank_paybill"
                ? {
                      reference:
                          row.method === "pdq"
                              ? `PDQ-${row.reference.toUpperCase()}-${Date.now()}`
                              : row.method === "mpesa"
                                ? `MPESA-${row.reference.toUpperCase()}-${Date.now()}`
                                : `JENGA-${row.reference.toUpperCase()}-${Date.now()}`,
                  }
                : {}),
        }));

        void (async () => {
            const ok = await settle(
                paymentSubview.orderIds,
                forApi.map((line) => ({
                    ...line,
                    terminalId: getOrCreateTerminalInstallId(),
                }))
            );
            if (ok) {
                setPaymentSubview(null);
                setSplitRows([]);
            }
        })();
    };

    const handleBankCheckNow = () => {
        if (!bankSubview) return;
        const ref = bankReference.trim().toUpperCase();
        if (!ref || ref.length < 6) {
            toast.error("Enter the bank transaction reference first.");
            return;
        }

        setBankStatus("checking");
        setBankMessage("Checking provider status...");
        setError(null);
        void (async () => {
            try {
                const response = await fetch("/api/payments/jenga/reconcile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        reference: ref,
                        orderReference: bankSubview.orderReferenceHint || undefined,
                    }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data?.error || "Failed to check bank payment status.");
                }

                const status = String(data?.status || "").toLowerCase();
                const providerAmount = Number(data?.provider?.data?.amount);
                setBankProviderAmount(Number.isFinite(providerAmount) ? providerAmount : null);

                if (status === "confirmed") {
                    if (Number.isFinite(providerAmount) && Math.abs(providerAmount - bankSubview.amount) > 0.5) {
                        setBankStatus("failed");
                        setBankMessage(
                            `Provider amount ${formatCurrency(providerAmount)} does not match due ${formatCurrency(
                                bankSubview.amount
                            )}.`
                        );
                        return;
                    }

                    const ok = await settle(bankSubview.orderIds, [
                        {
                            method: "bank_paybill",
                            amount: bankSubview.amount,
                            reference: `JENGA-${ref}-${Date.now()}`,
                            terminalId: getOrCreateTerminalInstallId(),
                        },
                    ]);
                    if (ok) {
                        setBankStatus("confirmed");
                        setBankMessage("Payment confirmed and settlement completed.");
                        setBankSubview(null);
                        setBankReference("");
                        setBankProviderAmount(null);
                    }
                    return;
                }

                if (status === "failed") {
                    setBankStatus("failed");
                    setBankMessage("Provider reported failed/rejected transaction.");
                    return;
                }

                setBankStatus("awaiting_payment");
                setBankMessage("Still pending. Ask customer to complete payment then check again.");
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to check status";
                setBankStatus("failed");
                setBankMessage(message);
                setError(message);
            }
        })();
    };

    const handleClose = () => {
        setOrders([]);
        setSelectedIds([]);
        setSearch("");
        setError(null);
        setListFilter("all");
        setPaymentSubview(null);
        setBankSubview(null);
        setSplitRows([]);
        setSplitGuideOpen(true);
        setCompactSplitRows(false);
        setBankReference("");
        setBankStatus("idle");
        setBankMessage("");
        setBankProviderAmount(null);
        setPaystackCustomerPhone("");
        onClose();
    };

    const paymentChips: { value: PaymentMethod; label: string; blurb: string }[] = [
        {
            value: "cash",
            label: "Cash",
            blurb: "Then split cash / PDQ / M-Pesa lines so the maths matches the bill.",
        },
        {
            value: "pdq",
            label: "PDQ",
            blurb: "Starts with card terminal as first line—you can add cash or M-Pesa rows too.",
        },
        {
            value: "mpesa",
            label: "M-Pesa Paybill",
            blurb: "Starts with Paybill payment—you can add more rows if they also paid cash or card.",
        },
        {
            value: "bank_paybill",
            label: "Bank Paybill",
            blurb: "Use when guest pays via Equity/Jenga paybill and confirm using bank transaction reference.",
        },
        {
            value: "paystack",
            label: "Prompt",
            blurb: "Guest pays in the browser; no split screen. Good for tap-to-pay or link checkout.",
        },
    ];

    const selectedPaymentBlurb =
        paymentChips.find((c) => c.value === paymentMethod)?.blurb ?? "";

    const splitAllocated = splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const splitRemainder = paymentSubview ? paymentSubview.amount - splitAllocated : 0;
    const splitBalanced =
        paymentSubview && Math.abs(splitRemainder) <= SPLIT_EPS && splitRows.length > 0;

    const splitBlockingMessages = paymentSubview
        ? getSplitBlockingMessages(splitRows, paymentSubview.amount, formatCurrency)
        : [];
    const splitReady = Boolean(paymentSubview && splitBlockingMessages.length === 0);
    const splitDenseMode = compactSplitRows || splitRows.length >= 4;

    useEffect(() => {
        if (!paymentSubview) {
            setSplitGuideOpen(true);
            return;
        }
        // Keep focus on payment lines once split complexity grows.
        if (splitRows.length > 1 && splitGuideOpen) {
            setSplitGuideOpen(false);
        }
    }, [paymentSubview, splitGuideOpen, splitRows.length]);

    useEffect(() => {
        const isBalancedNow = Boolean(splitBalanced);
        if (isBalancedNow && !prevBalancedRef.current) {
            setSplitBalancedPulse(true);
            const timer = setTimeout(() => setSplitBalancedPulse(false), 900);
            prevBalancedRef.current = isBalancedNow;
            return () => clearTimeout(timer);
        }
        prevBalancedRef.current = isBalancedNow;
        return;
    }, [splitBalanced]);

    const applyRemainderToLastLine = () => {
        if (!paymentSubview) return;
        setSplitRows((prev) => {
            if (prev.length === 0) return prev;
            const sum = prev.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const rem = paymentSubview.amount - sum;
            if (rem <= SPLIT_EPS) return prev;
            const last = prev[prev.length - 1]!;
            const cur = parseFloat(last.amount) || 0;
            return prev.map((r, i) =>
                i === prev.length - 1 ? { ...r, amount: (cur + rem).toFixed(2) } : r
            );
        });
    };

    const addCashLineForRemainder = () => {
        if (!paymentSubview) return;
        setSplitRows((prev) => {
            const sum = prev.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const rem = paymentSubview.amount - sum;
            if (rem <= SPLIT_EPS) return prev;
            return [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    method: "cash" as const,
                    amount: rem.toFixed(2),
                    reference: "",
                },
            ];
        });
    };

    const applySplitTemplate = (template: SplitTemplate) => {
        if (!paymentSubview) return;
        const total = Number(paymentSubview.amount) || 0;
        if (total <= 0) return;
        const ratio = template === "seventy_thirty" ? 0.7 : template === "sixty_forty" ? 0.6 : 0.5;
        const firstHalf = Number((total * ratio).toFixed(2));
        const secondHalf = Number((total - firstHalf).toFixed(2));
        if (template === "equal") {
            setSplitRows([
                { ...newSplitRow("cash"), amount: firstHalf.toFixed(2) },
                { ...newSplitRow("cash"), amount: secondHalf.toFixed(2) },
            ]);
            setLastSplitTemplate(template);
            return;
        }
        if (template === "cash_mpesa") {
            setSplitRows([
                { ...newSplitRow("cash"), amount: firstHalf.toFixed(2) },
                { ...newSplitRow("mpesa"), amount: secondHalf.toFixed(2) },
            ]);
            setLastSplitTemplate(template);
            return;
        }
        setSplitRows([
            { ...newSplitRow("pdq"), amount: firstHalf.toFixed(2) },
            { ...newSplitRow("cash"), amount: secondHalf.toFixed(2) },
        ]);
        setLastSplitTemplate(template);
    };

    const moveSplitRow = (id: string, direction: -1 | 1) => {
        setSplitRows((prev) => {
            const idx = prev.findIndex((row) => row.id === id);
            if (idx < 0) return prev;
            const nextIdx = idx + direction;
            if (nextIdx < 0 || nextIdx >= prev.length) return prev;
            const copy = [...prev];
            const [item] = copy.splice(idx, 1);
            copy.splice(nextIdx, 0, item);
            return copy;
        });
        setMovedSplitRowId(id);
        setTimeout(() => {
            setMovedSplitRowId((prev) => (prev === id ? "" : prev));
        }, 500);
    };

    const moveSplitRowToEdge = (id: string, edge: "top" | "bottom") => {
        setSplitRows((prev) => {
            const idx = prev.findIndex((row) => row.id === id);
            if (idx < 0) return prev;
            const copy = [...prev];
            const [item] = copy.splice(idx, 1);
            if (edge === "top") copy.unshift(item);
            else copy.push(item);
            return copy;
        });
        setSplitRowMenuId("");
        setMovedSplitRowId(id);
        setTimeout(() => {
            setMovedSplitRowId((prev) => (prev === id ? "" : prev));
        }, 500);
    };

    const duplicateSplitRow = (id: string) => {
        setSplitRows((prev) => {
            const idx = prev.findIndex((row) => row.id === id);
            if (idx < 0) return prev;
            const source = prev[idx];
            const clone: SplitRow = {
                ...source,
                id: crypto.randomUUID(),
            };
            const copy = [...prev];
            copy.splice(idx + 1, 0, clone);
            return copy;
        });
    };

    const clearSplitReference = (id: string) => {
        setSplitRows((prev) =>
            prev.map((row) => (row.id === id ? { ...row, reference: "" } : row))
        );
    };

    const applyRemainderToRow = (rowId: string) => {
        if (!paymentSubview) return;
        setSplitRows((prev) => {
            const sum = prev.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const rem = paymentSubview.amount - sum;
            if (Math.abs(rem) <= SPLIT_EPS) return prev;
            return prev.map((row) => {
                if (row.id !== rowId) return row;
                const cur = parseFloat(row.amount) || 0;
                const nextAmount = cur + rem;
                if (nextAmount < 0) return row;
                return { ...row, amount: nextAmount.toFixed(2) };
            });
        });
    };

    const startRowLongPress = (rowId: string) => {
        if (rowLongPressTimerRef.current) clearTimeout(rowLongPressTimerRef.current);
        rowLongPressTimerRef.current = setTimeout(() => {
            setSplitRowMenuId(rowId);
        }, 420);
    };

    const cancelRowLongPress = () => {
        if (!rowLongPressTimerRef.current) return;
        clearTimeout(rowLongPressTimerRef.current);
        rowLongPressTimerRef.current = null;
    };

    const handleSplitMethodChange = (rowId: string, method: SplitRow["method"]) => {
        setSplitRows((prev) =>
            prev.map((row) =>
                row.id === rowId
                    ? {
                          ...row,
                          method,
                          reference: "",
                      }
                    : row
            )
        );
        if (method !== "cash") {
            setTimeout(() => {
                splitRefInputRefs.current[rowId]?.focus();
            }, 0);
        }
    };

    const handleSplitAmountChange = (rowId: string, amountText: string) => {
        setSplitRows((prev) => {
            const current = prev.find((row) => row.id === rowId);
            const next = prev.map((row) =>
                row.id === rowId ? { ...row, amount: amountText } : row
            );
            if (!current) return next;
            const before = Number(current.amount || 0);
            const after = Number(amountText || 0);
            const requiresRef =
                current.method === "pdq" ||
                current.method === "mpesa" ||
                current.method === "bank_paybill";
            if (requiresRef && before <= 0 && after > 0) {
                setTimeout(() => {
                    splitRefInputRefs.current[rowId]?.focus();
                }, 0);
            }
            return next;
        });
    };

    const rowNeedsReference = (method: SplitRow["method"]) =>
        method === "pdq" || method === "mpesa" || method === "bank_paybill";

    const rowIsReady = (row: SplitRow) => {
        const amountOk = Number(row.amount || 0) > 0;
        const requiresRef = rowNeedsReference(row.method);
        if (!requiresRef) return amountOk;
        const validation = validateReferenceForMethod(row.method, normalizeReference(row.reference));
        return amountOk && Boolean(validation.valid);
    };

    useEffect(() => {
        const nextReadyMap: Record<string, boolean> = {};
        let flashed = "";
        for (const row of splitRows) {
            const ready = rowIsReady(row);
            nextReadyMap[row.id] = ready;
            if (ready && !prevRowReadyRef.current[row.id] && !flashed) {
                flashed = row.id;
            }
        }
        prevRowReadyRef.current = nextReadyMap;
        if (flashed) {
            setSplitReadyFlashRowId(flashed);
            const timeout = setTimeout(() => setSplitReadyFlashRowId(""), 650);
            return () => clearTimeout(timeout);
        }
        return;
    }, [splitRows]);

    const focusSplitField = (rowId: string, field: SplitField) => {
        if (field === "method") {
            splitMethodRefs.current[rowId]?.focus();
            return;
        }
        if (field === "amount") {
            splitAmountRefs.current[rowId]?.focus();
            return;
        }
        splitRefInputRefs.current[rowId]?.focus();
    };

    const focusRowFieldByIndex = (index: number, field: SplitField) => {
        const row = splitRows[index];
        if (!row) return;
        focusSplitField(row.id, field);
    };

    const findNextInvalidField = () => {
        for (const row of splitRows) {
            if (Number(row.amount || 0) <= 0) return { rowId: row.id, field: "amount" as const };
            if (rowNeedsReference(row.method)) {
                const validation = validateReferenceForMethod(row.method, normalizeReference(row.reference));
                if (!validation.valid) return { rowId: row.id, field: "reference" as const };
            }
        }
        return null;
    };

    const jumpToNextInvalidField = () => {
        const invalid = findNextInvalidField();
        if (!invalid) return;
        focusSplitField(invalid.rowId, invalid.field);
    };

    const applySplitKeypad = (key: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "backspace" | "clear") => {
        if (!activeSplitAmountRowId) return;
        setSplitRows((prev) =>
            prev.map((row) => {
                if (row.id !== activeSplitAmountRowId) return row;
                let current = row.amount || "";
                if (key === "clear") return { ...row, amount: "" };
                if (key === "backspace") return { ...row, amount: current.slice(0, -1) };
                if (key === ".") {
                    if (current.includes(".")) return row;
                    if (current === "") current = "0";
                    return { ...row, amount: `${current}.` };
                }
                const next = `${current}${key}`;
                if (!/^\d*\.?\d{0,2}$/.test(next)) return row;
                return { ...row, amount: next };
            })
        );
    };

    const handleSplitFieldEnter = (
        event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
        rowId: string,
        field: SplitField
    ) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const idx = splitRows.findIndex((r) => r.id === rowId);
        if (idx < 0) return;
        const row = splitRows[idx];
        const backwards = event.shiftKey;
        const hasRef = rowNeedsReference(row.method);

        if (backwards) {
            if (field === "reference") {
                focusRowFieldByIndex(idx, "amount");
                return;
            }
            if (field === "amount") {
                focusRowFieldByIndex(idx, "method");
                return;
            }
            focusRowFieldByIndex(Math.max(0, idx - 1), "amount");
            return;
        }

        if (field === "method") {
            focusRowFieldByIndex(idx, "amount");
            return;
        }
        if (field === "amount") {
            if (hasRef) {
                focusRowFieldByIndex(idx, "reference");
                return;
            }
            focusRowFieldByIndex(Math.min(splitRows.length - 1, idx + 1), "method");
            return;
        }
        focusRowFieldByIndex(Math.min(splitRows.length - 1, idx + 1), "method");
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
            <DialogContent
                showCloseButton={false}
                className="bg-[#0a0a0f] border-white/[0.08] text-white w-[calc(100vw-1.25rem)] sm:w-full max-w-3xl md:max-w-4xl max-h-[min(92vh,56rem)] p-0 overflow-hidden flex flex-col rounded-xl shadow-2xl"
            >
                <DialogTitle className="sr-only">Settle Tab</DialogTitle>

                {/* Top bar */}
                <div className="flex-shrink-0 flex items-center justify-between gap-4 px-5 py-4 md:px-6 md:py-5 bg-neutral-900/80 border-b border-white/[0.07]">
                    {paymentSubview || bankSubview ? (
                        <button
                            type="button"
                            onClick={handleCloseSubview}
                            className="flex items-center gap-2 text-neutral-300 hover:text-white transition min-h-11"
                        >
                            <ArrowLeft className="w-4 h-4 shrink-0" />
                            <span className="text-sm md:text-[15px] font-semibold">
                                {bankSubview ? "Bank paybill check" : "Split payment"}
                            </span>
                        </button>
                    ) : (
                        <div className="min-w-0">
                            <h2 className="text-base md:text-lg font-bold tracking-tight">Settle Tab</h2>
                            <p className="text-xs md:text-sm text-neutral-500 mt-1">
                                {orders.length} unpaid order{orders.length !== 1 ? "s" : ""} · all open tabs
                            </p>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close"
                        className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-xl leading-none text-neutral-300 hover:bg-white/[0.1] hover:text-white transition"
                    >
                        <span className="block translate-y-[-0.06em]" aria-hidden>
                            ×
                        </span>
                    </button>
                </div>

                {/* Stats row — hidden in sub-view */}
                {!paymentSubview && !bankSubview && (
                    <div className="flex-shrink-0 flex flex-wrap gap-2 md:gap-3 px-5 py-3 md:py-3.5 bg-neutral-950/70 border-b border-white/[0.06]">
                        {[
                            { label: "Newest <15m", value: newestCount, color: "text-sky-300" },
                            { label: "Fresh <1hr", value: freshCount, color: "text-emerald-400" },
                            { label: "Ageing 1–3hr", value: ageingCount, color: "text-amber-400" },
                            { label: "Urgent >3hr", value: urgentCount, color: "text-red-400" },
                        ].map(({ label, value, color }) => (
                            <div
                                key={label}
                                className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2 md:px-3.5 md:py-2.5 min-w-[4.5rem] flex-1 sm:flex-none"
                            >
                                <div className="text-[10px] md:text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-medium">
                                    {label}
                                </div>
                                <div className={`text-base md:text-lg font-bold tabular-nums ${color}`}>{value}</div>
                            </div>
                        ))}
                        <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2 md:px-3.5 md:py-2.5 ml-auto min-w-[8rem]">
                            <div className="text-[10px] md:text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-medium">
                                Total outstanding
                            </div>
                            <div className="text-base md:text-lg font-bold text-white tabular-nums">
                                {formatCurrency(grandTotal)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Filter bar — hidden in sub-view */}
                {!paymentSubview && !bankSubview && (
                    <div className="flex-shrink-0 flex flex-wrap items-center gap-2 md:gap-2.5 px-4 md:px-5 py-2.5 md:py-3 bg-neutral-950/70 border-b border-white/[0.06]">
                        <div className="flex-1 min-w-[12rem] relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by table, order #, name…"
                                className="w-full min-h-[44px] bg-white/[0.05] border border-white/[0.08] rounded-xl pl-10 pr-3 py-2 text-sm md:text-[15px] text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/30"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setListFilter("all")}
                            className={`min-h-[44px] min-w-[4.5rem] rounded-xl px-4 text-xs md:text-sm font-semibold border transition-colors cursor-pointer ${
                                listFilter === "all"
                                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                                    : "bg-white/[0.04] border-white/10 text-neutral-400 hover:bg-white/[0.06]"
                            }`}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            onClick={() => setListFilter("newest")}
                            className={`min-h-[44px] min-w-[4.5rem] rounded-xl px-4 text-xs md:text-sm font-semibold border transition-colors cursor-pointer ${
                                listFilter === "newest"
                                    ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                                    : "bg-white/[0.04] border-white/10 text-neutral-400 hover:bg-white/[0.06]"
                            }`}
                        >
                            Newest {newestCount > 0 ? `(${newestCount})` : ""}
                        </button>
                        <button
                            type="button"
                            onClick={() => setListFilter("recent")}
                            className={`min-h-[44px] min-w-[4.5rem] rounded-xl px-4 text-xs md:text-sm font-semibold border transition-colors cursor-pointer ${
                                listFilter === "recent"
                                    ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                                    : "bg-white/[0.04] border-white/10 text-neutral-400 hover:bg-white/[0.06]"
                            }`}
                        >
                            Recent {recentCount > 0 ? `(${recentCount})` : ""}
                        </button>
                        <button
                            type="button"
                            onClick={() => setListFilter("urgent")}
                            className={`min-h-[44px] min-w-[4.5rem] rounded-xl px-4 text-xs md:text-sm font-semibold border transition-colors cursor-pointer ${
                                listFilter === "urgent"
                                    ? "bg-red-500/15 border-red-500/40 text-red-300"
                                    : "bg-white/[0.04] border-white/10 text-neutral-400 hover:bg-white/[0.06]"
                            }`}
                        >
                            Urgent
                        </button>
                    </div>
                )}

                {!paymentSubview && (
                    <div className="flex-shrink-0 px-5 pb-3">
                        <StaffGuidePanel
                            storageKey="pos_staff_guide_settle_tab_v1"
                            defaultOpen
                            title="Quick guide — settling tabs"
                            lines={STAFF_GUIDE_SETTLE_TAB_LIST}
                        />
                    </div>
                )}

                {/* Main area: payment sub-view OR order list */}
                {bankSubview ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-white/[0.06]">
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1">
                                <p className="text-[11px] uppercase tracking-wide text-neutral-500">Customer prompt</p>
                                <p className="text-sm text-white">
                                    Pay via Equity/Jenga paybill:
                                </p>
                                <p className="text-xs text-neutral-300">
                                    Paybill: <span className="font-semibold text-white">{PAYBILL_INFO.mpesaAirtelPaybill}</span>
                                    {" · "}Account: <span className="font-semibold text-white">{PAYBILL_INFO.mpesaAirtelAccount}</span>
                                </p>
                                <p className="text-xs text-neutral-500">
                                    Reference hint: {bankSubview.orderReferenceHint || "order reference"}
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                <p className="text-xs text-neutral-400 uppercase tracking-wide">Amount to collect</p>
                                <p className="text-3xl font-extrabold text-white mt-1">{formatCurrency(bankSubview.amount)}</p>
                                <p className="text-[11px] text-neutral-500 mt-1">
                                    {bankSubview.orderIds.length} order{bankSubview.orderIds.length !== 1 ? "s" : ""}
                                </p>
                            </div>

                            <div>
                                <label className="block text-[11px] text-neutral-400 mb-1">
                                    Bank transaction reference
                                </label>
                                <input
                                    type="text"
                                    value={bankReference}
                                    onChange={(e) => setBankReference(e.target.value.toUpperCase())}
                                    placeholder="e.g. 328411183176"
                                    className="w-full min-h-[44px] rounded-xl bg-white/[0.06] border border-white/[0.12] px-4 text-sm font-semibold text-white tracking-wide uppercase focus:outline-none focus:border-emerald-500/50"
                                />
                                <p className="text-[10px] text-neutral-500 mt-1 tabular-nums">
                                    {bankReference.trim().length}/24 · use 6-24 letters/numbers
                                </p>
                            </div>

                            {bankProviderAmount != null && (
                                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-300">
                                    Provider amount: <span className="font-semibold text-white">{formatCurrency(bankProviderAmount)}</span>
                                </div>
                            )}

                            {bankStatus !== "idle" && (
                                <div
                                    className={`rounded-lg border px-3 py-2 text-xs ${
                                        bankStatus === "confirmed"
                                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                            : bankStatus === "failed"
                                              ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                              : "border-amber-500/35 bg-amber-500/10 text-amber-200"
                                    }`}
                                >
                                    {bankMessage || "Awaiting update..."}
                                </div>
                            )}
                        </div>

                        <div className="flex-shrink-0 bg-neutral-900/95 border-t border-white/10 px-5 py-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    bankRealtimeAckRef.current = false;
                                    setBankStatus("awaiting_payment");
                                    setBankMessage("Awaiting customer payment...");
                                }}
                                className="flex-1 rounded-[12px] py-3 text-[13px] font-bold bg-transparent text-neutral-400 border border-white/10 hover:border-white/20 transition"
                            >
                                Mark awaiting
                            </button>
                            <button
                                type="button"
                                onClick={handleBankCheckNow}
                                disabled={isProcessing || bankStatus === "checking"}
                                className="flex-[2] rounded-[12px] py-3 text-[13px] font-bold bg-emerald-500 text-white hover:bg-emerald-400 transition disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {isProcessing || bankStatus === "checking" ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : null}
                                Check status now
                            </button>
                        </div>
                    </div>
                ) : paymentSubview ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="flex-shrink-0 px-3 md:px-4 pt-2.5 pb-2 border-b border-white/[0.06]">
                            <StaffGuidePanel
                                storageKey="pos_staff_guide_settle_split_v1"
                                title="Split payment — read this if unsure"
                                lines={STAFF_GUIDE_SETTLE_SPLIT}
                                defaultOpen
                                open={splitGuideOpen}
                                onOpenChange={setSplitGuideOpen}
                            />
                        </div>
                        <div className="flex-shrink-0 text-center px-4 md:px-6 pt-3 pb-3 border-b border-white/[0.06]">
                            <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-500 mb-1">
                                Amount to collect
                            </div>
                            <div className="text-[32px] md:text-[42px] font-extrabold text-white leading-none">
                                {formatCurrency(paymentSubview.amount)}
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-2">
                                {paymentSubview.orderIds.length} order{paymentSubview.orderIds.length !== 1 ? "s" : ""}
                                {" · "}
                                Add lines for each method; totals must match.
                            </div>
                            <div
                                className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold tabular-nums border transition-all ${
                                    splitBalanced
                                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                                        : "bg-white/[0.04] border-white/10 text-neutral-300"
                                } ${splitBalancedPulse ? "ring-2 ring-emerald-400/40 animate-pulse" : ""}`}
                            >
                                Allocated {formatCurrency(splitAllocated)} / {formatCurrency(paymentSubview.amount)}
                                {!splitBalanced && splitRows.length > 0 && (
                                    <span className="block text-[11px] font-normal text-neutral-500 mt-1">
                                        {splitRemainder > 0
                                            ? `Remaining: ${formatCurrency(splitRemainder)}`
                                            : `Over by: ${formatCurrency(-splitRemainder)}`}
                                    </span>
                                )}
                            </div>
                            {splitRemainder > SPLIT_EPS && splitRows.length > 0 && (
                                <div className="mt-3 flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
                                    <button
                                        type="button"
                                        onClick={applyRemainderToLastLine}
                                        className="min-h-[44px] rounded-xl px-4 text-xs font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-100 hover:bg-amber-500/30 transition-colors"
                                    >
                                        Add remainder to last line ({formatCurrency(splitRemainder)})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={addCashLineForRemainder}
                                        className="min-h-[44px] rounded-xl px-4 text-xs font-semibold bg-emerald-500/20 border border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/30 transition-colors"
                                    >
                                        New cash line for remainder ({formatCurrency(splitRemainder)})
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 md:px-5 py-3 md:py-4 space-y-2.5 md:space-y-3">
                            <div className="sticky top-0 z-10 -mx-1 mb-1 rounded-xl border border-white/[0.1] bg-neutral-950/90 backdrop-blur px-3 py-2 text-[11px]">
                                <div className="flex items-center justify-between gap-2 text-neutral-300">
                                    <span className="uppercase tracking-wide text-neutral-500">Running split total</span>
                                    <span className="font-semibold tabular-nums">
                                        {formatCurrency(splitAllocated)} / {formatCurrency(paymentSubview.amount)}
                                    </span>
                                </div>
                                <p
                                    className={`mt-1 ${
                                        Math.abs(splitRemainder) <= SPLIT_EPS ? "text-emerald-300" : "text-amber-300"
                                    }`}
                                >
                                    {Math.abs(splitRemainder) <= SPLIT_EPS
                                        ? "Balanced. Ready to confirm."
                                        : splitRemainder > 0
                                          ? `Remaining ${formatCurrency(splitRemainder)}`
                                          : `Over by ${formatCurrency(-splitRemainder)}`}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => applySplitTemplate("equal")}
                                    className={`min-h-[38px] rounded-lg px-3 text-[11px] font-semibold border transition-colors ${
                                        lastSplitTemplate === "equal"
                                            ? "bg-white/[0.16] border-white/35 text-white"
                                            : "bg-white/[0.08] border-white/20 text-neutral-200 hover:bg-white/[0.14]"
                                    }`}
                                >
                                    Template: 50/50
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applySplitTemplate("sixty_forty")}
                                    className={`min-h-[38px] rounded-lg px-3 text-[11px] font-semibold border transition-colors ${
                                        lastSplitTemplate === "sixty_forty"
                                            ? "bg-cyan-500/25 border-cyan-500/50 text-cyan-100"
                                            : "bg-cyan-500/15 border-cyan-500/35 text-cyan-200 hover:bg-cyan-500/25"
                                    }`}
                                >
                                    Template: 60/40
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applySplitTemplate("seventy_thirty")}
                                    className={`min-h-[38px] rounded-lg px-3 text-[11px] font-semibold border transition-colors ${
                                        lastSplitTemplate === "seventy_thirty"
                                            ? "bg-fuchsia-500/25 border-fuchsia-500/50 text-fuchsia-100"
                                            : "bg-fuchsia-500/15 border-fuchsia-500/35 text-fuchsia-200 hover:bg-fuchsia-500/25"
                                    }`}
                                >
                                    Template: 70/30
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applySplitTemplate("cash_mpesa")}
                                    className={`min-h-[38px] rounded-lg px-3 text-[11px] font-semibold border transition-colors ${
                                        lastSplitTemplate === "cash_mpesa"
                                            ? "bg-sky-500/25 border-sky-500/50 text-sky-100"
                                            : "bg-sky-500/15 border-sky-500/35 text-sky-200 hover:bg-sky-500/25"
                                    }`}
                                >
                                    Template: Cash + M-Pesa
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applySplitTemplate("pdq_cash")}
                                    className={`min-h-[38px] rounded-lg px-3 text-[11px] font-semibold border transition-colors ${
                                        lastSplitTemplate === "pdq_cash"
                                            ? "bg-indigo-500/25 border-indigo-500/50 text-indigo-100"
                                            : "bg-indigo-500/15 border-indigo-500/35 text-indigo-200 hover:bg-indigo-500/25"
                                    }`}
                                >
                                    Template: PDQ + Cash
                                </button>
                                {lastSplitTemplate && (
                                    <button
                                        type="button"
                                        onClick={() => applySplitTemplate(lastSplitTemplate)}
                                        className="min-h-[38px] rounded-lg px-3 text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/35 text-emerald-200 hover:bg-emerald-500/25 transition-colors"
                                    >
                                        Use last template
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setCompactSplitRows((v) => !v)}
                                    className={`min-h-[38px] rounded-lg px-3 text-[11px] font-semibold border transition-colors ${
                                        compactSplitRows
                                            ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-200 hover:bg-emerald-500/25"
                                            : "bg-white/[0.06] border-white/20 text-neutral-300 hover:bg-white/[0.12]"
                                    }`}
                                >
                                    {compactSplitRows ? "Compact: On" : "Compact: Off"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSplitKeypadMode((v) => !v)}
                                    className={`min-h-[38px] rounded-lg px-3 text-[11px] font-semibold border transition-colors ${
                                        splitKeypadMode
                                            ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-200 hover:bg-emerald-500/25"
                                            : "bg-white/[0.06] border-white/20 text-neutral-300 hover:bg-white/[0.12]"
                                    }`}
                                >
                                    {splitKeypadMode ? "Keypad: On" : "Keypad: Off"}
                                </button>
                            </div>
                            {splitRows.map((row, idx) => (
                                <div
                                    key={row.id}
                                    className={`rounded-2xl border border-white/[0.1] bg-white/[0.03] ${splitDenseMode ? "p-3" : "p-4"} space-y-2.5 transition-all ${
                                        movedSplitRowId === row.id ? "ring-2 ring-sky-400/35 scale-[1.01]" : ""
                                    } ${splitReadyFlashRowId === row.id ? "ring-2 ring-emerald-400/40 animate-pulse" : ""}`}
                                >
                                    {(() => {
                                        const amountValue = Number(row.amount || 0);
                                        const amountOk = amountValue > 0;
                                        const requiresRef = rowNeedsReference(row.method);
                                        const normalizedRef = normalizeReference(row.reference);
                                        const refValidation = requiresRef
                                            ? validateReferenceForMethod(row.method, normalizedRef)
                                            : { valid: true };
                                        const refOk = !requiresRef || Boolean(refValidation.valid);
                                        const rowReady = amountOk && refOk;
                                        return (
                                            <>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                                            Payment {idx + 1}
                                        </span>
                                        <div className="flex items-center gap-1.5 relative">
                                            <button
                                                type="button"
                                                onPointerDown={() => startRowLongPress(row.id)}
                                                onPointerUp={cancelRowLongPress}
                                                onPointerLeave={cancelRowLongPress}
                                                onPointerCancel={cancelRowLongPress}
                                                onClick={() =>
                                                    setSplitRowMenuId((prev) => (prev === row.id ? "" : row.id))
                                                }
                                                className="p-2 rounded-lg text-neutral-300 hover:bg-white/10"
                                                aria-label="Open split row actions"
                                            >
                                                <span className="sr-only">More actions</span>
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveSplitRow(row.id, -1)}
                                                disabled={idx === 0}
                                                className="p-2 rounded-lg text-neutral-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                                                aria-label="Move split line up"
                                            >
                                                <ArrowUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveSplitRow(row.id, 1)}
                                                disabled={idx === splitRows.length - 1}
                                                className="p-2 rounded-lg text-neutral-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                                                aria-label="Move split line down"
                                            >
                                                <ArrowDown className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => duplicateSplitRow(row.id)}
                                                className="p-2 rounded-lg text-sky-300 hover:bg-sky-500/10"
                                                aria-label="Duplicate split line"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                            {(row.method === "pdq" || row.method === "mpesa" || row.method === "bank_paybill") && (
                                                <button
                                                    type="button"
                                                    onClick={() => clearSplitReference(row.id)}
                                                    className="p-2 rounded-lg text-amber-300 hover:bg-amber-500/10"
                                                    aria-label="Clear split reference"
                                                >
                                                    <Eraser className="w-4 h-4" />
                                                </button>
                                            )}
                                            {splitRows.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSplitRows((prev) => prev.filter((r) => r.id !== row.id))
                                                    }
                                                    className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                                                    aria-label="Remove split"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            {splitRowMenuId === row.id && (
                                                <div
                                                    ref={splitRowMenuRef}
                                                    className="absolute right-0 top-[2.25rem] z-20 min-w-[11rem] rounded-xl border border-white/15 bg-neutral-900 shadow-xl p-1.5"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => moveSplitRowToEdge(row.id, "top")}
                                                        className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-neutral-200 hover:bg-white/10"
                                                    >
                                                        Move to top
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => moveSplitRowToEdge(row.id, "bottom")}
                                                        className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-neutral-200 hover:bg-white/10"
                                                    >
                                                        Move to bottom
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            duplicateSplitRow(row.id);
                                                            setSplitRowMenuId("");
                                                        }}
                                                        className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-neutral-200 hover:bg-white/10"
                                                    >
                                                        Duplicate line
                                                    </button>
                                                    {(row.method === "pdq" || row.method === "mpesa" || row.method === "bank_paybill") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                clearSplitReference(row.id);
                                                                setSplitRowMenuId("");
                                                            }}
                                                            className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-amber-200 hover:bg-amber-500/10"
                                                        >
                                                            Clear reference
                                                        </button>
                                                    )}
                                                    {splitRows.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSplitRows((prev) => prev.filter((r) => r.id !== row.id));
                                                                setSplitRowMenuId("");
                                                            }}
                                                            className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-rose-200 hover:bg-rose-500/10"
                                                        >
                                                            Delete line
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div>
                                            <label className="block text-[11px] text-neutral-400 mb-1">Method</label>
                                            <select
                                                ref={(el) => {
                                                    splitMethodRefs.current[row.id] = el;
                                                }}
                                                value={row.method}
                                                onChange={(e) => handleSplitMethodChange(row.id, e.target.value as SplitRow["method"])}
                                                onKeyDown={(e) => handleSplitFieldEnter(e, row.id, "method")}
                                                className="w-full min-h-[44px] rounded-xl bg-white/[0.06] border border-white/[0.12] px-3 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="pdq">PDQ</option>
                                                <option value="mpesa">M-Pesa Paybill</option>
                                                <option value="bank_paybill">Bank Paybill</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-neutral-400 mb-1">
                                                Amount (KSh)
                                            </label>
                                            <input
                                                ref={(el) => {
                                                    splitAmountRefs.current[row.id] = el;
                                                }}
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                step="0.01"
                                                value={row.amount}
                                                onChange={(e) => handleSplitAmountChange(row.id, e.target.value)}
                                                onFocus={() => setActiveSplitAmountRowId(row.id)}
                                                onKeyDown={(e) => handleSplitFieldEnter(e, row.id, "amount")}
                                                className="w-full min-h-[44px] rounded-xl bg-white/[0.06] border border-white/[0.12] px-4 text-base md:text-lg font-bold text-white text-center tabular-nums focus:outline-none focus:border-emerald-500/50"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                        <span className={`rounded-full px-2 py-0.5 border ${amountOk ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                                            {amountOk ? "Amount ok" : "Add amount"}
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 border ${refOk ? "border-sky-500/35 bg-sky-500/10 text-sky-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                                            {requiresRef ? (refOk ? "Ref valid" : "Ref needed") : "No ref needed"}
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 border ${rowReady ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100" : "border-white/20 bg-white/[0.06] text-neutral-300"}`}>
                                            {rowReady ? "Line ready" : "Line incomplete"}
                                        </span>
                                        {splitReadyFlashRowId === row.id && (
                                            <span className="rounded-full px-2 py-0.5 border border-emerald-400/45 bg-emerald-500/20 text-emerald-100 animate-pulse">
                                                Ready ✓
                                            </span>
                                        )}
                                    </div>
                                    {Math.abs(splitRemainder) > SPLIT_EPS && (
                                        <button
                                            type="button"
                                            onClick={() => applyRemainderToRow(row.id)}
                                            className="min-h-[34px] rounded-lg px-2.5 text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                                        >
                                            {splitRemainder > 0
                                                ? `Apply +${formatCurrency(splitRemainder)} to this line`
                                                : `Apply ${formatCurrency(splitRemainder)} to this line`}
                                        </button>
                                    )}
                                    {!splitDenseMode && (
                                        <p className="text-[10px] text-neutral-500 leading-snug">
                                            {row.method === "cash" && SPLIT_HINT_CASH}
                                            {row.method === "pdq" && SPLIT_HINT_PDQ}
                                            {row.method === "mpesa" && SPLIT_HINT_MPESA}
                                            {row.method === "bank_paybill" &&
                                                "Use the provider transaction reference from Equity/Jenga confirmation."}
                                        </p>
                                    )}
                                    {(row.method === "pdq" || row.method === "mpesa" || row.method === "bank_paybill") && (
                                        <div>
                                            <label className="block text-[11px] text-neutral-400 mb-1">
                                                {row.method === "pdq"
                                                    ? "Terminal approval code"
                                                    : row.method === "mpesa"
                                                      ? "M-Pesa confirmation code"
                                                      : "Bank paybill transaction ref"}
                                            </label>
                                            <input
                                                type="text"
                                                maxLength={row.method === "pdq" ? 12 : row.method === "mpesa" ? 10 : 24}
                                                ref={(el) => {
                                                    splitRefInputRefs.current[row.id] = el;
                                                }}
                                                value={row.reference}
                                                onChange={(e) =>
                                                    setSplitRows((prev) =>
                                                        prev.map((r) =>
                                                            r.id === row.id
                                                                ? {
                                                                      ...r,
                                                                      reference: e.target.value.toUpperCase(),
                                                                  }
                                                                : r
                                                        )
                                                    )
                                                }
                                                onKeyDown={(e) => handleSplitFieldEnter(e, row.id, "reference")}
                                                placeholder={
                                                    row.method === "pdq"
                                                        ? "e.g. A1B2C3 or 1234567890AB"
                                                        : row.method === "mpesa"
                                                          ? "e.g. RGH12345XY"
                                                          : "e.g. 328411183176"
                                                }
                                                className="w-full min-h-[44px] rounded-xl bg-white/[0.06] border border-white/[0.12] px-4 text-sm font-semibold text-white text-center tracking-wide uppercase focus:outline-none focus:border-emerald-500/50"
                                            />
                                            <p className="text-[10px] text-neutral-500 mt-1 text-center tabular-nums">
                                                {row.method === "pdq" &&
                                                    `${row.reference.trim().length}/12 · use 6 or 12 chars`}
                                                {row.method === "mpesa" &&
                                                    `${row.reference.trim().length}/10 · must be exactly 10`}
                                                {row.method === "bank_paybill" &&
                                                    `${row.reference.trim().length}/24 · use 6-24 letters/numbers`}
                                            </p>
                                        </div>
                                    )}
                                            </>
                                        );
                                    })()}
                                </div>
                            ))}

                            {splitKeypadMode && (
                                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 md:p-3.5 space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] uppercase tracking-wide text-emerald-200">
                                            Quick numeric keypad
                                        </p>
                                        <p className="text-[10px] text-emerald-100/80">
                                            {activeSplitAmountRowId ? "Tap digits for selected amount field" : "Tap an amount field first"}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"] as const).map((digit) => (
                                            <button
                                                key={digit}
                                                type="button"
                                                onClick={() => applySplitKeypad(digit)}
                                                disabled={!activeSplitAmountRowId}
                                                className="min-h-[42px] rounded-lg bg-white/[0.08] border border-white/20 text-white text-base font-bold hover:bg-white/[0.14] disabled:opacity-40"
                                            >
                                                {digit}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => applySplitKeypad("backspace")}
                                            disabled={!activeSplitAmountRowId}
                                            className="min-h-[42px] rounded-lg bg-white/[0.08] border border-white/20 text-neutral-200 text-xs font-semibold hover:bg-white/[0.14] disabled:opacity-40"
                                        >
                                            Backspace
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => applySplitKeypad("clear")}
                                        disabled={!activeSplitAmountRowId}
                                        className="w-full min-h-[38px] rounded-lg bg-white/[0.04] border border-white/15 text-[11px] font-semibold text-neutral-300 hover:bg-white/[0.09] disabled:opacity-40"
                                    >
                                        Clear selected amount field
                                    </button>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={() =>
                                    setSplitRows((prev) => [
                                        ...prev,
                                        newSplitRow(prev[prev.length - 1]?.method ?? "cash"),
                                    ])
                                }
                                className="w-full min-h-[48px] rounded-xl border border-dashed border-white/20 text-neutral-300 hover:bg-white/[0.04] flex items-center justify-center gap-2 text-sm font-semibold"
                            >
                                <Plus className="w-4 h-4" />
                                Add payment method
                            </button>
                        </div>

                        {splitBlockingMessages.length > 0 && (
                            <div
                                className="flex-shrink-0 mx-5 mb-2 rounded-xl border border-amber-500/35 bg-amber-500/[0.12] px-3 py-2.5"
                                role="status"
                                aria-live="polite"
                            >
                                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200 mb-1.5">
                                    Fix these before confirming
                                </p>
                                <ul className="text-[11px] text-amber-100/95 space-y-1 list-disc pl-4">
                                    {splitBlockingMessages.slice(0, 5).map((msg, i) => (
                                        <li key={i}>{msg}</li>
                                    ))}
                                    {splitBlockingMessages.length > 5 && (
                                        <li className="list-none pl-0 text-amber-200/80">
                                            …and {splitBlockingMessages.length - 5} more
                                        </li>
                                    )}
                                </ul>
                                <button
                                    type="button"
                                    onClick={jumpToNextInvalidField}
                                    className="mt-2 min-h-[36px] rounded-lg px-3 text-[11px] font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-100 hover:bg-amber-500/30 transition-colors"
                                >
                                    Jump to next invalid field
                                </button>
                            </div>
                        )}

                        <div className="flex-shrink-0 bg-neutral-900/95 border-t border-white/10 px-5 py-4 flex gap-3">
                            <button
                                type="button"
                                onClick={handleCloseSubview}
                                className="flex-1 rounded-[12px] py-3 text-[13px] font-bold bg-transparent text-neutral-400 border border-white/10 hover:border-white/20 transition"
                            >
                                ← Back
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSplit}
                                disabled={!splitReady || isProcessing}
                                title={
                                    !splitReady && splitBlockingMessages[0]
                                        ? splitBlockingMessages[0]
                                        : undefined
                                }
                                className="flex-[2] rounded-[12px] py-3 text-[13px] font-bold bg-emerald-500 text-white hover:bg-emerald-400 transition disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Confirm settlement
                            </button>
                            {!splitReady && (
                                <button
                                    type="button"
                                    onClick={jumpToNextInvalidField}
                                    className="rounded-[12px] px-3 py-3 text-[12px] font-semibold bg-white/[0.06] border border-white/15 text-neutral-200 hover:bg-white/[0.12]"
                                >
                                    Next invalid
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

                            {!isLoading && !error && visibleOrders.length === 0 && (
                                <div className="text-center py-10 text-sm text-neutral-500">
                                    {orders.length === 0 ? "No unpaid orders — all tabs are clear." : "No orders match the filter."}
                                </div>
                            )}

                            {!isLoading && !error && orders.length > 0 && selectedIds.length === 0 && (
                                <p className="text-center text-[11px] text-neutral-500 px-2 pb-2 leading-relaxed">
                                    Tap the square on each row to include that order in{" "}
                                    <strong className="text-neutral-400">Charge Selected</strong>, or use{" "}
                                    <strong className="text-neutral-400">Charge All</strong> to pay every open tab at once.
                                </p>
                            )}

                            {visibleOrders.map((order) => {
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
                                            className="flex items-center gap-3 px-4 py-3 md:py-3.5 cursor-pointer"
                                            onClick={() => setExpandedId(isExpanded ? null : order.$id)}
                                        >
                                            {/* Checkbox */}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleToggleSelect(order.$id); }}
                                                className={`min-h-11 min-w-11 md:min-h-10 md:min-w-10 rounded-lg border flex items-center justify-center flex-shrink-0 text-sm font-bold transition cursor-pointer ${isSelected ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white/[0.04] border-white/15 text-neutral-300 hover:bg-white/[0.08]"}`}
                                                aria-label={isSelected ? "Deselect order" : "Select order"}
                                            >
                                                {isSelected ? "✓" : ""}
                                            </button>

                                            {/* Age dot */}
                                            <div
                                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: styles.dot }}
                                            />

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm md:text-[15px] font-semibold truncate">
                                                    {tableLabel} &nbsp;·&nbsp; #{order.orderNumber || order.$id.slice(-6)}
                                                </div>
                                                <div className="text-xs md:text-sm text-neutral-500 mt-1 flex items-center gap-1.5 flex-wrap">
                                                    {order.customerName || "Walk-in"}
                                                    <span className="text-neutral-600" aria-hidden>
                                                        ·
                                                    </span>
                                                    {new Date(order.orderTime).toLocaleTimeString("en-KE", { timeStyle: "short" })}
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] md:text-xs font-bold ${styles.badge}`}>
                                                        {formatOrderAge(order.ageMinutes)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Amount */}
                                            <div className={`text-sm md:text-base font-bold flex-shrink-0 tabular-nums ${styles.amount}`}>
                                                {formatCurrency(order.totalAmount)}
                                            </div>

                                            {/* Expand icon */}
                                            <div className="text-neutral-500 flex-shrink-0 p-1">
                                                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                            </div>
                                        </div>

                                        {/* Expanded items */}
                                        {isExpanded && (
                                            <div className="border-t border-white/[0.06] px-4 pb-3 pt-2.5 space-y-1.5">
                                                {items.length === 0 ? (
                                                    <p className="text-xs text-neutral-500">No item breakdown.</p>
                                                ) : (
                                                    items.map((item, i) => (
                                                        <div key={i} className="flex justify-between text-xs md:text-sm text-neutral-400 py-0.5 gap-2">
                                                            <span className="min-w-0 truncate">{item.quantity}× {item.name}</span>
                                                            <span className="tabular-nums shrink-0">{formatCurrency(item.price * item.quantity)}</span>
                                                        </div>
                                                    ))
                                                )}
                                                <div className="flex justify-between text-xs md:text-sm font-bold border-t border-dashed border-white/[0.08] mt-1.5 pt-2">
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
                        <div className="flex-shrink-0 bg-neutral-900/95 border-t border-white/10 px-5 py-3.5 md:py-4">
                            {/* Selection summary + payment chips */}
                            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
                                <div>
                                    <div className="text-xs md:text-sm text-neutral-500 font-medium">
                                        {selectedIds.length} order{selectedIds.length !== 1 ? "s" : ""} selected
                                    </div>
                                    <div className="text-xl md:text-2xl font-extrabold text-white tabular-nums tracking-tight">
                                        {formatCurrency(selectedTotal)}
                                    </div>
                                </div>
                                <div className="flex flex-col items-stretch sm:items-end gap-2">
                                    <div className="flex gap-2 flex-wrap sm:justify-end">
                                        {paymentChips.map(({ value, label }) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setPaymentMethod(value)}
                                                className={`min-h-[44px] rounded-xl px-3.5 text-xs md:text-sm font-semibold border transition-colors cursor-pointer ${paymentMethod === value ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white/[0.04] border-white/10 text-neutral-400 hover:bg-white/[0.07]"}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {selectedPaymentBlurb && (
                                        <p className="text-[10px] text-neutral-500 max-w-md sm:text-right leading-snug">
                                            {selectedPaymentBlurb}
                                        </p>
                                    )}
                                    {paymentMethod === "paystack" && (
                                        <input
                                            type="tel"
                                            inputMode="tel"
                                            autoComplete="tel"
                                            placeholder="Customer phone (for Prompt checkout email)"
                                            value={paystackCustomerPhone}
                                            onChange={(e) => setPaystackCustomerPhone(e.target.value)}
                                            className="w-full sm:max-w-[260px] min-h-[44px] rounded-xl bg-white/[0.06] border border-white/12 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-col sm:flex-row gap-2.5">
                                <button
                                    type="button"
                                    onClick={handleSelectAll}
                                    disabled={visibleOrders.length === 0}
                                    className="flex-1 min-h-[48px] rounded-xl py-3 text-sm md:text-[15px] font-bold bg-transparent text-neutral-400 border border-white/10 hover:border-white/25 hover:bg-white/[0.04] transition-colors disabled:opacity-40 cursor-pointer"
                                >
                                    {visibleOrders.length > 0 &&
                                    visibleOrders.every((o) => selectedIds.includes(o.$id))
                                        ? "Deselect All"
                                        : "Select All"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCharge(selectedIds)}
                                    disabled={!selectedIds.length || isProcessing}
                                    title={
                                        !selectedIds.length
                                            ? "Tick at least one order in the list above"
                                            : undefined
                                    }
                                    className="flex-1 min-h-[48px] rounded-xl py-3 text-sm md:text-[15px] font-bold bg-sky-500 text-white hover:bg-sky-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                                    <span className="text-center leading-tight">Charge Selected · {formatCurrency(selectedTotal)}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCharge(orders.map((o) => o.$id))}
                                    disabled={orders.length === 0 || isProcessing}
                                    className="flex-1 min-h-[48px] rounded-xl py-3 text-sm md:text-[15px] font-bold bg-emerald-500 text-white hover:bg-emerald-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                                    <span className="text-center leading-tight">Charge All · {formatCurrency(grandTotal)}</span>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
