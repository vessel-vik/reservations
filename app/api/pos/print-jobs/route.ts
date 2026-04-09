import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from "@/lib/appwrite.config";
import { requireOrgAdmin } from "@/lib/auth.utils";
import { printCategoryFromJobType, recordPrintAudit } from "@/lib/print-audit";
import { normalizeRequeueReason } from "@/lib/print-requeue-reason";
import { recordPrintOpsIncident, resolveTerminalRouting } from "@/lib/print-terminal-controls";

type Category = "docket" | "update" | "anomaly" | "receipt";

function collectionId(): string | undefined {
    return process.env.PRINT_JOBS_COLLECTION_ID || process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
}

function categoryToJobTypes(category: Category): string[] {
    switch (category) {
        case "docket":
            return ["captain_docket", "docket", "kitchen_docket"];
        case "update":
            return ["kitchen_delta"];
        case "anomaly":
            return ["anomaly_adjustment"];
        case "receipt":
            return ["receipt"];
    }
}

function parseJobContent(jobType: string, content: string): { orderId?: string; summary?: string } {
    const raw = String(content || "");
    try {
        const parsed = JSON.parse(raw) as { orderId?: string; deltaItems?: unknown[]; adjustments?: unknown[] };
        if (parsed.orderId) {
            if (jobType === "kitchen_delta") {
                const itemCount = Array.isArray(parsed.deltaItems) ? parsed.deltaItems.length : 0;
                return {
                    orderId: parsed.orderId,
                    summary: itemCount > 0 ? `${itemCount} added line(s)` : "Added items",
                };
            }
            if (jobType === "anomaly_adjustment") {
                const removed = Array.isArray(parsed.adjustments) ? parsed.adjustments.length : 0;
                return {
                    orderId: parsed.orderId,
                    summary: removed > 0 ? `${removed} item(s) reduced` : "Anomaly adjustment",
                };
            }
            return { orderId: parsed.orderId, summary: `Order ${parsed.orderId}` };
        }
    } catch {
        // Keep legacy parser below.
    }
    if (jobType === "receipt" || jobType === "docket" || jobType === "captain_docket" || jobType === "kitchen_docket") {
        const id = raw.match(/orderId:([\w-]+)/)?.[1] || raw.trim();
        return { orderId: id, summary: id ? `Order ${id}` : undefined };
    }
    if (jobType === "kitchen_delta") {
        try {
            const parsed = JSON.parse(raw) as {
                orderId?: string;
                deltaItems?: { name?: string; quantity?: number }[];
            };
            const itemCount = Array.isArray(parsed.deltaItems) ? parsed.deltaItems.length : 0;
            return {
                orderId: parsed.orderId,
                summary: itemCount > 0 ? `${itemCount} added line(s)` : "Added items",
            };
        } catch {
            return {};
        }
    }
    if (jobType === "anomaly_adjustment") {
        try {
            const parsed = JSON.parse(raw) as {
                orderId?: string;
                adjustments?: { name?: string; quantity?: number }[];
            };
            const removed = Array.isArray(parsed.adjustments)
                ? parsed.adjustments.reduce((s, x) => s + Math.max(1, Number(x.quantity) || 1), 0)
                : 0;
            return {
                orderId: parsed.orderId,
                summary: removed > 0 ? `${removed} item(s) reduced` : "Anomaly adjustment",
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

async function countForCategory(coll: string, businessId: string, category: Category): Promise<number> {
    const r = await databases.listDocuments(DATABASE_ID!, coll, [
        Query.equal("businessId", businessId),
        Query.equal("jobType", categoryToJobTypes(category)),
        Query.equal("status", ["pending_approval", "pending", "printing"]),
        Query.limit(1),
    ]);
    return r.total ?? 0;
}

export async function GET(request: NextRequest) {
    try {
        const coll = collectionId();
        if (!coll || !DATABASE_ID) {
            return NextResponse.json({ error: "Print jobs not configured" }, { status: 503 });
        }
        const { businessId } = await requireOrgAdmin();
        const rawCategory = request.nextUrl.searchParams.get("category");
        const category: Category | null =
            rawCategory === "docket" ||
            rawCategory === "update" ||
            rawCategory === "anomaly" ||
            rawCategory === "receipt"
                ? rawCategory
                : null;
        const status = request.nextUrl.searchParams.get("status");
        const waiterName = String(request.nextUrl.searchParams.get("waiterName") || "").trim();
        const waiterId = String(request.nextUrl.searchParams.get("waiterId") || "").trim();
        const terminalId = String(request.nextUrl.searchParams.get("terminalId") || "").trim();
        const orderId = String(request.nextUrl.searchParams.get("orderId") || "").trim();
        const cursor = String(request.nextUrl.searchParams.get("cursor") || "").trim();
        const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 80);
        const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 80));

        const queries = [Query.equal("businessId", businessId), Query.orderDesc("$createdAt"), Query.limit(limit)];
        if (category) queries.push(Query.equal("jobType", categoryToJobTypes(category)));
        if (status) queries.push(Query.equal("status", status));
        if (orderId) queries.push(Query.equal("orderId", orderId));
        if (waiterId) queries.push(Query.equal("waiterId", waiterId));
        if (terminalId) queries.push(Query.equal("targetTerminal", terminalId));
        if (cursor) queries.push(Query.cursorAfter(cursor));

        let result = await databases.listDocuments(DATABASE_ID, coll, queries).catch(() => null);
        if (!result) {
            // Backward compatibility for old schemas without `orderId` field support.
            const fallbackQueries = [Query.equal("businessId", businessId), Query.orderDesc("$createdAt"), Query.limit(limit)];
            if (category) fallbackQueries.push(Query.equal("jobType", categoryToJobTypes(category)));
            if (status) fallbackQueries.push(Query.equal("status", status));
            if (cursor) fallbackQueries.push(Query.cursorAfter(cursor));
            result = await databases.listDocuments(DATABASE_ID, coll, fallbackQueries);
        }

        let jobs = result.documents.map((doc: any) => {
            const { orderId, summary } = parseJobContent(String(doc.jobType || ""), String(doc.content || ""));
            return {
                ...doc,
                orderId,
                summary,
            };
        });
        if (orderId) {
            jobs = jobs.filter((j: any) => String(j.orderId || "") === orderId);
        }
        if (waiterId) {
            jobs = jobs.filter((j: any) => String(j.waiterId || "") === waiterId);
        }
        if (terminalId) {
            jobs = jobs.filter((j: any) => String(j.targetTerminal || "") === terminalId);
        }

        // Enrich with waiter/table/payment context for accurate admin review.
        const ids = Array.from(new Set(jobs.map((j: any) => String(j.orderId || "")).filter(Boolean)));
        const orderMap = new Map<string, any>();
        await Promise.all(
            ids.slice(0, 80).map(async (id) => {
                try {
                    const d = await databases.getDocument(DATABASE_ID!, ORDERS_COLLECTION_ID!, id);
                    if (String((d as any).businessId || "") === businessId) {
                        orderMap.set(id, d);
                    }
                } catch {
                    // Ignore missing / deleted records.
                }
            })
        );

        let enriched = jobs.map((j: any) => {
            const o = j.orderId ? orderMap.get(j.orderId) : null;
            return {
                ...j,
                waiterName: j.waiterNameSnapshot || o?.waiterName || null,
                waiterId: j.waiterId || o?.waiterId || null,
                tableNumber: o?.tableNumber ?? null,
                customerName: o?.customerName || null,
                orderNumber: o?.orderNumber || null,
                paymentStatus: o?.paymentStatus || null,
            };
        });
        if (waiterName) {
            const waiterNeedle = waiterName.toLowerCase();
            enriched = enriched.filter((j: any) => String(j.waiterName || "").toLowerCase() === waiterNeedle);
        }

        const [docket, update, anomaly, receipt] = await Promise.all([
            countForCategory(coll, businessId, "docket"),
            countForCategory(coll, businessId, "update"),
            countForCategory(coll, businessId, "anomaly"),
            countForCategory(coll, businessId, "receipt"),
        ]);

        return NextResponse.json({
            jobs: enriched,
            counts: { docket, update, anomaly, receipt },
            nextCursor:
                result.documents.length === limit
                    ? String(result.documents[result.documents.length - 1]?.$id || "")
                    : "",
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to list print jobs";
        const status = msg.includes("FORBIDDEN") ? 403 : msg.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const coll = collectionId();
        if (!coll || !DATABASE_ID) {
            return NextResponse.json({ error: "Print jobs not configured" }, { status: 503 });
        }
        const { businessId, userId, role } = await requireOrgAdmin();
        const body = await request.json();
        const jobType = String(body?.jobType || "").trim();
        const content = String(body?.content || "").trim();
        const requestedTerminal = String(body?.targetTerminal || "default");
        const dedupeKey = String(body?.dedupeKey || "").trim().slice(0, 120);
        const requeueReason = normalizeRequeueReason(body?.requeueReason, "admin_manual_requeue");
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

        const parsed = parseJobContent(jobType, content);
        if (!parsed.orderId) {
            return NextResponse.json({ error: "orderId is required in print job payload." }, { status: 400 });
        }
        const waiter = await resolveOrderWaiterContext(businessId, parsed.orderId);
        const routing = await resolveTerminalRouting({
            businessId,
            requestedTerminal,
        });
        const nowIso = new Date().toISOString();
        const payload = {
            status: "pending",
            jobType,
            category: printCategoryFromJobType(jobType),
            content,
            orderId: parsed.orderId || "",
            timestamp: nowIso,
            queuedAt: nowIso,
            printedAt: "",
            attemptCount: 0,
            waiterId: waiter.waiterId,
            waiterNameSnapshot: waiter.waiterName,
            targetTerminal: routing.targetTerminal,
            dedupeKey,
            requeueReason,
            createdByUserId: String(userId || "").slice(0, 64),
            createdByRole: String(role || "").slice(0, 40),
            businessId,
        };
        let created: any;
        try {
            created = await databases.createDocument(DATABASE_ID, coll, ID.unique(), payload);
        } catch {
            // Backward compatibility for schemas without new optional fields.
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
        await recordPrintAudit({
            businessId,
            printJobId: created.$id,
            jobType,
            status: "queued",
            orderId: parsed.orderId,
            summary: parsed.summary || `Queued ${jobType}`,
            content,
            dedupeKey,
            actorUserId: userId,
            actorRole: role,
            waiterId: waiter.waiterId,
            terminalId: routing.targetTerminal,
            requeueReason,
        });
        if (routing.redirected) {
            await recordPrintOpsIncident({
                businessId,
                terminalId: requestedTerminal,
                action: "admin_reroute_paused_terminal",
                severity: "warning",
                message: `Admin requeue rerouted from paused terminal ${requestedTerminal} to ${routing.targetTerminal}`,
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

