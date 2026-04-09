import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { requireOrgAdmin } from "@/lib/auth.utils";

function jobsCollectionId(): string | undefined {
    return process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
}

function buildRequestHash(value: string): string {
    return value.slice(0, 128);
}

function parseOrderIds(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map((x) => String(x || "")).filter(Boolean);
    if (typeof raw !== "string" || raw.trim() === "") return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((x) => String(x || "")).filter(Boolean) : [];
    } catch {
        return [];
    }
}

export async function GET(request: NextRequest) {
    try {
        const { businessId } = await requireOrgAdmin();
        const jobsColl = jobsCollectionId();
        if (!DATABASE_ID || !jobsColl) {
            return NextResponse.json({ error: "Settlement jobs collection not configured" }, { status: 503 });
        }
        const limitRaw = Number(request.nextUrl.searchParams.get("limit") || 50);
        const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));

        const rows = await databases.listDocuments(DATABASE_ID, jobsColl, [
            Query.equal("businessId", businessId),
            Query.equal("status", ["unresolved_callback", "unresolved_drift"]),
            Query.orderDesc("$createdAt"),
            Query.limit(limit),
        ]);
        const items = rows.documents.map((doc: any) => {
            let result: any = {};
            try {
                result = JSON.parse(String(doc.resultJson || "{}"));
            } catch {
                result = {};
            }
            return {
                jobId: doc.$id,
                status: String(doc.status || ""),
                reason: result?.reason || doc.errorMessage || "unknown",
                paymentReference: doc.paymentReference || "",
                createdAt: doc.createdAt || doc.$createdAt,
                orderIds: parseOrderIds(doc.orderIdsJson),
                sourceJobId: String(result?.sourceJobId || ""),
                callback: result?.callback || null,
            };
        });
        return NextResponse.json({ success: true, items, total: rows.total ?? items.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to list unresolved callbacks";
        const status = message.includes("FORBIDDEN") ? 403 : message.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { businessId, userId } = await requireOrgAdmin();
        const jobsColl = jobsCollectionId();
        if (!DATABASE_ID || !jobsColl) {
            return NextResponse.json({ error: "Settlement jobs collection not configured" }, { status: 503 });
        }
        const body = await request.json().catch(() => ({}));
        const action = String(body?.action || "").trim();
        const jobId = String(body?.jobId || "").trim();
        if (!jobId || !action) {
            return NextResponse.json({ error: "jobId and action are required" }, { status: 400 });
        }

        const job = (await databases.getDocument(DATABASE_ID, jobsColl, jobId)) as any;
        if (String(job.businessId || "") !== businessId) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        const status = String(job.status || "");
        if (status !== "unresolved_callback" && status !== "unresolved_drift") {
            return NextResponse.json({ error: "Job is not unresolved_callback/unresolved_drift" }, { status: 409 });
        }

        if (action === "ignore") {
            await databases.updateDocument(DATABASE_ID, jobsColl, jobId, {
                status: "ignored",
                completedAt: new Date().toISOString(),
                errorMessage: `ignored_by_admin:${userId}`.slice(0, 500),
            });
            return NextResponse.json({ success: true, action, jobId });
        }

        if (action === "queue_settlement") {
            const orderIds = Array.isArray(body?.orderIds)
                ? body.orderIds.map((x: unknown) => String(x)).filter(Boolean)
                : [];
            const amount = Number(body?.amount);
            const providerRef = String(body?.providerReference || job.paymentReference || "").trim();
            if (orderIds.length === 0 || !Number.isFinite(amount) || amount <= 0 || !providerRef) {
                return NextResponse.json(
                    {
                        error: "orderIds[], amount and providerReference are required for queue_settlement",
                    },
                    { status: 400 }
                );
            }

            const paymentReference = `JENGA-${providerRef}-${Date.now()}`.slice(0, 160);
            await databases.updateDocument(DATABASE_ID, jobsColl, jobId, {
                status: "pending",
                orderIdsJson: JSON.stringify(orderIds).slice(0, 5000),
                paymentSplitsJson: JSON.stringify([
                    {
                        method: "bank_paybill",
                        amount,
                        reference: paymentReference,
                        terminalId: "jenga-manual-requeue",
                    },
                ]).slice(0, 5000),
                paymentMethod: "bank_paybill",
                paymentReference,
                terminalId: "jenga-manual-requeue",
                requestHash: buildRequestHash(`${businessId}:${providerRef}:${amount}:${orderIds.join(",")}`),
                createdBy: userId,
                createdAt: new Date().toISOString(),
                startedAt: "",
                completedAt: "",
                resultJson: "",
                errorMessage: "",
                attemptCount: 0,
            });
            return NextResponse.json({ success: true, action, jobId });
        }

        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update unresolved callback";
        const status = message.includes("FORBIDDEN") ? 403 : message.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

