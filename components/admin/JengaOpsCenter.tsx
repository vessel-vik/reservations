"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

type UnresolvedItem = {
    jobId: string;
    status?: string;
    reason: string;
    paymentReference: string;
    createdAt: string;
    orderIds?: string[];
    sourceJobId?: string;
    callback: {
        amount?: number;
        orderReference?: string;
        providerReference?: string;
        currency?: string;
    } | null;
};

export function JengaOpsCenter() {
    const [items, setItems] = useState<UnresolvedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyJobId, setBusyJobId] = useState<string>("");
    const [orderIdsDraft, setOrderIdsDraft] = useState<Record<string, string>>({});
    const [statusFilter, setStatusFilter] = useState<"all" | "unresolved_callback" | "unresolved_drift">("all");
    const [summary, setSummary] = useState<{
        unresolvedCount: number;
        unresolvedDriftCount: number;
        unresolvedOver5mCount: number;
        pendingBankCount: number;
        avgUnresolvedAgeMinutes: number;
        avgCallbackToSettleMinutes: number;
    } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [rowsRes, summaryRes] = await Promise.all([
                fetch("/api/payments/jenga/unresolved?limit=100", { cache: "no-store" }),
                fetch("/api/payments/jenga/summary", { cache: "no-store" }),
            ]);
            const rowsData = await rowsRes.json().catch(() => ({}));
            if (!rowsRes.ok) throw new Error(rowsData?.error || "Failed to load unresolved callbacks");
            setItems(Array.isArray(rowsData?.items) ? rowsData.items : []);

            const summaryData = await summaryRes.json().catch(() => ({}));
            if (summaryRes.ok) {
                setSummary({
                    unresolvedCount: Number(summaryData?.unresolvedCount || 0),
                    unresolvedDriftCount: Number(summaryData?.unresolvedDriftCount || 0),
                    unresolvedOver5mCount: Number(summaryData?.unresolvedOver5mCount || 0),
                    pendingBankCount: Number(summaryData?.pendingBankCount || 0),
                    avgUnresolvedAgeMinutes: Number(summaryData?.avgUnresolvedAgeMinutes || 0),
                    avgCallbackToSettleMinutes: Number(summaryData?.avgCallbackToSettleMinutes || 0),
                });
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load unresolved callbacks");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const ignore = async (jobId: string) => {
        setBusyJobId(jobId);
        try {
            const response = await fetch("/api/payments/jenga/unresolved", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "ignore", jobId }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.error || "Failed to ignore callback");
            toast.success("Marked as ignored.");
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to ignore callback");
        } finally {
            setBusyJobId("");
        }
    };

    const queueSettlement = async (item: UnresolvedItem) => {
        const raw = String(orderIdsDraft[item.jobId] || "").trim();
        const orderIds = raw
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        const amount = Number(item?.callback?.amount);
        const providerReference = String(item?.callback?.providerReference || item.paymentReference || "").trim();
        if (orderIds.length === 0 || !Number.isFinite(amount) || amount <= 0 || !providerReference) {
            toast.error("Add order ids (comma-separated) and ensure callback amount/reference exists.");
            return;
        }

        setBusyJobId(item.jobId);
        try {
            const response = await fetch("/api/payments/jenga/unresolved", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "queue_settlement",
                    jobId: item.jobId,
                    orderIds,
                    amount,
                    providerReference,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.error || "Failed to queue settlement");
            toast.success("Settlement queued for processing.");
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to queue settlement");
        } finally {
            setBusyJobId("");
        }
    };

    const filteredItems = items.filter((item) => {
        if (statusFilter === "all") return true;
        return String(item.status || "") === statusFilter;
    });

    return (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        Jenga unresolved callbacks
                    </h3>
                    <p className="text-xs text-slate-400">
                        Review missing references/amount mismatches and re-queue safely.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                </button>
            </div>

            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-3">
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Unresolved</p>
                        <p className="text-lg font-bold text-amber-300">{summary.unresolvedCount}</p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Drift tickets</p>
                        <p className="text-lg font-bold text-rose-300">{summary.unresolvedDriftCount}</p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">&gt;5m unresolved</p>
                        <p className="text-lg font-bold text-amber-200">{summary.unresolvedOver5mCount}</p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Pending bank jobs</p>
                        <p className="text-lg font-bold text-slate-100">{summary.pendingBankCount}</p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Avg unresolved age</p>
                        <p className="text-lg font-bold text-slate-100">
                            {Math.round(summary.avgUnresolvedAgeMinutes)} min
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Avg callback-to-settle</p>
                        <p className="text-lg font-bold text-emerald-300">
                            {Math.round(summary.avgCallbackToSettleMinutes)} min
                        </p>
                    </div>
                </div>
            )}

            {loading ? (
                <p className="text-sm text-slate-400">Loading unresolved callbacks…</p>
            ) : filteredItems.length === 0 ? (
                <p className="text-sm text-slate-400">No unresolved callbacks.</p>
            ) : (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setStatusFilter("all")}
                            className={`rounded-md px-2.5 py-1 text-xs border ${
                                statusFilter === "all"
                                    ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                                    : "border-slate-600 text-slate-300"
                            }`}
                        >
                            All
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter("unresolved_callback")}
                            className={`rounded-md px-2.5 py-1 text-xs border ${
                                statusFilter === "unresolved_callback"
                                    ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                                    : "border-slate-600 text-slate-300"
                            }`}
                        >
                            Callback
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter("unresolved_drift")}
                            className={`rounded-md px-2.5 py-1 text-xs border ${
                                statusFilter === "unresolved_drift"
                                    ? "border-rose-500/50 bg-rose-500/10 text-rose-200"
                                    : "border-slate-600 text-slate-300"
                            }`}
                        >
                            Drift
                        </button>
                    </div>
                    {filteredItems.map((item) => {
                        const amount = Number(item?.callback?.amount || 0);
                        const createdAt = new Date(item.createdAt || Date.now()).toLocaleString("en-KE");
                        const orderRef = String(item?.callback?.orderReference || "");
                        const providerRef = String(item?.callback?.providerReference || item.paymentReference || "");
                        const suggestedIds = Array.isArray(item.orderIds) ? item.orderIds.filter(Boolean) : [];
                        return (
                            <div key={item.jobId} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs text-slate-300">
                                        <span className="font-semibold">Reason:</span> {item.reason}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                        {item.status || "unresolved_callback"} · {createdAt}
                                    </p>
                                </div>
                                <p className="text-xs text-slate-400">
                                    Order ref: <span className="text-slate-200">{orderRef || "—"}</span>
                                    {" · "}
                                    Provider ref: <span className="text-slate-200">{providerRef || "—"}</span>
                                    {" · "}
                                    Amount: <span className="text-slate-200">{amount > 0 ? formatCurrency(amount) : "—"}</span>
                                </p>
                                {item.sourceJobId && (
                                    <p className="text-[11px] text-slate-500">
                                        Source job: <span className="text-slate-300">{item.sourceJobId}</span>
                                    </p>
                                )}

                                <input
                                    type="text"
                                    value={orderIdsDraft[item.jobId] || ""}
                                    onChange={(e) =>
                                        setOrderIdsDraft((prev) => ({ ...prev, [item.jobId]: e.target.value }))
                                    }
                                    placeholder="Order IDs (comma-separated) for manual re-queue"
                                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500"
                                />
                                {suggestedIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setOrderIdsDraft((prev) => ({
                                                ...prev,
                                                [item.jobId]: suggestedIds.join(","),
                                            }))
                                        }
                                        className="text-[11px] text-sky-300 hover:text-sky-200"
                                    >
                                        Use detected order IDs: {suggestedIds.join(", ")}
                                    </button>
                                )}

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void queueSettlement(item)}
                                        disabled={busyJobId === item.jobId}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Queue settlement
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void ignore(item.jobId)}
                                        disabled={busyJobId === item.jobId}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                                    >
                                        <XCircle className="h-3.5 w-3.5" />
                                        Ignore
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

