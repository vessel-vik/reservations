import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";
import { settleSelectedOrders, type PaymentSplitInput } from "@/lib/actions/pos.actions";
import { isBankPaybillCanaryEnabled } from "@/lib/payment-rollout-gates";

function jobsCollectionId(): string | undefined {
    return process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
}

function idempotencyCollectionId(): string | undefined {
    return process.env.PAYMENT_IDEMPOTENCY_COLLECTION_ID;
}

function idempotencyTtlHours(): number {
    const raw = Number(process.env.PAYMENT_IDEMPOTENCY_TTL_HOURS || 168);
    return Math.max(1, Math.min(24 * 30, Number.isFinite(raw) ? raw : 168));
}

function expiryIsoFromNow(hours: number): string {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function canonicalHash(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function deriveIdempotencyKey(
    provided: string | null,
    businessId: string,
    requestHash: string
): string {
    if (provided && provided.trim() !== "") return provided.trim().slice(0, 120);
    return `auto:${businessId}:${requestHash.slice(0, 32)}`;
}

export async function POST(request: NextRequest) {
    try {
        const { businessId, userId } = await getAuthContext();
        validateBusinessContext(businessId);

        const payload = await request.json();
        const orderIds = Array.isArray(payload?.orderIds) ? payload.orderIds : [];
        const paymentSplits = Array.isArray(payload?.paymentSplits)
            ? (payload.paymentSplits as PaymentSplitInput[])
            : [];
        const paymentMethod = String(payload?.paymentMethod || paymentSplits[0]?.method || "cash");
        const paymentReference =
            typeof payload?.paymentReference === "string" ? payload.paymentReference : undefined;
        const terminalId = typeof payload?.terminalId === "string" ? payload.terminalId : undefined;
        const includesBankPaybill =
            paymentMethod === "bank_paybill" ||
            paymentSplits.some((row) => String(row?.method || "").toLowerCase() === "bank_paybill");

        if (orderIds.length === 0) {
            return NextResponse.json({ error: "orderIds is required" }, { status: 400 });
        }
        if (includesBankPaybill) {
            const gate = isBankPaybillCanaryEnabled({ businessId, terminalId });
            if (!gate.allowed) {
                return NextResponse.json(
                    {
                        error:
                            "Bank Paybill is not enabled for this device/business yet. Please use other methods or contact admin.",
                        code: gate.reason || "bank_paybill_rollout_blocked",
                    },
                    { status: 403 }
                );
            }
        }

        const requestBodyForHash = {
            orderIds: [...orderIds].sort(),
            paymentMethod,
            paymentReference: paymentReference || "",
            paymentSplits: paymentSplits.map((s) => ({
                method: String(s.method || "").toLowerCase(),
                amount: Number(s.amount) || 0,
                reference: String(s.reference || ""),
                terminalId: String(s.terminalId || terminalId || ""),
            })),
        };
        const requestHash = canonicalHash(requestBodyForHash);
        const idempotencyKey = deriveIdempotencyKey(
            request.headers.get("x-idempotency-key"),
            businessId,
            requestHash
        );

        const idemColl = idempotencyCollectionId();
        const idemTtlHours = idempotencyTtlHours();
        const idemExpiry = expiryIsoFromNow(idemTtlHours);
        if (idemColl && DATABASE_ID) {
            const existing = await databases.listDocuments(DATABASE_ID, idemColl, [
                Query.equal("businessId", businessId),
                Query.equal("idempotencyKey", idempotencyKey),
                Query.limit(1),
            ]);
            const hit = existing.documents[0] as any;
            const isExpired =
                hit?.expiresAt && new Date(String(hit.expiresAt)).getTime() < Date.now();
            if (hit && !isExpired && hit?.requestHash && String(hit.requestHash) !== requestHash) {
                return NextResponse.json(
                    {
                        error:
                            "Idempotency key was already used with a different request payload.",
                    },
                    { status: 409 }
                );
            }
            if (hit?.responseJson) {
                if (isExpired) {
                    // Ignore stale idempotency snapshots after TTL.
                } else {
                try {
                    const replay = JSON.parse(String(hit.responseJson));
                    console.info("[settlement.idempotency_hit]", {
                        businessId,
                        idempotencyKey,
                    });
                    return NextResponse.json({
                        ...replay,
                        idempotency: { key: idempotencyKey, replayed: true },
                    });
                } catch {
                    // fall through
                }
                }
            }
        }

        const jobsColl = jobsCollectionId();
        if (DATABASE_ID && jobsColl) {
            const existingJobByKey = await databases.listDocuments(DATABASE_ID, jobsColl, [
                Query.equal("businessId", businessId),
                Query.equal("idempotencyKey", idempotencyKey),
                Query.limit(1),
            ]);
            const sameJob = existingJobByKey.documents[0] as any;
            if (sameJob) {
                const replayQueued = {
                    success: true,
                    mode: "queued",
                    jobId: sameJob.$id,
                    idempotency: { key: idempotencyKey, replayed: true },
                };
                return NextResponse.json(replayQueued, { status: 202 });
            }

            const createdJob = await databases.createDocument(DATABASE_ID, jobsColl, ID.unique(), {
                businessId,
                status: "pending",
                orderIdsJson: JSON.stringify(orderIds).slice(0, 5000),
                paymentSplitsJson: JSON.stringify(paymentSplits).slice(0, 5000),
                paymentMethod,
                paymentReference: paymentReference || "",
                terminalId: terminalId || "",
                idempotencyKey,
                requestHash,
                createdBy: userId,
                createdAt: new Date().toISOString(),
                attemptCount: 0,
            });

            const queuedResponse = {
                success: true,
                mode: "queued",
                jobId: createdJob.$id,
                idempotency: { key: idempotencyKey, replayed: false },
            };

            if (idemColl && DATABASE_ID) {
                const existingIdem = await databases.listDocuments(DATABASE_ID, idemColl, [
                    Query.equal("businessId", businessId),
                    Query.equal("idempotencyKey", idempotencyKey),
                    Query.limit(1),
                ]);
                const existingDoc = existingIdem.documents[0] as any;
                if (existingDoc?.$id) {
                    await databases.updateDocument(DATABASE_ID, idemColl, existingDoc.$id, {
                        requestHash,
                        status: "accepted",
                        responseJson: JSON.stringify(queuedResponse).slice(0, 5000),
                        createdAt: new Date().toISOString(),
                        expiresAt: idemExpiry,
                    });
                } else {
                    await databases.createDocument(DATABASE_ID, idemColl, ID.unique(), {
                        businessId,
                        idempotencyKey,
                        requestHash,
                        status: "accepted",
                        responseJson: JSON.stringify(queuedResponse).slice(0, 5000),
                        createdAt: new Date().toISOString(),
                        expiresAt: idemExpiry,
                    });
                }
            }

            console.info("[settlement.requested]", {
                businessId,
                idempotencyKey,
                mode: "queued",
                orderCount: orderIds.length,
            });
            return NextResponse.json(queuedResponse, { status: 202 });
        }

        // Fallback: process inline when queue collections are not yet provisioned.
        const result = await settleSelectedOrders({
            orderIds,
            paymentMethod,
            paymentReference,
            paymentSplits,
            terminalId,
        });

        const inlineResponse = {
            ...result,
            mode: "inline",
            idempotency: { key: idempotencyKey, replayed: false },
        };

        if (idemColl && DATABASE_ID) {
            await databases.createDocument(DATABASE_ID, idemColl, ID.unique(), {
                businessId,
                idempotencyKey,
                requestHash,
                status: result.success ? "processed" : "failed",
                responseJson: JSON.stringify(inlineResponse).slice(0, 5000),
                createdAt: new Date().toISOString(),
                expiresAt: idemExpiry,
            });
        }

        console.info("[settlement.processed]", {
            businessId,
            idempotencyKey,
            mode: "inline",
            success: result.success,
            orderCount: orderIds.length,
        });
        return NextResponse.json(inlineResponse, { status: result.success ? 200 : 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to queue/process settlement";
        console.error("[settlement.failed]", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

