import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { settleSelectedOrders, type PaymentSplitInput } from "@/lib/actions/pos.actions";

function collectionId(): string | undefined {
    return process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
}

function idempotencyCollectionId(): string | undefined {
    return process.env.PAYMENT_IDEMPOTENCY_COLLECTION_ID;
}

async function updateJobSafe(
    jobsCollectionId: string,
    jobId: string,
    patch: Record<string, unknown>
) {
    try {
        return await databases.updateDocument(DATABASE_ID!, jobsCollectionId, jobId, patch);
    } catch (err: any) {
        const msg = String(err?.message || "");
        if (!msg.includes("Unknown attribute") && !msg.includes("document_invalid_structure")) {
            throw err;
        }
        const { errorMessage: _ignoredErrorMessage, ...fallback } = patch;
        return await databases.updateDocument(DATABASE_ID!, jobsCollectionId, jobId, fallback);
    }
}

function workerToken(): string | undefined {
    return process.env.SETTLEMENT_WORKER_TOKEN;
}

function maxAttempts(): number {
    const raw = Number(process.env.SETTLEMENT_JOB_MAX_ATTEMPTS || 4);
    return Math.max(1, Math.min(12, Number.isFinite(raw) ? raw : 4));
}

function retryBaseSeconds(): number {
    const raw = Number(process.env.SETTLEMENT_RETRY_BASE_SECONDS || 10);
    return Math.max(1, Math.min(300, Number.isFinite(raw) ? raw : 10));
}

function parseJsonArray<T>(raw: unknown): T[] {
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw !== "string" || raw.trim() === "") return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

export async function POST(request: NextRequest) {
    const expected = workerToken();
    const incoming = request.headers.get("x-worker-token");
    if (!expected || !incoming || incoming !== expected) {
        return NextResponse.json({ error: "Unauthorized worker token" }, { status: 401 });
    }

    const coll = collectionId();
    if (!DATABASE_ID || !coll) {
        return NextResponse.json(
            { error: "Settlement jobs collection is not configured." },
            { status: 503 }
        );
    }

    const body = await request.json().catch(() => ({}));
    const maxJobs = Math.max(1, Math.min(5, Number(body?.maxJobs) || 1));

    try {
        const maxRetryAttempts = maxAttempts();
        const baseRetrySeconds = retryBaseSeconds();
        const pending = await databases.listDocuments(DATABASE_ID, coll, [
            Query.equal("status", "pending"),
            Query.orderAsc("$createdAt"),
            Query.limit(maxJobs),
        ]);

        let processedCount = 0;
        let retriedCount = 0;
        let deadLetterCount = 0;
        const nowMs = Date.now();
        for (const job of pending.documents as any[]) {
            const nextEligibleIso = String(job.startedAt || "").trim();
            if (nextEligibleIso) {
                const nextEligibleMs = new Date(nextEligibleIso).getTime();
                if (Number.isFinite(nextEligibleMs) && nextEligibleMs > nowMs) {
                    continue;
                }
            }
            const attemptCount = Math.max(0, Number(job.attemptCount) || 0) + 1;
            await updateJobSafe(coll, job.$id, {
                status: "processing",
                startedAt: new Date().toISOString(),
                attemptCount,
            });

            try {
                const orderIds = parseJsonArray<string>(job.orderIdsJson);
                const paymentSplits = parseJsonArray<PaymentSplitInput>(job.paymentSplitsJson);
                const paymentMethod = String(job.paymentMethod || paymentSplits[0]?.method || "cash");
                const paymentReference =
                    typeof job.paymentReference === "string" ? job.paymentReference : undefined;
                const terminalId =
                    typeof job.terminalId === "string" ? job.terminalId : undefined;

                const result = await settleSelectedOrders({
                    orderIds,
                    paymentSplits,
                    paymentMethod,
                    paymentReference,
                    terminalId,
                    authContextOverride: {
                        businessId: String(job.businessId || ""),
                        userId: String(job.createdBy || "settlement-worker"),
                        role: "system",
                    },
                });

                await updateJobSafe(coll, job.$id, {
                    status: result.success ? "completed" : "failed",
                    completedAt: new Date().toISOString(),
                    resultJson: JSON.stringify(result).slice(0, 5000),
                    errorMessage: result.success ? "" : String(result.message || "Settlement failed"),
                });
                const idemColl = idempotencyCollectionId();
                if (idemColl) {
                    const existing = await databases.listDocuments(DATABASE_ID, idemColl, [
                        Query.equal("businessId", String(job.businessId || "")),
                        Query.equal("idempotencyKey", String(job.idempotencyKey || "")),
                        Query.limit(1),
                    ]);
                    const row = existing.documents[0] as any;
                    if (row?.$id) {
                        await databases.updateDocument(DATABASE_ID, idemColl, row.$id, {
                            status: result.success ? "processed" : "failed",
                            responseJson: JSON.stringify(result).slice(0, 5000),
                        });
                    }
                }
                processedCount += 1;
                console.info("[settlement.worker] processed", {
                    jobId: job.$id,
                    success: result.success,
                    paymentMethod,
                    orderCount: orderIds.length,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : "Worker settlement error";
                if (attemptCount < maxRetryAttempts) {
                    const backoffSeconds = Math.min(
                        900,
                        baseRetrySeconds * Math.pow(2, Math.max(0, attemptCount - 1))
                    );
                    const retryAtIso = new Date(Date.now() + backoffSeconds * 1000).toISOString();
                    await updateJobSafe(coll, job.$id, {
                        status: "pending",
                        startedAt: retryAtIso,
                        resultJson: JSON.stringify({
                            success: false,
                            message,
                            retryScheduledAt: retryAtIso,
                            attemptCount,
                        }).slice(0, 5000),
                        errorMessage: message.slice(0, 500),
                    });
                    retriedCount += 1;
                    console.warn("[settlement.worker] retry scheduled", {
                        jobId: job.$id,
                        attemptCount,
                        backoffSeconds,
                    });
                    continue;
                }

                await updateJobSafe(coll, job.$id, {
                    status: "dead_letter",
                    completedAt: new Date().toISOString(),
                    resultJson: JSON.stringify({
                        success: false,
                        message,
                        attemptCount,
                        deadLetter: true,
                    }).slice(0, 5000),
                    errorMessage: message.slice(0, 500),
                });
                deadLetterCount += 1;
                const idemColl = idempotencyCollectionId();
                if (idemColl) {
                    const existing = await databases.listDocuments(DATABASE_ID, idemColl, [
                        Query.equal("businessId", String(job.businessId || "")),
                        Query.equal("idempotencyKey", String(job.idempotencyKey || "")),
                        Query.limit(1),
                    ]);
                    const row = existing.documents[0] as any;
                    if (row?.$id) {
                        await databases.updateDocument(DATABASE_ID, idemColl, row.$id, {
                            status: "failed",
                            responseJson: JSON.stringify({ success: false, message }).slice(0, 5000),
                        });
                    }
                }
                console.error("[settlement.worker] failed", { jobId: job.$id, message });
            }
        }

        const pendingCountResult = await databases.listDocuments(DATABASE_ID, coll, [
            Query.equal("status", "pending"),
            Query.limit(1),
        ]);

        return NextResponse.json({
            success: true,
            processedCount,
            retriedCount,
            deadLetterCount,
            pendingCount: pendingCountResult.total ?? 0,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Settlement worker processing failed";
        console.error("[settlement.worker] fatal", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

