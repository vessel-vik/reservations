import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from "@/lib/appwrite.config";
import { jengaStateToInternalStatus, queryJengaTransactionDetails } from "@/lib/jenga-client";

function jobsCollectionId(): string | undefined {
    return process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
}

function callbackBusinessId(): string {
    return String(process.env.JENGA_CALLBACK_BUSINESS_ID || "").trim();
}

function authorized(request: NextRequest): boolean {
    const token = request.headers.get("x-worker-token") || request.headers.get("x-cron-token");
    const expected = process.env.SETTLEMENT_WORKER_TOKEN;
    return Boolean(expected && token && token === expected);
}

function parseJson(raw: unknown): any {
    if (typeof raw !== "string" || raw.trim() === "") return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
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

function normalizeProviderReference(ref: string): string {
    const value = String(ref || "").trim();
    if (!value) return "";
    if (value.startsWith("JENGA-")) {
        const parts = value.split("-");
        return String(parts[1] || "").trim();
    }
    return value;
}

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const jobsColl = jobsCollectionId();
        if (!DATABASE_ID || !jobsColl || !ORDERS_COLLECTION_ID) {
            return NextResponse.json({ error: "Jenga drift cron is not configured" }, { status: 503 });
        }
        const businessId = callbackBusinessId();
        if (!businessId) {
            return NextResponse.json({ error: "Missing JENGA_CALLBACK_BUSINESS_ID" }, { status: 503 });
        }

        const body = await request.json().catch(() => ({}));
        const limitRaw = Number(body?.limit || 20);
        const limit = Math.max(1, Math.min(80, Number.isFinite(limitRaw) ? limitRaw : 20));
        const slaMinutesRaw = Number(body?.slaMinutes || process.env.JENGA_DRIFT_SLA_MINUTES || 5);
        const slaMinutes = Math.max(1, Math.min(120, Number.isFinite(slaMinutesRaw) ? slaMinutesRaw : 5));
        const thresholdMs = Date.now() - slaMinutes * 60_000;

        const candidates = await databases.listDocuments(DATABASE_ID, jobsColl, [
            Query.equal("businessId", businessId),
            Query.equal("paymentMethod", "bank_paybill"),
            Query.equal("status", ["pending", "processing", "failed", "dead_letter", "unresolved_callback"]),
            Query.orderAsc("$createdAt"),
            Query.limit(limit),
        ]);

        let checked = 0;
        let providerConfirmed = 0;
        let driftCreated = 0;
        let alreadyTracked = 0;
        let skippedTooFresh = 0;
        let skippedNoRef = 0;
        let skippedNoUnpaid = 0;

        for (const job of candidates.documents as any[]) {
            const createdMs = new Date(String(job.createdAt || job.$createdAt || "")).getTime();
            if (!Number.isFinite(createdMs) || createdMs > thresholdMs) {
                skippedTooFresh += 1;
                continue;
            }

            const payload = parseJson(job.resultJson);
            const callback = payload?.callback || {};
            const providerRef = normalizeProviderReference(
                String(
                    callback?.providerReference ||
                        job.paymentReference ||
                        ""
                )
            );
            if (!providerRef) {
                skippedNoRef += 1;
                continue;
            }

            checked += 1;
            const provider = await queryJengaTransactionDetails(providerRef).catch(() => null);
            const mapped = provider
                ? jengaStateToInternalStatus({
                      transactionStatus: provider?.data?.state,
                      stateCode:
                          typeof provider?.data?.stateCode === "number"
                              ? provider.data.stateCode
                              : undefined,
                  })
                : "pending";
            if (mapped !== "confirmed") {
                continue;
            }
            providerConfirmed += 1;

            let orderIds = parseOrderIds(job.orderIdsJson);
            if (orderIds.length === 0) {
                const orderRef = String(callback?.orderReference || "").trim();
                if (orderRef) {
                    const byRef = await databases.listDocuments(DATABASE_ID, ORDERS_COLLECTION_ID, [
                        Query.equal("businessId", businessId),
                        Query.equal("orderNumber", orderRef),
                        Query.limit(20),
                    ]);
                    orderIds = byRef.documents.map((d: any) => String(d.$id || "")).filter(Boolean);
                }
            }
            if (orderIds.length === 0) {
                skippedNoUnpaid += 1;
                continue;
            }

            const unpaid = await databases.listDocuments(DATABASE_ID, ORDERS_COLLECTION_ID, [
                Query.equal("businessId", businessId),
                Query.equal("paymentStatus", "unpaid"),
                Query.equal("$id", orderIds),
                Query.limit(100),
            ]);
            if ((unpaid.total || 0) === 0) {
                skippedNoUnpaid += 1;
                continue;
            }

            const driftKey = `jenga-drift:${businessId}:${providerRef}:${String(job.$id || "")}`.slice(0, 160);
            const existing = await databases.listDocuments(DATABASE_ID, jobsColl, [
                Query.equal("businessId", businessId),
                Query.equal("idempotencyKey", driftKey),
                Query.limit(1),
            ]);
            if (existing.documents[0]?.$id) {
                alreadyTracked += 1;
                continue;
            }

            const nowIso = new Date().toISOString();
            await databases.createDocument(DATABASE_ID, jobsColl, ID.unique(), {
                businessId,
                status: "unresolved_drift",
                orderIdsJson: JSON.stringify(orderIds).slice(0, 5000),
                paymentSplitsJson: "[]",
                paymentMethod: "bank_paybill",
                paymentReference: String(job.paymentReference || `JENGA-${providerRef}`).slice(0, 160),
                terminalId: "jenga-drift-cron",
                idempotencyKey: driftKey,
                requestHash: String(`${businessId}:${providerRef}:${job.$id || ""}`).slice(0, 128),
                createdBy: "jenga-drift-cron",
                createdAt: nowIso,
                startedAt: "",
                completedAt: nowIso,
                resultJson: JSON.stringify({
                    unresolved: true,
                    reason: "provider_confirmed_order_unsettled",
                    sourceJobId: String(job.$id || ""),
                    callback: {
                        providerReference: providerRef,
                        orderReference: String(callback?.orderReference || ""),
                        amount: Number(callback?.amount || provider?.data?.amount || 0),
                        currency: "KES",
                    },
                    provider,
                    unpaidOrderIds: orderIds,
                }).slice(0, 5000),
                errorMessage: "provider_confirmed_order_unsettled".slice(0, 500),
                attemptCount: 0,
            });
            driftCreated += 1;
        }

        const unresolvedRows = await databases.listDocuments(DATABASE_ID, jobsColl, [
            Query.equal("businessId", businessId),
            Query.equal("status", ["unresolved_callback", "unresolved_drift"]),
            Query.limit(500),
        ]);
        const unresolvedDriftRows = await databases.listDocuments(DATABASE_ID, jobsColl, [
            Query.equal("businessId", businessId),
            Query.equal("status", "unresolved_drift"),
            Query.limit(500),
        ]);
        const now = Date.now();
        const unresolvedOverSlaCount = (unresolvedRows.documents as any[]).reduce((acc, doc) => {
            const t = new Date(String(doc.createdAt || doc.$createdAt || "")).getTime();
            if (!Number.isFinite(t)) return acc;
            return now - t > slaMinutes * 60_000 ? acc + 1 : acc;
        }, 0);

        return NextResponse.json({
            success: true,
            checked,
            providerConfirmed,
            driftCreated,
            alreadyTracked,
            skippedTooFresh,
            skippedNoRef,
            skippedNoUnpaid,
            slaMinutes,
            unresolvedDriftCount: unresolvedDriftRows.total ?? unresolvedDriftRows.documents.length,
            unresolvedOverSlaCount,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Jenga drift detection failed";
        console.error("[jenga.drift.cron] failed", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

