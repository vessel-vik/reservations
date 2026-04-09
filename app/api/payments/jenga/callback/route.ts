import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from "@/lib/appwrite.config";
import { jengaStateToInternalStatus } from "@/lib/jenga-client";

type JengaCallbackPayload = {
    status?: boolean;
    code?: number;
    message?: string;
    transactionReference?: string;
    debitedAmount?: number;
    requestAmount?: number;
    currency?: string;
    callbackType?: string;
    customer?: {
        reference?: string;
    };
    transaction?: {
        reference?: string;
        amount?: number;
        currency?: string;
        status?: string;
        billNumber?: string;
        dateTime?: string;
        timestamp?: string;
    };
    bank?: {
        reference?: string;
    };
    timestamp?: string;
};

function jobsCollectionId(): string | undefined {
    return process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
}

function idempotencyCollectionId(): string | undefined {
    return process.env.PAYMENT_IDEMPOTENCY_COLLECTION_ID;
}

function callbackBusinessId(): string {
    const businessId = String(process.env.JENGA_CALLBACK_BUSINESS_ID || "").trim();
    if (!businessId) throw new Error("Missing JENGA_CALLBACK_BUSINESS_ID");
    return businessId;
}

function parseBasicAuthHeader(authorizationHeader: string | null): { username: string; password: string } | null {
    if (!authorizationHeader) return null;
    const [scheme, token] = authorizationHeader.split(" ");
    if (String(scheme || "").toLowerCase() !== "basic" || !token) return null;
    try {
        const decoded = Buffer.from(token, "base64").toString("utf8");
        const idx = decoded.indexOf(":");
        if (idx < 0) return null;
        return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
    } catch {
        return null;
    }
}

function verifyCallbackAuth(request: NextRequest): boolean {
    const primaryUser = String(process.env.JENGA_CALLBACK_USERNAME || "").trim();
    const primaryPass = String(process.env.JENGA_CALLBACK_PASSWORD || "").trim();
    const nextUser = String(process.env.JENGA_CALLBACK_USERNAME_NEXT || "").trim();
    const nextPass = String(process.env.JENGA_CALLBACK_PASSWORD_NEXT || "").trim();

    const credentials = [
        { username: primaryUser, password: primaryPass },
        { username: nextUser, password: nextPass },
    ].filter((pair) => pair.username !== "" || pair.password !== "");

    if (credentials.length === 0) return true;
    const parsed = parseBasicAuthHeader(request.headers.get("authorization"));
    if (!parsed) return false;
    return credentials.some(
        (pair) => pair.username === parsed.username && pair.password === parsed.password
    );
}

function normalizeIp(value: string): string {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("::ffff:")) return raw.slice(7);
    return raw;
}

function requestClientIp(request: NextRequest): string {
    const forwardedFor = String(request.headers.get("x-forwarded-for") || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const candidates = [
        request.headers.get("cf-connecting-ip"),
        request.headers.get("x-real-ip"),
        forwardedFor[0],
    ]
        .map((x) => normalizeIp(String(x || "")))
        .filter(Boolean);
    return candidates[0] || "";
}

function isAllowedCallbackIp(request: NextRequest): boolean {
    const allowlist = String(process.env.JENGA_CALLBACK_IP_ALLOWLIST || "")
        .split(",")
        .map((x) => normalizeIp(x))
        .filter(Boolean);
    if (allowlist.length === 0) return true;
    const ip = requestClientIp(request);
    if (!ip) return false;
    return allowlist.includes(ip);
}

function extractCallbackTimestampMs(payload: JengaCallbackPayload): number | null {
    const raw = String(
        payload.transaction?.dateTime ||
            payload.transaction?.timestamp ||
            payload.timestamp ||
            ""
    ).trim();
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function isOutsideReplayWindow(callbackTimestampMs: number | null): boolean {
    if (!Number.isFinite(callbackTimestampMs)) return false;
    const windowMinutesRaw = Number(process.env.JENGA_CALLBACK_REPLAY_WINDOW_MINUTES || 30);
    const windowMinutes = Math.max(2, Math.min(240, Number.isFinite(windowMinutesRaw) ? windowMinutesRaw : 30));
    const delta = Math.abs(Date.now() - Number(callbackTimestampMs));
    return delta > windowMinutes * 60_000;
}

function extractCallbackMeta(payload: JengaCallbackPayload): {
    providerReference: string;
    orderReference: string;
    amount: number;
    currency: string;
    status: "confirmed" | "failed" | "pending";
    rawCode?: number;
} {
    const providerReference = String(
        payload.transaction?.reference ||
            payload.bank?.reference ||
            payload.transactionReference ||
            ""
    ).trim();
    const orderReference = String(
        payload.customer?.reference ||
            payload.transaction?.billNumber ||
            ""
    ).trim();
    const amount = Number(
        payload.transaction?.amount ?? payload.debitedAmount ?? payload.requestAmount ?? 0
    );
    const currency = String(payload.transaction?.currency || payload.currency || "KES")
        .trim()
        .toUpperCase();
    const rawCode = Number(payload.code);
    const status = jengaStateToInternalStatus({
        transactionStatus: payload.transaction?.status,
        callbackCode: Number.isFinite(rawCode) ? rawCode : undefined,
        callbackStatusBoolean: payload.status,
    });

    return { providerReference, orderReference, amount, currency, status, rawCode: Number.isFinite(rawCode) ? rawCode : undefined };
}

async function queueUnresolvedCallback(params: {
    jobsColl: string;
    businessId: string;
    reason: string;
    callback: ReturnType<typeof extractCallbackMeta>;
    payload: JengaCallbackPayload;
}): Promise<void> {
    const unresolvedIdempotencyKey = `jenga-unresolved:${params.businessId}:${params.callback.providerReference}:${params.reason}`.slice(
        0,
        160
    );
    const existing = await databases.listDocuments(DATABASE_ID!, params.jobsColl, [
        Query.equal("businessId", params.businessId),
        Query.equal("idempotencyKey", unresolvedIdempotencyKey),
        Query.limit(1),
    ]);
    if (existing.documents[0]?.$id) return;

    const nowIso = new Date().toISOString();
    const unresolvedResult = {
        unresolved: true,
        reason: params.reason,
        callback: params.callback,
        payload: params.payload,
    };
    await databases.createDocument(DATABASE_ID!, params.jobsColl, ID.unique(), {
        businessId: params.businessId,
        status: "unresolved_callback",
        orderIdsJson: "[]",
        paymentSplitsJson: "[]",
        paymentMethod: "bank_paybill",
        paymentReference: String(params.callback.providerReference || "").slice(0, 160),
        terminalId: "jenga-callback",
        idempotencyKey: unresolvedIdempotencyKey,
        requestHash: String(`${params.businessId}:${params.callback.providerReference}:${params.reason}`).slice(
            0,
            128
        ),
        createdBy: "jenga-callback",
        createdAt: nowIso,
        startedAt: "",
        completedAt: nowIso,
        resultJson: JSON.stringify(unresolvedResult).slice(0, 5000),
        errorMessage: String(params.reason).slice(0, 500),
        attemptCount: 0,
    });
}

export async function POST(request: NextRequest) {
    try {
        if (!verifyCallbackAuth(request)) {
            return NextResponse.json({ error: "Unauthorized callback" }, { status: 401 });
        }
        if (!isAllowedCallbackIp(request)) {
            return NextResponse.json({ error: "Unauthorized callback source" }, { status: 403 });
        }

        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }
        const jobsColl = jobsCollectionId();
        if (!jobsColl) {
            return NextResponse.json({ error: "Settlement jobs collection not configured" }, { status: 503 });
        }

        const payload = (await request.json().catch(() => ({}))) as JengaCallbackPayload;
        const callback = extractCallbackMeta(payload);
        if (isOutsideReplayWindow(extractCallbackTimestampMs(payload))) {
            const jobsColl = jobsCollectionId();
            const businessId = callbackBusinessId();
            if (jobsColl && callback.providerReference) {
                await queueUnresolvedCallback({
                    jobsColl,
                    businessId,
                    reason: "callback_outside_replay_window",
                    callback,
                    payload,
                });
            }
            return NextResponse.json(
                {
                    success: true,
                    status: "accepted_unresolved",
                    reason: "callback_outside_replay_window",
                    providerReference: callback.providerReference || "",
                },
                { status: 202 }
            );
        }
        if (!callback.providerReference) {
            return NextResponse.json({ error: "Missing provider reference in callback payload" }, { status: 400 });
        }
        const businessId = callbackBusinessId();
        if (!callback.orderReference) {
            await queueUnresolvedCallback({
                jobsColl,
                businessId,
                reason: "missing_order_reference",
                callback,
                payload,
            });
            return NextResponse.json(
                {
                    success: true,
                    status: "accepted_unresolved",
                    reason: "missing_order_reference",
                    providerReference: callback.providerReference,
                },
                { status: 202 }
            );
        }

        if (callback.status !== "confirmed") {
            return NextResponse.json({
                success: true,
                status: "accepted_no_settlement",
                providerReference: callback.providerReference,
                paymentStatus: callback.status,
            });
        }

        const idempotencyKey = `jenga:${businessId}:${callback.providerReference}`.slice(0, 160);

        const existingJob = await databases.listDocuments(DATABASE_ID, jobsColl, [
            Query.equal("businessId", businessId),
            Query.equal("idempotencyKey", idempotencyKey),
            Query.limit(1),
        ]);
        const existing = existingJob.documents[0] as any;
        if (existing?.$id) {
            return NextResponse.json(
                {
                    success: true,
                    mode: "queued",
                    replayed: true,
                    jobId: existing.$id,
                    providerReference: callback.providerReference,
                },
                { status: 202 }
            );
        }

        const ordersResult = await databases.listDocuments(DATABASE_ID, ORDERS_COLLECTION_ID, [
            Query.equal("businessId", businessId),
            Query.equal("paymentStatus", "unpaid"),
            Query.equal("orderNumber", callback.orderReference),
            Query.limit(20),
        ]);
        const orders = (ordersResult.documents || []) as any[];
        if (orders.length === 0) {
            await queueUnresolvedCallback({
                jobsColl,
                businessId,
                reason: "order_not_found",
                callback,
                payload,
            });
            return NextResponse.json(
                {
                    success: true,
                    status: "accepted_unresolved",
                    reason: "order_not_found",
                    orderReference: callback.orderReference,
                    providerReference: callback.providerReference,
                },
                { status: 202 }
            );
        }

        const totalDue = orders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
        const paymentAmount = Number(callback.amount) || 0;
        const diff = Math.abs(totalDue - paymentAmount);
        if (paymentAmount <= 0 || diff > 0.5) {
            await queueUnresolvedCallback({
                jobsColl,
                businessId,
                reason: "amount_mismatch",
                callback,
                payload,
            });
            return NextResponse.json(
                {
                    success: true,
                    status: "accepted_unresolved",
                    reason: "amount_mismatch",
                    providerReference: callback.providerReference,
                    orderReference: callback.orderReference,
                    currency: callback.currency,
                    dueAmount: totalDue,
                    callbackAmount: paymentAmount,
                },
                { status: 202 }
            );
        }

        const terminalId = "jenga-callback";
        const paymentReference = `JENGA-${callback.providerReference}`.slice(0, 160);
        const requestHash = `${businessId}:${callback.orderReference}:${paymentAmount}:${paymentReference}`
            .slice(0, 128);

        const createdJob = await databases.createDocument(DATABASE_ID, jobsColl, ID.unique(), {
            businessId,
            status: "pending",
            orderIdsJson: JSON.stringify(orders.map((order) => String(order.$id))).slice(0, 5000),
            paymentSplitsJson: JSON.stringify([
                {
                    method: "bank_paybill",
                    amount: paymentAmount,
                    reference: paymentReference,
                    terminalId,
                },
            ]).slice(0, 5000),
            paymentMethod: "bank_paybill",
            paymentReference,
            terminalId,
            idempotencyKey,
            requestHash,
            createdBy: "jenga-callback",
            createdAt: new Date().toISOString(),
            attemptCount: 0,
        });

        const idemColl = idempotencyCollectionId();
        if (idemColl) {
            await databases.createDocument(DATABASE_ID, idemColl, ID.unique(), {
                businessId,
                idempotencyKey,
                requestHash,
                status: "accepted",
                responseJson: JSON.stringify({
                    success: true,
                    mode: "queued",
                    jobId: createdJob.$id,
                    providerReference: callback.providerReference,
                }).slice(0, 5000),
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            });
        }

        return NextResponse.json(
            {
                success: true,
                mode: "queued",
                replayed: false,
                jobId: createdJob.$id,
                providerReference: callback.providerReference,
                orderReference: callback.orderReference,
            },
            { status: 202 }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process Jenga callback";
        console.error("[payments.jenga.callback] error", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

