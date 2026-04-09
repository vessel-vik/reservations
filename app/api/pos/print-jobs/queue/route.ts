import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import {
    databases,
    DATABASE_ID,
    ORDERS_COLLECTION_ID,
} from "@/lib/appwrite.config";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";
import { printCategoryFromJobType, recordPrintAudit } from "@/lib/print-audit";
import { normalizeRequeueReason } from "@/lib/print-requeue-reason";
import { recordPrintOpsIncident, resolveTerminalRouting } from "@/lib/print-terminal-controls";

function collectionId(): string | undefined {
    return process.env.PRINT_JOBS_COLLECTION_ID || process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
}

function parseJobContent(jobType: string, content: string): {
    orderId?: string;
    summary?: string;
    correlationKey?: string;
    sessionId?: string;
    waiterUserId?: string;
    waiterName?: string;
} {
    const raw = String(content || "");
    try {
        const parsed = JSON.parse(raw) as {
            orderId?: string;
            deltaItems?: unknown[];
            adjustments?: unknown[];
            correlationKey?: string;
            sessionId?: string;
            waiterUserId?: string;
            waiterName?: string;
        };
        if (parsed.orderId) {
            const summary =
                jobType === "kitchen_delta"
                    ? `${Array.isArray(parsed.deltaItems) ? parsed.deltaItems.length : 0} added line(s)`
                    : jobType === "anomaly_adjustment"
                      ? `${Array.isArray(parsed.adjustments) ? parsed.adjustments.length : 0} anomaly line(s)`
                      : `Order ${parsed.orderId}`;
            return {
                orderId: parsed.orderId,
                summary,
                correlationKey: parsed.correlationKey,
                sessionId: parsed.sessionId,
                waiterUserId: parsed.waiterUserId,
                waiterName: parsed.waiterName,
            };
        }
    } catch {
        // Keep legacy parsing below.
    }
    if (jobType === "receipt" || jobType === "docket" || jobType === "captain_docket" || jobType === "kitchen_docket") {
        const id = raw.match(/orderId:([\w-]+)/)?.[1] || raw.trim();
        return { orderId: id, summary: id ? `Order ${id}` : undefined };
    }
    if (jobType === "kitchen_delta") {
        try {
            const parsed = JSON.parse(raw) as { orderId?: string; deltaItems?: unknown[] };
            return {
                orderId: parsed.orderId,
                summary: Array.isArray(parsed.deltaItems) ? `${parsed.deltaItems.length} added line(s)` : "Added items",
            };
        } catch {
            return {};
        }
    }
    if (jobType === "anomaly_adjustment") {
        try {
            const parsed = JSON.parse(raw) as { orderId?: string; adjustments?: unknown[] };
            return {
                orderId: parsed.orderId,
                summary: Array.isArray(parsed.adjustments) ? `${parsed.adjustments.length} anomaly line(s)` : "Anomaly adjustment",
            };
        } catch {
            return {};
        }
    }
    return {};
}

async function resolveOrderWaiterContext(businessId: string, orderId?: string): Promise<{ waiterId: string; waiterName: string }> {
    const id = String(orderId || "").trim();
    if (!id || !DATABASE_ID || !ORDERS_COLLECTION_ID) {
        return { waiterId: "", waiterName: "" };
    }
    try {
        const order = await databases.getDocument(DATABASE_ID, ORDERS_COLLECTION_ID, id);
        if (String((order as any).businessId || "") !== businessId) {
            return { waiterId: "", waiterName: "" };
        }
        return {
            waiterId: String((order as any).waiterId || "").slice(0, 64),
            waiterName: String((order as any).waiterName || "").slice(0, 255),
        };
    } catch {
        return { waiterId: "", waiterName: "" };
    }
}

export async function POST(request: NextRequest) {
    try {
        const coll = collectionId();
        if (!coll || !DATABASE_ID) {
            return NextResponse.json({ error: "Print jobs not configured" }, { status: 503 });
        }
        const { businessId, userId, role } = await getAuthContext();
        validateBusinessContext(businessId);

        const body = await request.json();
        const jobType = String(body?.jobType || "").trim();
        const content = String(body?.content || "").trim();
        const requestedTerminal = String(body?.targetTerminal || "default");
        const requeueReason = normalizeRequeueReason(body?.requeueReason, "system_queue");
        let dedupeKey = "";
        let sessionId = "";
        let printMode = String(body?.printMode || "queued").trim().toLowerCase();
        if (printMode !== "queued" && printMode !== "direct") printMode = "queued";
        let parsedOrderId = "";
        const allowed = new Set([
            "receipt",
            "docket",
            "captain_docket",
            "kitchen_docket",
            "kitchen_delta",
            "anomaly_adjustment",
        ]);
        if (!allowed.has(jobType) || !content) {
            return NextResponse.json({ error: "Invalid print job payload" }, { status: 400 });
        }
        if (content.length > 5000) {
            return NextResponse.json({ error: "Print content too large" }, { status: 400 });
        }

        // Parse and carry dedupe metadata from payload.
        if (jobType === "kitchen_delta" || jobType === "anomaly_adjustment") {
            try {
                const parsed = JSON.parse(content) as { dedupeKey?: string; correlationKey?: string; orderId?: string };
                dedupeKey = String(parsed.dedupeKey || parsed.correlationKey || "").trim().slice(0, 120);
                parsedOrderId = String(parsed.orderId || "").trim();
            } catch {
                return NextResponse.json(
                    { error: `${jobType} payload must be valid JSON with orderId.` },
                    { status: 400 }
                );
            }
        } else {
            const parsed = parseJobContent(jobType, content);
            parsedOrderId = parsed.orderId || "";
            sessionId = String(parsed.sessionId || "").slice(0, 120);
            if (!dedupeKey) dedupeKey = String(parsed.correlationKey || "").slice(0, 120);
        }
        if (!parsedOrderId) {
            return NextResponse.json({ error: "orderId is required in print job payload." }, { status: 400 });
        }
        if (!dedupeKey) {
            dedupeKey = `${jobType}:${parsedOrderId}:${Math.floor(Date.now() / 15000)}`.slice(0, 120);
        }

        // Shared idempotency across all print job types.
        const activeDuplicate = await databases.listDocuments(DATABASE_ID, coll, [
            Query.equal("businessId", businessId),
            Query.equal("jobType", jobType),
            Query.equal("dedupeKey", dedupeKey),
            Query.equal("status", ["pending_approval", "pending", "printing"]),
            Query.limit(1),
        ]);
        if ((activeDuplicate.total || 0) > 0) {
            const existingId = activeDuplicate.documents[0]?.$id;
            return NextResponse.json({ success: true, jobId: existingId, deduped: true });
        }

        const waiter = await resolveOrderWaiterContext(businessId, parsedOrderId);
        const parsedContentMeta = parseJobContent(jobType, content);
        const waiterFromBodyId = String(body?.waiterUserId || parsedContentMeta.waiterUserId || "").trim().slice(0, 64);
        const waiterFromBodyName = String(body?.waiterName || parsedContentMeta.waiterName || "").trim().slice(0, 255);
        const waiterContext = {
            waiterId: waiterFromBodyId || waiter.waiterId,
            waiterName: waiterFromBodyName || waiter.waiterName,
        };
        if (!dedupeKey) {
            dedupeKey = String(body?.correlationKey || parsedContentMeta.correlationKey || "").trim().slice(0, 120);
        }
        if (!sessionId) {
            sessionId = String(body?.sessionId || "").trim().slice(0, 120);
        }
        const routing = await resolveTerminalRouting({
            businessId,
            requestedTerminal,
        });
        const nowIso = new Date().toISOString();

        const requiresApproval = role !== "org:admin";
        const payload = {
            status: requiresApproval ? "pending_approval" : "pending",
            jobType,
            category: printCategoryFromJobType(jobType),
            content,
            orderId: parsedOrderId,
            timestamp: nowIso,
            queuedAt: nowIso,
            printedAt: "",
            attemptCount: 0,
            waiterId: waiterContext.waiterId,
            waiterNameSnapshot: waiterContext.waiterName,
            targetTerminal: routing.targetTerminal,
            dedupeKey,
            printMode,
            sessionId,
            requeueReason,
            createdByUserId: String(userId || "").slice(0, 64),
            createdByRole: String(role || "").slice(0, 40),
            businessId,
        };
        let created: any;
        try {
            created = await databases.createDocument(DATABASE_ID, coll, ID.unique(), payload);
        } catch {
            // Backward compatibility for older schemas that don't yet include new optional fields.
            created = await databases.createDocument(DATABASE_ID, coll, ID.unique(), {
                status: payload.status,
                jobType: payload.jobType,
                content: payload.content,
                timestamp: payload.timestamp,
                targetTerminal: payload.targetTerminal,
                dedupeKey: payload.dedupeKey,
                businessId: payload.businessId,
            });
        }
        const parsed = parseJobContent(jobType, content);
        await recordPrintAudit({
            businessId,
            printJobId: created.$id,
            jobType,
            status: "queued",
            orderId: parsed.orderId,
            summary: requiresApproval
                ? `[${printMode}] Awaiting admin approval: ${parsed.summary || jobType}`
                : `[${printMode}] ${parsed.summary || `Queued ${jobType}`}`,
            content,
            dedupeKey,
            actorUserId: userId,
            actorRole: role,
            waiterId: waiterContext.waiterId,
            terminalId: routing.targetTerminal,
            requeueReason,
        });
        if (routing.redirected) {
            await recordPrintOpsIncident({
                businessId,
                terminalId: requestedTerminal,
                action: "auto_reroute_paused_terminal",
                severity: "warning",
                message: `Rerouted print job from paused terminal ${requestedTerminal} to ${routing.targetTerminal}`,
                metadata: JSON.stringify({ requestedTerminal, targetTerminal: routing.targetTerminal, jobType }),
                actorUserId: userId,
                actorRole: role,
            }).catch(() => {});
        }
        return NextResponse.json({ success: true, jobId: created.$id });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to queue print job";
        const status = msg.includes("FORBIDDEN") ? 403 : msg.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

