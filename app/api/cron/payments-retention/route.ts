import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";

function authorized(request: NextRequest): boolean {
    const token = request.headers.get("x-worker-token") || request.headers.get("x-cron-token");
    const expected = process.env.SETTLEMENT_WORKER_TOKEN;
    return Boolean(expected && token && token === expected);
}

function retentionDays(): number {
    const raw = Number(process.env.PAYMENT_RETENTION_DAYS || 365);
    return Math.max(30, Math.min(3650, Number.isFinite(raw) ? raw : 365));
}

type CleanupTarget = {
    collectionId?: string;
    dateField: string;
    label: string;
};

async function deleteOlderThan(target: CleanupTarget, cutoffIso: string): Promise<number> {
    const databaseId = DATABASE_ID;
    const collectionId = target.collectionId;
    if (!databaseId || !collectionId) return 0;
    let deleted = 0;

    while (true) {
        const batch = await databases.listDocuments(databaseId, collectionId, [
            Query.lessThan(target.dateField, cutoffIso),
            Query.limit(100),
        ]);
        if (!batch.documents.length) break;

        await Promise.all(
            batch.documents.map(async (doc: any) => {
                await databases.deleteDocument(databaseId, collectionId, doc.$id);
                deleted += 1;
            })
        );
        if (batch.documents.length < 100) break;
    }

    console.info("[payments.retention]", { label: target.label, deleted, cutoffIso });
    return deleted;
}

export async function POST(request: NextRequest) {
    if (!authorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const days = retentionDays();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    try {
        const targets: CleanupTarget[] = [
            {
                collectionId: process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID,
                dateField: "createdAt",
                label: "settlement_jobs",
            },
            {
                collectionId: process.env.PAYMENT_IDEMPOTENCY_COLLECTION_ID,
                dateField: "createdAt",
                label: "idempotency",
            },
            {
                collectionId: process.env.PAYMENT_LEDGER_COLLECTION_ID,
                dateField: "settledAt",
                label: "ledger",
            },
        ];

        let totalDeleted = 0;
        const result: Record<string, number> = {};
        for (const target of targets) {
            const count = await deleteOlderThan(target, cutoff);
            totalDeleted += count;
            result[target.label] = count;
        }

        return NextResponse.json({
            success: true,
            retentionDays: days,
            cutoff,
            deleted: result,
            totalDeleted,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Payments retention cleanup failed";
        console.error("[payments.retention] failed", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

