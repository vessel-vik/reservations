import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import {
    databases,
    DATABASE_ID,
    PRINT_AUDIT_ENTRIES_COLLECTION_ID,
} from "@/lib/appwrite.config";
import { requireOrgAdmin } from "@/lib/auth.utils";

type Category = "docket" | "update" | "anomaly" | "receipt";
type Status = "queued" | "printing" | "completed" | "failed";
type AuditRow = {
    printJobId?: string;
    category?: string;
    jobType?: string;
    status?: string;
    timestamp?: string;
    errorMessage?: string;
    terminalId?: string;
    requeueReason?: string;
    dedupeKey?: string;
    summary?: string;
};

const CATEGORY_SLA_THRESHOLD_MS: Record<Category, number> = {
    docket: 90_000,
    update: 90_000,
    anomaly: 120_000,
    receipt: 60_000,
};

function percentile(sortedValues: number[], p: number): number {
    if (!sortedValues.length) return 0;
    const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((p / 100) * (sortedValues.length - 1))));
    return sortedValues[idx];
}

function hourBucketIso(ts: number): string {
    const d = new Date(ts);
    d.setMinutes(0, 0, 0);
    return d.toISOString();
}

function isCategory(value: string): value is Category {
    return value === "docket" || value === "update" || value === "anomaly" || value === "receipt";
}

function isStatus(value: string): value is Status {
    return value === "queued" || value === "printing" || value === "completed" || value === "failed";
}

export function computePrintAuditSummary(rows: AuditRow[], hours: number) {
    const categories: Category[] = ["docket", "update", "anomaly", "receipt"];
    const byCategory: Record<Category, { queued: number; printing: number; completed: number; failed: number }> = {
        docket: { queued: 0, printing: 0, completed: 0, failed: 0 },
        update: { queued: 0, printing: 0, completed: 0, failed: 0 },
        anomaly: { queued: 0, printing: 0, completed: 0, failed: 0 },
        receipt: { queued: 0, printing: 0, completed: 0, failed: 0 },
    };
    const byJob = new Map<string, { category: Category; queuedAt?: number; completedAt?: number }>();
    const byJobType: Record<string, { completed: number; failed: number; total: number }> = {};
    const errorCounts = new Map<string, number>();
    const failedByTerminal = new Map<string, number>();
    const terminalStats = new Map<string, { completed: number; failed: number }>();
    const requeueReasonCounts = new Map<string, number>();
    const trendMap = new Map<string, { completed: number; failed: number }>();
    const parallelGroups = new Map<string, { directCompleted: number; queueCompleted: number; directFailed: number; queueFailed: number }>();

    rows.forEach((r) => {
        const c = String(r.category || "");
        const s = String(r.status || "");
        const jobId = String(r.printJobId || "");
        const ts = new Date(String(r.timestamp || "")).getTime();

        if (isCategory(c) && isStatus(s)) {
            byCategory[c][s] += 1;
            if (jobId) {
                const meta = byJob.get(jobId) || { category: c };
                meta.category = c;
                if (s === "queued" && Number.isFinite(ts)) {
                    meta.queuedAt = meta.queuedAt == null ? ts : Math.min(meta.queuedAt, ts);
                }
                if (s === "completed" && Number.isFinite(ts)) {
                    meta.completedAt = meta.completedAt == null ? ts : Math.min(meta.completedAt, ts);
                }
                byJob.set(jobId, meta);
            }
        }

        const jobType = String(r.jobType || "unknown");
        const stat = byJobType[jobType] || { completed: 0, failed: 0, total: 0 };
        if (s === "completed") stat.completed += 1;
        if (s === "failed") stat.failed += 1;
        if (s === "completed" || s === "failed") stat.total += 1;
        byJobType[jobType] = stat;

        if (s === "failed") {
            const key = String(r.errorMessage || "Unknown print failure").trim().slice(0, 140) || "Unknown print failure";
            errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
            const terminal = String(r.terminalId || "unknown").trim() || "unknown";
            failedByTerminal.set(terminal, (failedByTerminal.get(terminal) || 0) + 1);
        }
        if (s === "completed" || s === "failed") {
            const terminal = String(r.terminalId || "unknown").trim() || "unknown";
            const stat = terminalStats.get(terminal) || { completed: 0, failed: 0 };
            if (s === "completed") stat.completed += 1;
            if (s === "failed") stat.failed += 1;
            terminalStats.set(terminal, stat);
        }
        if (s === "queued") {
            const reason = String(r.requeueReason || "unknown").trim() || "unknown";
            requeueReasonCounts.set(reason, (requeueReasonCounts.get(reason) || 0) + 1);
        }

        if ((s === "completed" || s === "failed") && Number.isFinite(ts)) {
            const bucket = hourBucketIso(ts);
            const row = trendMap.get(bucket) || { completed: 0, failed: 0 };
            if (s === "completed") row.completed += 1;
            if (s === "failed") row.failed += 1;
            trendMap.set(bucket, row);
        }

        const key = String(r.dedupeKey || "").trim();
        if (key) {
            const group = parallelGroups.get(key) || {
                directCompleted: 0,
                queueCompleted: 0,
                directFailed: 0,
                queueFailed: 0,
            };
            const summary = String(r.summary || "").toLowerCase();
            const isDirect = summary.includes("[direct]");
            const isQueued = summary.includes("[queued]") || !isDirect;
            if (s === "completed") {
                if (isDirect) group.directCompleted += 1;
                if (isQueued) group.queueCompleted += 1;
            }
            if (s === "failed") {
                if (isDirect) group.directFailed += 1;
                if (isQueued) group.queueFailed += 1;
            }
            parallelGroups.set(key, group);
        }
    });

    const totalCompleted = rows.filter((r) => r.status === "completed").length;
    const totalFailed = rows.filter((r) => r.status === "failed").length;
    const successRate = totalCompleted + totalFailed > 0 ? totalCompleted / (totalCompleted + totalFailed) : 1;

    const latenciesMs: number[] = [];
    const latencyByCategory: Record<Category, number[]> = {
        docket: [],
        update: [],
        anomaly: [],
        receipt: [],
    };
    byJob.forEach((v) => {
        if (v.queuedAt != null && v.completedAt != null && v.completedAt >= v.queuedAt) {
            const latency = v.completedAt - v.queuedAt;
            latenciesMs.push(latency);
            latencyByCategory[v.category].push(latency);
        }
    });
    latenciesMs.sort((a, b) => a - b);
    const p50LatencyMs = percentile(latenciesMs, 50);
    const p95LatencyMs = percentile(latenciesMs, 95);
    const avgLatencyMs =
        latenciesMs.length > 0 ? Math.round(latenciesMs.reduce((s, n) => s + n, 0) / latenciesMs.length) : 0;

    const byCategorySlo = categories.reduce((acc, c) => {
        const completed = byCategory[c].completed;
        const failed = byCategory[c].failed;
        const arr = [...latencyByCategory[c]].sort((a, b) => a - b);
        acc[c] = {
            successRate: completed + failed > 0 ? completed / (completed + failed) : 1,
            samples: arr.length,
            p95LatencyMs: percentile(arr, 95),
            avgLatencyMs: arr.length > 0 ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0,
        };
        return acc;
    }, {} as Record<Category, { successRate: number; samples: number; p95LatencyMs: number; avgLatencyMs: number }>);

    const failureRatesByJobType = Object.entries(byJobType)
        .map(([jobType, stats]) => ({
            jobType,
            totalTerminalEvents: stats.total,
            failed: stats.failed,
            completed: stats.completed,
            failureRate: stats.total > 0 ? stats.failed / stats.total : 0,
        }))
        .sort((a, b) => b.failureRate - a.failureRate);

    const topErrors = Array.from(errorCounts.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    const topFailingTerminals = Array.from(failedByTerminal.entries())
        .map(([terminalId, failed]) => ({ terminalId, failed }))
        .sort((a, b) => b.failed - a.failed)
        .slice(0, 5);
    const terminalHealth = Array.from(terminalStats.entries())
        .map(([terminalId, stat]) => {
            const total = stat.completed + stat.failed;
            const failureRate = total > 0 ? stat.failed / total : 0;
            return {
                terminalId,
                completed: stat.completed,
                failed: stat.failed,
                total,
                failureRate,
            };
        })
        .sort((a, b) => b.failureRate - a.failureRate)
        .slice(0, 10);
    const requeueReasons = Array.from(requeueReasonCounts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    const now = Date.now();
    const trendHourly = Array.from({ length: Math.max(1, Math.floor(hours)) }, (_, idx) => {
        const t = now - (Math.floor(hours) - idx - 1) * 60 * 60 * 1000;
        const bucket = hourBucketIso(t);
        const val = trendMap.get(bucket) || { completed: 0, failed: 0 };
        return {
            bucket,
            completed: val.completed,
            failed: val.failed,
        };
    });

    const breachAging = { gt90s: 0, gt180s: 0, gt300s: 0 };
    const breachedByCategory: Record<Category, number> = {
        docket: 0,
        update: 0,
        anomaly: 0,
        receipt: 0,
    };
    let breachedJobs = 0;
    byJob.forEach((x) => {
        if (x.queuedAt == null || x.completedAt != null) return;
        const age = now - x.queuedAt;
        if (age > 90_000) breachAging.gt90s += 1;
        if (age > 180_000) breachAging.gt180s += 1;
        if (age > 300_000) breachAging.gt300s += 1;
        const threshold = CATEGORY_SLA_THRESHOLD_MS[x.category] || 90_000;
        if (age > threshold) {
            breachedJobs += 1;
            breachedByCategory[x.category] += 1;
        }
    });
    const queueHealthLevel = breachedJobs >= 6 ? "critical" : breachedJobs >= 2 ? "degraded" : "healthy";
    let mirroredSuccess = 0;
    let directOnlySuccess = 0;
    let queueOnlySuccess = 0;
    let mirroredFailure = 0;
    parallelGroups.forEach((g) => {
        const directOk = g.directCompleted > 0;
        const queueOk = g.queueCompleted > 0;
        if (directOk && queueOk) mirroredSuccess += 1;
        else if (directOk && !queueOk) directOnlySuccess += 1;
        else if (!directOk && queueOk) queueOnlySuccess += 1;
        if (g.directFailed > 0 || g.queueFailed > 0) mirroredFailure += 1;
    });

    return {
        total: rows.length,
        successRate,
        byCategory,
        byCategorySlo,
        latency: {
            samples: latenciesMs.length,
            p50LatencyMs,
            p95LatencyMs,
            avgLatencyMs,
        },
        failureRatesByJobType,
        topErrors,
        topFailingTerminals,
        terminalHealth,
        requeueReasons,
        trendHourly,
        queueHealth: {
            breachedJobs,
            level: queueHealthLevel as "healthy" | "degraded" | "critical",
            thresholdMs: 90_000,
            adaptiveThresholdsMs: CATEGORY_SLA_THRESHOLD_MS,
            breachedByCategory,
            breachAging,
        },
        parallelHealth: {
            mirroredSuccess,
            directOnlySuccess,
            queueOnlySuccess,
            mirroredFailure,
        },
    };
}

export async function GET(request: NextRequest) {
    try {
        if (!DATABASE_ID || !PRINT_AUDIT_ENTRIES_COLLECTION_ID) {
            return NextResponse.json({ error: "Print audit not configured" }, { status: 503 });
        }
        const { businessId } = await requireOrgAdmin();
        const hours = Math.min(24 * 14, Math.max(1, Number(request.nextUrl.searchParams.get("hours") || 24)));
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        const base = [
            Query.equal("businessId", businessId),
            Query.greaterThanEqual("timestamp", since),
            Query.limit(5000),
        ];
        const res = await databases.listDocuments(DATABASE_ID, PRINT_AUDIT_ENTRIES_COLLECTION_ID, [
            ...base,
            Query.orderDesc("timestamp"),
        ]);
        const rows = res.documents as AuditRow[];
        const summary = computePrintAuditSummary(rows, hours);

        return NextResponse.json({
            windowHours: hours,
            ...summary,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to summarize print audit";
        const status = msg.includes("FORBIDDEN") ? 403 : msg.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

