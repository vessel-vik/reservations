"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Printer, ReceiptText, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { client } from "@/lib/appwrite-client";

type Category = "docket" | "update" | "anomaly" | "receipt";

type PrintJobRow = {
  $id: string;
  jobType: string;
  status: string;
  content: string;
  timestamp?: string;
  $createdAt?: string;
  queuedAt?: string | null;
  printedAt?: string | null;
  attemptCount?: number | null;
  errorMessage?: string | null;
  orderId?: string;
  summary?: string;
  waiterId?: string | null;
  waiterName?: string | null;
  tableNumber?: number | null;
  orderNumber?: string | null;
  paymentStatus?: string | null;
  targetTerminal?: string | null;
};

type TimelineRow = {
  source: "job" | "audit";
  id: string;
  at: string;
  jobType: string;
  status: string;
  summary?: string;
  errorMessage?: string;
  actorUserId?: string;
  actorRole?: string;
  groupedCount?: number;
  groupedFromAt?: string;
};

type PrintAuditSummary = {
  successRate?: number;
  latency?: {
    samples?: number;
    p50LatencyMs?: number;
    p95LatencyMs?: number;
    avgLatencyMs?: number;
  };
  failureRatesByJobType?: Array<{
    jobType?: string;
    failureRate?: number;
    failed?: number;
    completed?: number;
    totalTerminalEvents?: number;
  }>;
  topErrors?: Array<{ message?: string; count?: number }>;
  topFailingTerminals?: Array<{ terminalId?: string; failed?: number }>;
  terminalHealth?: Array<{
    terminalId?: string;
    completed?: number;
    failed?: number;
    total?: number;
    failureRate?: number;
  }>;
  requeueReasons?: Array<{ reason?: string; count?: number }>;
  byCategorySlo?: Record<string, { successRate?: number; samples?: number; p95LatencyMs?: number }>;
  trendHourly?: Array<{ bucket?: string; completed?: number; failed?: number }>;
  queueHealth?: {
    breachedJobs?: number;
    level?: "healthy" | "degraded" | "critical";
    thresholdMs?: number;
    adaptiveThresholdsMs?: Record<string, number>;
    breachedByCategory?: Record<string, number>;
    breachAging?: { gt90s?: number; gt180s?: number; gt300s?: number };
  };
  parallelHealth?: {
    mirroredSuccess?: number;
    directOnlySuccess?: number;
    queueOnlySuccess?: number;
    mirroredFailure?: number;
  };
};

type TerminalRemediationRow = {
  terminalId: string;
  pending: number;
  printing: number;
  failedRecent: number;
  lastQueuedAt?: string;
  state?: "active" | "paused";
  fallbackTerminal?: string;
  lastIncidentAt?: string;
  lastIncidentMessage?: string;
};

function compactTimelineRows(rows: TimelineRow[]): TimelineRow[] {
  if (!Array.isArray(rows) || rows.length <= 1) return rows;
  const compacted: TimelineRow[] = [];
  for (const row of rows) {
    const prev = compacted[compacted.length - 1];
    const canGroup =
      prev &&
      prev.source === row.source &&
      prev.jobType === row.jobType &&
      prev.status === row.status &&
      prev.actorUserId === row.actorUserId &&
      Math.abs(new Date(prev.at).getTime() - new Date(row.at).getTime()) <= 20000;
    if (canGroup) {
      prev.groupedCount = (prev.groupedCount || 1) + 1;
      prev.groupedFromAt = row.at;
      continue;
    }
    compacted.push({ ...row, groupedCount: row.groupedCount || 1 });
  }
  return compacted;
}

function formatAge(fromIso?: string | null): string {
  if (!fromIso) return "—";
  const ms = Date.now() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

const TAB_META: Array<{ id: Category; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "docket", label: "Docket", icon: ScrollText },
  { id: "update", label: "Update Orders", icon: RefreshCw },
  { id: "anomaly", label: "Anomaly Orders", icon: AlertTriangle },
  { id: "receipt", label: "Receipts", icon: ReceiptText },
];

export function PrintOpsCenter({ defaultTab = "docket" as Category }) {
  const [tab, setTab] = useState<Category>(defaultTab);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rows, setRows] = useState<PrintJobRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string>("");
  const [waiterFilter, setWaiterFilter] = useState<string>("all");
  const [terminalFilter, setTerminalFilter] = useState<string>("all");
  const [counts, setCounts] = useState<Record<Category, number>>({
    docket: 0,
    update: 0,
    anomaly: 0,
    receipt: 0,
  });
  const [successRate, setSuccessRate] = useState<number | null>(null);
  const [p95LatencyMs, setP95LatencyMs] = useState<number | null>(null);
  const [topFailureJobType, setTopFailureJobType] = useState<{ jobType: string; failureRate: number } | null>(null);
  const [topError, setTopError] = useState<{ message: string; count: number } | null>(null);
  const [topFailingTerminal, setTopFailingTerminal] = useState<{ terminalId: string; failed: number } | null>(null);
  const [terminalHealthRows, setTerminalHealthRows] = useState<Array<{ terminalId: string; failed: number; completed: number; total: number; failureRate: number }>>([]);
  const [terminalRemediationRows, setTerminalRemediationRows] = useState<TerminalRemediationRow[]>([]);
  const [terminalActionBusy, setTerminalActionBusy] = useState<string>("");
  const [requeueReasonRows, setRequeueReasonRows] = useState<Array<{ reason: string; count: number }>>([]);
  const [sloByCategory, setSloByCategory] = useState<Record<string, { successRate: number; p95LatencyMs: number; samples: number }>>({});
  const [trendHourly, setTrendHourly] = useState<Array<{ bucket: string; completed: number; failed: number }>>([]);
  const [slaBreachCount, setSlaBreachCount] = useState<number>(0);
  const [slaLevel, setSlaLevel] = useState<"healthy" | "degraded" | "critical">("healthy");
  const [slaBreachAging, setSlaBreachAging] = useState<{ gt90s: number; gt180s: number; gt300s: number }>({
    gt90s: 0,
    gt180s: 0,
    gt300s: 0,
  });
  const [slaBreachedByCategory, setSlaBreachedByCategory] = useState<Record<string, number>>({});
  const [parallelHealth, setParallelHealth] = useState<{
    mirroredSuccess: number;
    directOnlySuccess: number;
    queueOnlySuccess: number;
    mirroredFailure: number;
  }>({
    mirroredSuccess: 0,
    directOnlySuccess: 0,
    queueOnlySuccess: 0,
    mirroredFailure: 0,
  });
  const prevSlaLevelRef = useRef<"healthy" | "degraded" | "critical">("healthy");
  const lastLoggedSlaLevelRef = useRef<"healthy" | "degraded" | "critical">("healthy");
  const prevSlaBreachRef = useRef<number>(0);
  const prevCountsRef = useRef<Record<Category, number>>({
    docket: 0,
    update: 0,
    anomaly: 0,
    receipt: 0,
  });
  const hasLoadedRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineOrderId, setTimelineOrderId] = useState<string>("");
  const [timelineRows, setTimelineRows] = useState<TimelineRow[]>([]);
  const [timelineOrderMeta, setTimelineOrderMeta] = useState<{
    orderNumber?: string;
    tableNumber?: number;
    waiterName?: string;
    customerName?: string;
    paymentStatus?: string;
  } | null>(null);

  const fetchRows = useCallback(
    async (opts?: { cursor?: string; append?: boolean; silent?: boolean }) => {
      const append = Boolean(opts?.append);
      const cursor = opts?.cursor || "";
      if (append) setLoadingMore(true);
      else if (!opts?.silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("category", tab);
        params.set("limit", "50");
        if (waiterFilter !== "all") params.set("waiterId", waiterFilter);
        if (terminalFilter !== "all") params.set("terminalId", terminalFilter);
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/pos/print-jobs?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load print jobs");

        const incoming = Array.isArray(json.jobs) ? (json.jobs as PrintJobRow[]) : [];
        const staleQueued = incoming.filter((r) => {
          const status = String(r.status || "");
          if (status !== "pending" && status !== "printing") return false;
          const at = r.queuedAt || r.timestamp || r.$createdAt;
          if (!at) return false;
          return Date.now() - new Date(at).getTime() > 90_000;
        }).length;
        setSlaBreachCount(staleQueued);
        if (staleQueued > prevSlaBreachRef.current && staleQueued > 0) {
          toast.warning(`${staleQueued} print job(s) breached 90s queue SLA.`);
        }
        prevSlaBreachRef.current = staleQueued;
        setRows((prev) => {
          if (!append) return incoming;
          const seen = new Set(prev.map((x) => x.$id));
          const merged = [...prev];
          incoming.forEach((r) => {
            if (!seen.has(r.$id)) merged.push(r);
          });
          return merged;
        });
        setNextCursor(String(json.nextCursor || ""));

        if (json.counts) {
          const nextCounts = {
            docket: Number(json.counts.docket || 0),
            update: Number(json.counts.update || 0),
            anomaly: Number(json.counts.anomaly || 0),
            receipt: Number(json.counts.receipt || 0),
          };
          const prev = prevCountsRef.current;
          if (hasLoadedRef.current && !append) {
            if (nextCounts.docket > prev.docket) toast.message("New docket print job received");
            if (nextCounts.update > prev.update) toast.message("Order update delta queued");
            if (nextCounts.anomaly > prev.anomaly) toast.warning("New anomaly adjustment requires review");
          }
          prevCountsRef.current = nextCounts;
          hasLoadedRef.current = true;
          setCounts(nextCounts);
        }

        if (!append) {
          try {
            const summaryRes = await fetch(`/api/pos/print-audit/summary?hours=24`, { cache: "no-store" });
            const summary = (await summaryRes.json()) as PrintAuditSummary;
            if (summaryRes.ok) {
              setSuccessRate(typeof summary.successRate === "number" ? summary.successRate : null);
              const p95 = Number(summary.latency?.p95LatencyMs ?? NaN);
              setP95LatencyMs(Number.isFinite(p95) ? p95 : null);
              const topFailure = Array.isArray(summary.failureRatesByJobType) ? summary.failureRatesByJobType[0] : null;
              if (topFailure && typeof topFailure.failureRate === "number" && topFailure.jobType) {
                setTopFailureJobType({
                  jobType: String(topFailure.jobType),
                  failureRate: topFailure.failureRate,
                });
              } else {
                setTopFailureJobType(null);
              }
              const error = Array.isArray(summary.topErrors) ? summary.topErrors[0] : null;
              if (error && error.message && Number(error.count || 0) > 0) {
                setTopError({ message: String(error.message), count: Number(error.count || 0) });
              } else {
                setTopError(null);
              }
              const terminal = Array.isArray(summary.topFailingTerminals) ? summary.topFailingTerminals[0] : null;
              if (terminal && terminal.terminalId) {
                setTopFailingTerminal({
                  terminalId: String(terminal.terminalId),
                  failed: Number(terminal.failed || 0),
                });
              } else {
                setTopFailingTerminal(null);
              }
              const terminals = Array.isArray(summary.terminalHealth)
                ? summary.terminalHealth.map((x) => ({
                    terminalId: String(x.terminalId || "unknown"),
                    failed: Number(x.failed || 0),
                    completed: Number(x.completed || 0),
                    total: Number(x.total || 0),
                    failureRate: Number(x.failureRate || 0),
                  }))
                : [];
              setTerminalHealthRows(terminals);
              const reasons = Array.isArray(summary.requeueReasons)
                ? summary.requeueReasons.map((x) => ({
                    reason: String(x.reason || "unknown"),
                    count: Number(x.count || 0),
                  }))
                : [];
              setRequeueReasonRows(reasons);
              const nextSlo: Record<string, { successRate: number; p95LatencyMs: number; samples: number }> = {};
              const rawSlo = summary.byCategorySlo || {};
              Object.keys(rawSlo).forEach((k) => {
                const entry = rawSlo[k];
                nextSlo[k] = {
                  successRate: Number(entry?.successRate || 0),
                  p95LatencyMs: Number(entry?.p95LatencyMs || 0),
                  samples: Number(entry?.samples || 0),
                };
              });
              setSloByCategory(nextSlo);
              const trend = Array.isArray(summary.trendHourly)
                ? summary.trendHourly.map((x) => ({
                    bucket: String(x.bucket || ""),
                    completed: Number(x.completed || 0),
                    failed: Number(x.failed || 0),
                  }))
                : [];
              setTrendHourly(trend);
              const summarySlaLevel = summary.queueHealth?.level || "healthy";
              setSlaLevel(summarySlaLevel);
              const queueBreached = Number(summary.queueHealth?.breachedJobs || 0);
              setSlaBreachCount(queueBreached);
              setSlaBreachedByCategory(summary.queueHealth?.breachedByCategory || {});
              setSlaBreachAging({
                gt90s: Number(summary.queueHealth?.breachAging?.gt90s || 0),
                gt180s: Number(summary.queueHealth?.breachAging?.gt180s || 0),
                gt300s: Number(summary.queueHealth?.breachAging?.gt300s || 0),
              });
              setParallelHealth({
                mirroredSuccess: Number(summary.parallelHealth?.mirroredSuccess || 0),
                directOnlySuccess: Number(summary.parallelHealth?.directOnlySuccess || 0),
                queueOnlySuccess: Number(summary.parallelHealth?.queueOnlySuccess || 0),
                mirroredFailure: Number(summary.parallelHealth?.mirroredFailure || 0),
              });
              if (
                summarySlaLevel !== prevSlaLevelRef.current &&
                (summarySlaLevel === "degraded" || summarySlaLevel === "critical")
              ) {
                toast.warning(`Queue health is now ${summarySlaLevel}.`);
              }
              prevSlaLevelRef.current = summarySlaLevel;
            }
          } catch {
            // Non-blocking summary metric.
          }
          try {
            const remRes = await fetch("/api/pos/print-ops/terminals", { cache: "no-store" });
            const remJson = await remRes.json().catch(() => ({}));
            if (remRes.ok && Array.isArray(remJson.terminals)) {
              const items = remJson.terminals.map((x: any) => ({
                terminalId: String(x.terminalId || "default"),
                pending: Number(x.pending || 0),
                printing: Number(x.printing || 0),
                failedRecent: Number(x.failedRecent || 0),
                lastQueuedAt: String(x.lastQueuedAt || ""),
                state: String(x.state || "active") === "paused" ? "paused" : "active",
                fallbackTerminal: String(x.fallbackTerminal || "default"),
                lastIncidentAt: String(x.lastIncidentAt || ""),
                lastIncidentMessage: String(x.lastIncidentMessage || ""),
              })) as TerminalRemediationRow[];
              setTerminalRemediationRows(items);
            }
          } catch {
            // Non-blocking remediation metrics.
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load print jobs");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tab, waiterFilter, terminalFilter]
  );

  const openTimeline = useCallback(async (orderId?: string) => {
    const id = String(orderId || "").trim();
    if (!id) {
      toast.error("Missing order id");
      return;
    }
    setTimelineOpen(true);
    setTimelineOrderId(id);
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/pos/print-jobs/timeline?orderId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load timeline");
      setTimelineRows(compactTimelineRows(Array.isArray(json.timeline) ? json.timeline : []));
      setTimelineOrderMeta(json.order || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load timeline");
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  useEffect(() => {
    setNextCursor("");
    void fetchRows({ append: false });
  }, [fetchRows]);

  useEffect(() => {
    const t = setInterval(() => {
      void fetchRows({ append: false, silent: true });
    }, 30000);
    return () => clearInterval(t);
  }, [fetchRows]);

  useEffect(() => {
    if (slaLevel === "healthy") {
      lastLoggedSlaLevelRef.current = "healthy";
      return;
    }
    if (lastLoggedSlaLevelRef.current === slaLevel) return;
    const breached = Number(slaBreachCount || 0);
    void fetch("/api/pos/print-ops/terminals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "log_health_transition",
        terminalId: "fleet",
        level: slaLevel,
        breachedJobs: breached,
      }),
    }).catch(() => {
      // Best-effort incident logging.
    });
    lastLoggedSlaLevelRef.current = slaLevel;
  }, [slaLevel, slaBreachCount]);

  useEffect(() => {
    const databaseId = process.env.NEXT_PUBLIC_DATABASE_ID;
    const printJobsCollectionId = process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
    if (!databaseId || !printJobsCollectionId) return;
    const unsubscribe = client.subscribe(
      `databases.${databaseId}.collections.${printJobsCollectionId}.documents`,
      (response: { events?: string[] }) => {
        const ev = response.events || [];
        const changed =
          ev.some((x) => x.includes(".create")) ||
          ev.some((x) => x.includes(".update")) ||
          ev.some((x) => x.includes(".delete"));
        if (!changed) return;
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = setTimeout(() => {
          void fetchRows({ append: false, silent: true });
        }, 350);
      }
    );
    return () => {
      unsubscribe();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [fetchRows]);

  const title = useMemo(() => TAB_META.find((t) => t.id === tab)?.label || "Print Ops", [tab]);
  const waiterOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      const id = String(r.waiterId || "").trim();
      const name = String(r.waiterName || "").trim();
      if (id && name) map.set(id, name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const terminalOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const id = String(r.targetTerminal || "").trim();
      if (id) set.add(id);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const queueJob = async (jobType: string, content: string, requeueReason: string) => {
    const res = await fetch("/api/pos/print-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobType, content, requeueReason }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Queue failed");
  };

  const runTerminalAction = useCallback(
    async (action: "pause" | "resume" | "reroute_pending", terminalId: string) => {
      const id = String(terminalId || "").trim();
      if (!id) return;
      let toTerminal = "default";
      if (action === "pause" || action === "reroute_pending") {
        const entered = window.prompt("Route to terminal (default by default):", "default");
        toTerminal = String(entered || "default").trim() || "default";
      }
      try {
        setTerminalActionBusy(`${action}:${id}`);
        const res = await fetch("/api/pos/print-ops/terminals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, terminalId: id, toTerminal }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Terminal action failed");
        if (action === "reroute_pending") {
          toast.success(`Rerouted ${Number(json?.updated || 0)} active jobs`);
        } else {
          toast.success(action === "pause" ? "Terminal paused" : "Terminal resumed");
        }
        await fetchRows({ append: false, silent: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Terminal action failed");
      } finally {
        setTerminalActionBusy("");
      }
    },
    [fetchRows]
  );

  const printReceiptFor = useCallback(async (orderId?: string) => {
    if (!orderId) {
      toast.error("Missing order id");
      return;
    }
    try {
      await queueJob("receipt", `orderId:${orderId}`, "admin_receipt_reprint");
      toast.success("Receipt queued");
      await fetchRows({ append: false, silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to queue receipt");
    }
  }, [fetchRows]);

  const reprintJob = useCallback(async (row: PrintJobRow) => {
    try {
      const reason = row.jobType === "receipt" ? "admin_receipt_reprint" : "admin_docket_reprint";
      await queueJob(row.jobType, row.content, reason);
      toast.success("Print queued");
      await fetchRows({ append: false, silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to queue print");
    }
  }, [fetchRows]);

  const approveJob = useCallback(async (jobId: string) => {
    const id = String(jobId || "").trim();
    if (!id) return;
    try {
      const res = await fetch(`/api/pos/print-jobs/${encodeURIComponent(id)}/approve`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to approve print job");
      toast.success("Print job approved and moved to queue.");
      await fetchRows({ append: false, silent: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve print job");
    }
  }, [fetchRows]);

  const trendMax = useMemo(() => {
    return trendHourly.reduce((m, x) => Math.max(m, x.completed + x.failed), 1);
  }, [trendHourly]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-3">
        <div className="flex flex-wrap gap-2">
          {TAB_META.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                tab === id
                  ? "bg-amber-500 text-slate-900"
                  : "bg-slate-800/70 text-slate-200 hover:bg-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? "bg-slate-900/20" : "bg-slate-600/40"}`}>
                {counts[id]}
              </span>
            </button>
          ))}
        </div>
        {successRate != null && (
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <p className="text-xs text-slate-400">
              24h success rate:{" "}
              <span className={successRate >= 0.97 ? "text-emerald-400" : successRate >= 0.9 ? "text-amber-400" : "text-rose-400"}>
                {(successRate * 100).toFixed(1)}%
              </span>
            </p>
            <p className="text-xs text-slate-400">
              P95 queue-to-complete:{" "}
              <span className="text-slate-200">
                {p95LatencyMs != null ? `${Math.max(0, Math.round(p95LatencyMs / 1000))}s` : "—"}
              </span>
            </p>
            <p className="text-xs text-slate-400">
              Highest failure stream:{" "}
              <span className="text-slate-200">
                {topFailureJobType ? `${topFailureJobType.jobType} (${(topFailureJobType.failureRate * 100).toFixed(1)}%)` : "—"}
              </span>
            </p>
            <p className="text-xs text-slate-500 md:col-span-3 truncate">
              Top error: {topError ? `${topError.message} (${topError.count})` : "—"}
            </p>
            <p className={`text-xs md:col-span-3 ${slaBreachCount > 0 ? "text-rose-300" : "text-slate-500"}`}>
              Queue SLA (&gt;90s): {slaBreachCount > 0 ? `${slaBreachCount} breached` : "healthy"} · Level: {slaLevel}
            </p>
            <p className="text-xs text-slate-500 md:col-span-3">
              Breach aging: &gt;90s {slaBreachAging.gt90s} · &gt;180s {slaBreachAging.gt180s} · &gt;300s{" "}
              {slaBreachAging.gt300s}
            </p>
            <p className="text-xs text-slate-500 md:col-span-3 truncate">
              Adaptive breach by category: docket {Number(slaBreachedByCategory.docket || 0)} · update{" "}
              {Number(slaBreachedByCategory.update || 0)} · anomaly {Number(slaBreachedByCategory.anomaly || 0)} ·
              receipt {Number(slaBreachedByCategory.receipt || 0)}
            </p>
            <p className="text-xs text-slate-500 md:col-span-3 truncate">
              Top failing terminal: {topFailingTerminal ? `${topFailingTerminal.terminalId} (${topFailingTerminal.failed})` : "—"}
            </p>
            <p className="text-xs text-slate-500 md:col-span-3 truncate">
              Parallel print health: mirrored {parallelHealth.mirroredSuccess} · direct-only {parallelHealth.directOnlySuccess} · queue-only {parallelHealth.queueOnlySuccess} · failed groups {parallelHealth.mirroredFailure}
            </p>
            {trendHourly.length > 0 && (
              <div className="md:col-span-3">
                <p className="mb-1 text-[11px] text-slate-500">24h trend (completed vs failed)</p>
                <div className="flex h-10 items-end gap-0.5 rounded-md border border-slate-800 bg-slate-950/60 px-1 py-1">
                  {trendHourly.map((point) => {
                    const total = point.completed + point.failed;
                    const h = Math.max(2, Math.round((total / trendMax) * 28));
                    return (
                      <div
                        key={point.bucket}
                        className="group relative flex-1 rounded-sm bg-emerald-500/70"
                        style={{ height: `${h}px` }}
                        title={`${point.bucket}: ${point.completed} completed, ${point.failed} failed`}
                      >
                        {point.failed > 0 && (
                          <div
                            className="absolute bottom-0 left-0 w-full rounded-b-sm bg-rose-500/80"
                            style={{
                              height: `${Math.max(1, Math.round((point.failed / Math.max(1, total)) * h))}px`,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="md:col-span-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {(["docket", "update", "anomaly", "receipt"] as const).map((c) => {
                const k = sloByCategory[c];
                const rate = k ? k.successRate : 0;
                return (
                  <div key={c} className="rounded-md border border-slate-800 bg-slate-950/50 p-2 text-[11px]">
                    <p className="uppercase tracking-wide text-slate-500">{c}</p>
                    <p className={rate >= 0.97 ? "text-emerald-300" : rate >= 0.9 ? "text-amber-300" : "text-rose-300"}>
                      {(rate * 100).toFixed(1)}% success
                    </p>
                    <p className="text-slate-400">
                      p95 {k ? `${Math.max(0, Math.round(k.p95LatencyMs / 1000))}s` : "—"} · {k?.samples || 0} samples
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="md:col-span-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Terminal remediation view</p>
                <div className="space-y-1 text-[11px]">
                  {terminalRemediationRows.length === 0 && terminalHealthRows.length === 0 ? (
                    <p className="text-slate-500">No terminal failure data in this window.</p>
                  ) : (
                    (terminalRemediationRows.length > 0
                      ? terminalRemediationRows
                      : terminalHealthRows.map((t) => ({
                          terminalId: t.terminalId,
                          pending: 0,
                          printing: 0,
                          failedRecent: t.failed,
                          state: "active" as const,
                          fallbackTerminal: "default",
                          lastIncidentAt: "",
                          lastIncidentMessage: "",
                        }))
                    )
                      .slice(0, 4)
                      .map((t) => {
                        const paused = t.state === "paused";
                        const busyPauseResume =
                          terminalActionBusy === `${paused ? "resume" : "pause"}:${t.terminalId}`;
                        const busyReroute = terminalActionBusy === `reroute_pending:${t.terminalId}`;
                        return (
                          <div key={t.terminalId} className="rounded border border-slate-800 px-2 py-1.5">
                            <p className="text-slate-300">
                              {t.terminalId}{" "}
                              <span className={paused ? "text-amber-300" : "text-emerald-300"}>
                                ({paused ? "paused" : "active"})
                              </span>
                              : {t.failedRecent} failed · {t.pending} pending · {t.printing} printing
                            </p>
                            {t.lastIncidentAt && (
                              <p className="truncate text-[10px] text-slate-500">
                                Last incident {new Date(t.lastIncidentAt).toLocaleString("en-KE")}:{" "}
                                {t.lastIncidentMessage || "—"}
                              </p>
                            )}
                            <div className="mt-1 flex items-center gap-1">
                              <button
                                type="button"
                                disabled={busyPauseResume || busyReroute}
                                onClick={() =>
                                  void runTerminalAction(paused ? "resume" : "pause", t.terminalId)
                                }
                                className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                              >
                                {paused ? "Resume" : "Pause"}
                              </button>
                              <button
                                type="button"
                                disabled={busyPauseResume || busyReroute}
                                onClick={() => void runTerminalAction("reroute_pending", t.terminalId)}
                                className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                              >
                                Reroute Active
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Requeue reason distribution</p>
                <div className="space-y-1 text-[11px]">
                  {requeueReasonRows.length === 0 ? (
                    <p className="text-slate-500">No requeue metadata in this window.</p>
                  ) : (
                    requeueReasonRows.slice(0, 5).map((r) => (
                      <p key={r.reason} className="text-slate-300">
                        {r.reason}: {r.count}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-700/60 p-4">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <div className="flex items-center gap-3">
            <select
              value={waiterFilter}
              onChange={(e) => setWaiterFilter(e.target.value)}
              className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
            >
              <option value="all">All waiters</option>
              {waiterOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select
              value={terminalFilter}
              onChange={(e) => setTerminalFilter(e.target.value)}
              className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
            >
              <option value="all">All terminals</option>
              {terminalOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void fetchRows({ append: false })}
              className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-800">
          {loading ? (
            <p className="p-4 text-sm text-slate-400">Loading print jobs…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">No records in this tab yet.</p>
          ) : (
            rows.map((row) => (
              <div key={row.$id} className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 font-medium truncate">
                    {row.orderNumber ? `#${row.orderNumber}` : row.orderId ? `Order ${row.orderId}` : row.summary || row.jobType}
                  </p>
                  <p className="text-xs text-slate-400">
                    {row.summary || row.jobType} · {row.status} ·{" "}
                    {new Date(row.timestamp || row.$createdAt || Date.now()).toLocaleString("en-KE")}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {row.waiterName ? `Waiter: ${row.waiterName}` : "Waiter: —"}
                    {" · "}
                    {row.tableNumber != null ? `Table ${row.tableNumber}` : "Table —"}
                    {row.paymentStatus ? ` · ${row.paymentStatus}` : ""}
                    {row.targetTerminal ? ` · Terminal ${row.targetTerminal}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Queue age: {formatAge(row.queuedAt || row.timestamp || row.$createdAt)}
                    {" · "}
                    Retries: {Math.max(0, Number(row.attemptCount || 0))}
                    {row.errorMessage ? ` · Last error: ${String(row.errorMessage).slice(0, 72)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.status === "pending_approval" && (
                    <button
                      type="button"
                      onClick={() => void approveJob(row.$id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10"
                    >
                      Approve
                    </button>
                  )}
                  {row.orderId && (
                    <button
                      type="button"
                      onClick={() => void openTimeline(row.orderId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Timeline
                    </button>
                  )}
                  {(tab === "docket" || tab === "update" || tab === "anomaly") && (
                    <button
                      type="button"
                      onClick={() => void reprintJob(row)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print Docket
                    </button>
                  )}
                  {(tab === "update" || tab === "anomaly" || tab === "receipt") && (
                    <button
                      type="button"
                      onClick={() => void printReceiptFor(row.orderId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <ReceiptText className="h-3.5 w-3.5" />
                      Print Final Receipt
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          {!loading && nextCursor && (
            <div className="p-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void fetchRows({ append: true, cursor: nextCursor, silent: true })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>
      {timelineOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-700 bg-slate-950 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">
                  {timelineOrderMeta?.orderNumber
                    ? `Order #${timelineOrderMeta.orderNumber}`
                    : `Order ${timelineOrderId}`}
                </h4>
                <p className="text-xs text-slate-400">
                  {timelineOrderMeta?.waiterName ? `Waiter: ${timelineOrderMeta.waiterName}` : "Waiter: —"}
                  {" · "}
                  {timelineOrderMeta?.tableNumber != null ? `Table ${timelineOrderMeta.tableNumber}` : "Table —"}
                  {timelineOrderMeta?.paymentStatus ? ` · ${timelineOrderMeta.paymentStatus}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTimelineOpen(false)}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            {timelineLoading ? (
              <p className="text-sm text-slate-400">Loading timeline…</p>
            ) : timelineRows.length === 0 ? (
              <p className="text-sm text-slate-400">No timeline records found for this order.</p>
            ) : (
              <div className="space-y-2">
                {timelineRows.map((row) => (
                  <div key={`${row.source}-${row.id}`} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                    <p className="text-xs text-slate-300">
                      {row.source.toUpperCase()} · {row.jobType} · {row.status}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(row.at || Date.now()).toLocaleString("en-KE")}
                      {row.actorRole ? ` · ${row.actorRole}` : ""}
                      {row.actorUserId ? ` · ${row.actorUserId}` : ""}
                    </p>
                    {Number(row.groupedCount || 1) > 1 && (
                      <p className="mt-1 text-[11px] text-amber-300">
                        Grouped {row.groupedCount} similar events
                        {row.groupedFromAt ? ` since ${new Date(row.groupedFromAt).toLocaleString("en-KE")}` : ""}
                      </p>
                    )}
                    {row.summary && <p className="mt-1 text-xs text-slate-300">{row.summary}</p>}
                    {row.errorMessage && <p className="mt-1 text-xs text-rose-300">{row.errorMessage}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

