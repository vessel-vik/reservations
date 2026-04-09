import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from "@/lib/appwrite.config";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";

const PAYMENT_LEDGER_COLLECTION_ID = process.env.PAYMENT_LEDGER_COLLECTION_ID;
const PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID = process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
const PRINT_JOBS_COLLECTION_ID =
    process.env.PRINT_JOBS_COLLECTION_ID || process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;

type TimelineEventType =
    | "callback_received"
    | "reconcile_checked"
    | "settled"
    | "receipt_generated";

type TimelineEvent = {
    at: string;
    type: TimelineEventType;
    title: string;
    detail: string;
    sourceId?: string;
};

function asJson(raw: unknown): Record<string, unknown> | null {
    if (!raw) return null;
    if (typeof raw === "object") return raw as Record<string, unknown>;
    if (typeof raw !== "string" || raw.trim() === "") return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function listOrderIdsFromJob(doc: any): string[] {
    const raw = doc?.orderIdsJson;
    if (Array.isArray(raw)) return raw.map((x) => String(x || "")).filter(Boolean);
    if (typeof raw !== "string" || raw.trim() === "") return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((x) => String(x || "")).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function safeIso(value: unknown, fallback: string): string {
    const v = String(value || "").trim();
    if (!v) return fallback;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? v : fallback;
}

export async function GET(request: NextRequest) {
    try {
        const { businessId, role, userId } = await getAuthContext();
        validateBusinessContext(businessId);
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }

        const orderId = String(request.nextUrl.searchParams.get("orderId") || "").trim();
        if (!orderId) {
            return NextResponse.json({ error: "orderId is required" }, { status: 400 });
        }

        const order = await databases.getDocument(DATABASE_ID, ORDERS_COLLECTION_ID, orderId).catch(() => null);
        if (!order || String((order as any).businessId || "") !== businessId) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }
        if (role === "org:member" && String((order as any).waiterId || "") !== String(userId || "")) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const orderNumber = String((order as any).orderNumber || "");
        const events: TimelineEvent[] = [];

        // 1) Settlement jobs (callback + reconcile style events).
        if (PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID) {
            const jobsRes = await databases
                .listDocuments(DATABASE_ID, PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID, [
                    Query.equal("businessId", businessId),
                    Query.equal("paymentMethod", "bank_paybill"),
                    Query.orderDesc("$createdAt"),
                    Query.limit(300),
                ])
                .catch(() => null);

            for (const doc of (jobsRes?.documents || []) as any[]) {
                const orderIds = listOrderIdsFromJob(doc);
                const result = asJson(doc.resultJson);
                const callback = asJson(result?.callback);
                const callbackOrderRef = String(callback?.orderReference || "").trim();
                const matchesOrder =
                    orderIds.includes(orderId) ||
                    (callbackOrderRef !== "" && callbackOrderRef === orderNumber);
                if (!matchesOrder) continue;

                const createdAt = safeIso(doc.createdAt || doc.$createdAt, String(doc.$createdAt || ""));
                const providerRef = String(doc.paymentReference || callback?.providerReference || "").trim();
                const unresolved = String(doc.status || "") === "unresolved_callback";
                if (String(doc.createdBy || "") === "jenga-callback" || unresolved) {
                    events.push({
                        at: createdAt,
                        type: "callback_received",
                        title: "Callback received",
                        detail: providerRef ? `Provider ref ${providerRef}` : "Provider callback ingested",
                        sourceId: String(doc.$id || ""),
                    });
                }

                const attempts = Number(doc.attemptCount) || 0;
                const startedAt = safeIso(doc.startedAt, createdAt);
                if (attempts > 0 || unresolved) {
                    events.push({
                        at: startedAt,
                        type: "reconcile_checked",
                        title: "Reconcile checked",
                        detail: unresolved
                            ? `Unresolved callback (attempt ${attempts})`
                            : `Settlement attempt ${attempts}`,
                        sourceId: String(doc.$id || ""),
                    });
                }
            }
        }

        // 2) Settled event from payment ledger.
        if (PAYMENT_LEDGER_COLLECTION_ID) {
            const ledgerRes = await databases
                .listDocuments(DATABASE_ID, PAYMENT_LEDGER_COLLECTION_ID, [
                    Query.equal("businessId", businessId),
                    Query.equal("orderId", orderId),
                    Query.equal("status", "confirmed"),
                    Query.orderAsc("settledAt"),
                    Query.limit(100),
                ])
                .catch(() => null);
            for (const doc of (ledgerRes?.documents || []) as any[]) {
                const at = safeIso(doc.settledAt || doc.$createdAt, String(doc.$createdAt || ""));
                const amount = Number(doc.amount) || 0;
                const ref = String(doc.reference || "").trim();
                events.push({
                    at,
                    type: "settled",
                    title: "Payment settled",
                    detail: `Confirmed ${amount.toFixed(2)}${ref ? ` · ${ref}` : ""}`,
                    sourceId: String(doc.$id || ""),
                });
            }
        }

        // 3) Receipt generation from print jobs.
        if (PRINT_JOBS_COLLECTION_ID) {
            const printRes = await databases
                .listDocuments(DATABASE_ID, PRINT_JOBS_COLLECTION_ID, [
                    Query.equal("businessId", businessId),
                    Query.equal("orderId", orderId),
                    Query.equal("category", "receipt"),
                    Query.equal("status", "completed"),
                    Query.orderAsc("$createdAt"),
                    Query.limit(50),
                ])
                .catch(() => null);
            for (const doc of (printRes?.documents || []) as any[]) {
                events.push({
                    at: safeIso(doc.printedAt || doc.$updatedAt, String(doc.$updatedAt || doc.$createdAt || "")),
                    type: "receipt_generated",
                    title: "Receipt generated",
                    detail: `Print job ${String(doc.jobType || "receipt")} completed`,
                    sourceId: String(doc.$id || ""),
                });
            }
        }

        events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

        return NextResponse.json({
            order: {
                $id: (order as any).$id,
                orderNumber: (order as any).orderNumber,
                tableNumber: (order as any).tableNumber,
                customerName: (order as any).customerName,
                paymentStatus: (order as any).paymentStatus,
            },
            events,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load payment timeline";
        const status = message.includes("FORBIDDEN") ? 403 : message.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

