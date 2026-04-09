import { NextRequest, NextResponse } from "next/server";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";

function collectionId(): string | undefined {
    return process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const coll = collectionId();
        if (!coll || !DATABASE_ID) {
            return NextResponse.json({ error: "Settlement jobs not configured." }, { status: 503 });
        }

        const { jobId } = await params;
        const job = await databases.getDocument(DATABASE_ID, coll, jobId);
        if (String((job as any).businessId || "") !== businessId) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        let result: unknown = null;
        if ((job as any).resultJson) {
            try {
                result = JSON.parse(String((job as any).resultJson));
            } catch {
                result = null;
            }
        }

        return NextResponse.json({
            success: true,
            job: {
                $id: job.$id,
                status: (job as any).status,
                errorMessage: (job as any).errorMessage || "",
                createdAt: (job as any).createdAt || job.$createdAt,
                startedAt: (job as any).startedAt || null,
                completedAt: (job as any).completedAt || null,
                result,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch settlement job";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

