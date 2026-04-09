export type SettlementSplit = {
    method: string;
    amount: number;
    reference?: string;
    terminalId?: string;
};

export type SettlementRequest = {
    orderIds: string[];
    paymentMethod: string;
    paymentReference?: string;
    paymentSplits?: SettlementSplit[];
    terminalId?: string;
};

export type SettlementResponseShape = {
    success: boolean;
    message?: string;
    updatedCount?: number;
    totalAmount?: number;
    consolidatedOrderId?: string | null;
    paymentReference?: string;
    paymentMethod?: string;
    paymentMethods?: SettlementSplit[];
};

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeIdempotencyKey(payload: SettlementRequest): string {
    const canon = {
        orderIds: [...payload.orderIds].sort(),
        paymentMethod: payload.paymentMethod,
        paymentReference: payload.paymentReference || "",
        paymentSplits: (payload.paymentSplits || []).map((x) => ({
            method: String(x.method || "").toLowerCase(),
            amount: Number(x.amount) || 0,
            reference: String(x.reference || ""),
            terminalId: String(x.terminalId || payload.terminalId || ""),
        })),
        terminalId: payload.terminalId || "",
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(canon))));
    return `pos:${encoded.slice(0, 96)}`;
}

async function pollSettlementJob(jobId: string, timeoutMs = 45_000): Promise<SettlementResponseShape> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const resp = await fetch(`/api/payments/settlements/${encodeURIComponent(jobId)}`, {
            method: "GET",
            credentials: "same-origin",
        });
        if (!resp.ok) {
            throw new Error(`Failed to check settlement job (${resp.status})`);
        }
        const data = await resp.json();
        const job = data?.job;
        if (!job) throw new Error("Settlement job response malformed.");

        if (job.status === "completed") {
            return (job.result || { success: true }) as SettlementResponseShape;
        }
        if (job.status === "failed") {
            throw new Error(job.errorMessage || "Settlement failed in worker.");
        }

        await wait(1200);
    }
    throw new Error("Settlement is taking too long. Please check job status and retry.");
}

export async function settleViaQueue(payload: SettlementRequest): Promise<SettlementResponseShape> {
    const idem = makeIdempotencyKey(payload);
    const response = await fetch("/api/payments/settle", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-idempotency-key": idem,
        },
        credentials: "same-origin",
        body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error || data?.message || "Settlement request failed.");
    }

    if (data?.mode === "queued" && data?.jobId) {
        return await pollSettlementJob(String(data.jobId));
    }

    return data as SettlementResponseShape;
}

