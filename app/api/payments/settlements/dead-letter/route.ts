import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { requireOrgAdmin } from "@/lib/auth.utils";

function jobsCollectionId(): string | undefined {
    return process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
}

export async function GET(request: NextRequest) {
    try {
        const { businessId } = await requireOrgAdmin();
        const coll = jobsCollectionId();
        if (!DATABASE_ID || !coll) {
            return NextResponse.json({ error: "Settlement jobs collection not configured" }, { status: 503 });
        }

        const limitRaw = Number(request.nextUrl.searchParams.get("limit") || 50);
        const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));

        const result = await databases.listDocuments(DATABASE_ID, coll, [
            Query.equal("businessId", businessId),
            Query.equal("status", "dead_letter"),
            Query.orderDesc("$updatedAt"),
            Query.limit(limit),
        ]);

        const jobs = result.documents.map((d: any) => ({
            $id: d.$id,
            status: d.status,
            paymentMethod: d.paymentMethod,
            paymentReference: d.paymentReference || "",
            orderIdsJson: d.orderIdsJson,
            attemptCount: d.attemptCount,
            errorMessage: d.errorMessage || "",
            resultJson: d.resultJson || "",
            createdAt: d.createdAt || d.$createdAt,
            updatedAt: d.$updatedAt,
        }));

        return NextResponse.json({ success: true, jobs, total: result.total ?? jobs.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load dead-letter jobs";
        const status = message.includes("FORBIDDEN") ? 403 : message.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { businessId } = await requireOrgAdmin();
        const coll = jobsCollectionId();
        if (!DATABASE_ID || !coll) {
            return NextResponse.json({ error: "Settlement jobs collection not configured" }, { status: 503 });
        }

        const body = await request.json().catch(() => ({}));
        const jobId = String(body?.jobId || "").trim();
        if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

        const job = await databases.getDocument(DATABASE_ID, coll, jobId);
        if (String((job as any).businessId || "") !== businessId) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        if (String((job as any).status || "") !== "dead_letter") {
            return NextResponse.json({ error: "Only dead_letter jobs can be replayed" }, { status: 409 });
        }

        await databases.updateDocument(DATABASE_ID, coll, jobId, {
            status: "pending",
            attemptCount: 0,
            startedAt: "",
            completedAt: "",
            errorMessage: "",
            resultJson: "",
        });

        return NextResponse.json({ success: true, message: "Dead-letter job queued for replay", jobId });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to replay dead-letter job";
        const status = message.includes("FORBIDDEN") ? 403 : message.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

