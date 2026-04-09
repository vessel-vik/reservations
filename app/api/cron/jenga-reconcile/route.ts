import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
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

function parseResultJson(raw: unknown): any {
    if (typeof raw !== "string" || raw.trim() === "") return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function toProviderReference(value: string): string {
    const v = String(value || "").trim();
    if (!v) return "";
    if (v.startsWith("JENGA-")) return v.slice("JENGA-".length);
    return v;
}

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const jobsColl = jobsCollectionId();
        if (!DATABASE_ID || !jobsColl || !ORDERS_COLLECTION_ID) {
            return NextResponse.json({ error: "Jenga reconcile is not configured" }, { status: 503 });
        }

        const businessId = callbackBusinessId();
        if (!businessId) {
            return NextResponse.json({ error: "Missing JENGA_CALLBACK_BUSINESS_ID" }, { status: 503 });
        }

        const body = await request.json().catch(() => ({}));
        const limitRaw = Number(body?.limit || 20);
        const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));

        const unresolved = await databases.listDocuments(DATABASE_ID, jobsColl, [
            Query.equal("businessId", businessId),
            Query.equal("status", "unresolved_callback"),
            Query.orderAsc("$createdAt"),
            Query.limit(limit),
        ]);

        let checked = 0;
        let resolved = 0;
        let stillPending = 0;
        let failed = 0;
        let noReference = 0;
        let unresolvedAmount = 0;

        for (const job of unresolved.documents as any[]) {
            const payload = parseResultJson(job.resultJson);
            const callback = payload?.callback || {};
            const providerRef = toProviderReference(
                String(callback?.providerReference || job.paymentReference || "")
            );
            const orderReference = String(callback?.orderReference || "").trim();
            const callbackAmount = Number(callback?.amount || 0);
            if (!providerRef) {
                noReference += 1;
                continue;
            }

            checked += 1;
            try {
                const provider = await queryJengaTransactionDetails(providerRef);
                const mapped = jengaStateToInternalStatus({
                    transactionStatus: provider?.data?.state,
                    stateCode: typeof provider?.data?.stateCode === "number" ? provider.data.stateCode : undefined,
                });

                if (mapped === "failed") {
                    failed += 1;
                    await databases.updateDocument(DATABASE_ID, jobsColl, job.$id, {
                        status: "ignored",
                        completedAt: new Date().toISOString(),
                        errorMessage: "provider_failed",
                        resultJson: JSON.stringify({
                            ...payload,
                            reconcile: { checkedAt: new Date().toISOString(), mapped, provider },
                        }).slice(0, 5000),
                    });
                    continue;
                }

                if (mapped !== "confirmed") {
                    stillPending += 1;
                    await databases.updateDocument(DATABASE_ID, jobsColl, job.$id, {
                        attemptCount: (Number(job.attemptCount) || 0) + 1,
                        resultJson: JSON.stringify({
                            ...payload,
                            reconcile: { checkedAt: new Date().toISOString(), mapped, provider },
                        }).slice(0, 5000),
                    });
                    continue;
                }

                if (!orderReference || callbackAmount <= 0) {
                    unresolvedAmount += 1;
                    await databases.updateDocument(DATABASE_ID, jobsColl, job.$id, {
                        attemptCount: (Number(job.attemptCount) || 0) + 1,
                        errorMessage: "confirmed_but_missing_order_or_amount",
                        resultJson: JSON.stringify({
                            ...payload,
                            reconcile: { checkedAt: new Date().toISOString(), mapped, provider },
                        }).slice(0, 5000),
                    });
                    continue;
                }

                const matchedOrders = await databases.listDocuments(DATABASE_ID, ORDERS_COLLECTION_ID, [
                    Query.equal("businessId", businessId),
                    Query.equal("paymentStatus", "unpaid"),
                    Query.equal("orderNumber", orderReference),
                    Query.limit(20),
                ]);
                const orders = (matchedOrders.documents || []) as any[];
                if (orders.length === 0) {
                    unresolvedAmount += 1;
                    await databases.updateDocument(DATABASE_ID, jobsColl, job.$id, {
                        attemptCount: (Number(job.attemptCount) || 0) + 1,
                        errorMessage: "confirmed_but_order_not_found",
                        resultJson: JSON.stringify({
                            ...payload,
                            reconcile: { checkedAt: new Date().toISOString(), mapped, provider },
                        }).slice(0, 5000),
                    });
                    continue;
                }

                const due = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
                if (Math.abs(due - callbackAmount) > 0.5) {
                    unresolvedAmount += 1;
                    await databases.updateDocument(DATABASE_ID, jobsColl, job.$id, {
                        attemptCount: (Number(job.attemptCount) || 0) + 1,
                        errorMessage: "confirmed_but_amount_mismatch",
                        resultJson: JSON.stringify({
                            ...payload,
                            reconcile: { checkedAt: new Date().toISOString(), mapped, provider, due, callbackAmount },
                        }).slice(0, 5000),
                    });
                    continue;
                }

                const paymentReference = `JENGA-${providerRef}-${Date.now()}`.slice(0, 160);
                await databases.updateDocument(DATABASE_ID, jobsColl, job.$id, {
                    status: "pending",
                    orderIdsJson: JSON.stringify(orders.map((o) => String(o.$id))).slice(0, 5000),
                    paymentSplitsJson: JSON.stringify([
                        {
                            method: "bank_paybill",
                            amount: callbackAmount,
                            reference: paymentReference,
                            terminalId: "jenga-reconcile-cron",
                        },
                    ]).slice(0, 5000),
                    paymentMethod: "bank_paybill",
                    paymentReference,
                    terminalId: "jenga-reconcile-cron",
                    requestHash: String(`${businessId}:${providerRef}:${callbackAmount}:${orderReference}`).slice(
                        0,
                        128
                    ),
                    createdBy: "jenga-reconcile-cron",
                    createdAt: new Date().toISOString(),
                    startedAt: "",
                    completedAt: "",
                    errorMessage: "",
                    resultJson: JSON.stringify({
                        ...payload,
                        reconcile: { checkedAt: new Date().toISOString(), mapped, provider, autoQueued: true },
                    }).slice(0, 5000),
                    attemptCount: 0,
                });
                resolved += 1;
            } catch (err) {
                stillPending += 1;
                await databases.updateDocument(DATABASE_ID, jobsColl, job.$id, {
                    attemptCount: (Number(job.attemptCount) || 0) + 1,
                    errorMessage: String(err instanceof Error ? err.message : "reconcile_failed").slice(0, 500),
                });
            }
        }

        return NextResponse.json({
            success: true,
            checked,
            resolved,
            stillPending,
            failed,
            noReference,
            unresolvedAmount,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Jenga reconciliation failed";
        console.error("[jenga.reconcile.cron] failed", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

