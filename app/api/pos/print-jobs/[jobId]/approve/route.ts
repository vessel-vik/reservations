import { NextRequest, NextResponse } from "next/server";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { requireOrgAdmin } from "@/lib/auth.utils";
import { recordPrintAudit } from "@/lib/print-audit";

function collectionId(): string | undefined {
    return process.env.PRINT_JOBS_COLLECTION_ID || process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        const coll = collectionId();
        if (!coll || !DATABASE_ID) {
            return NextResponse.json({ error: "Print jobs not configured" }, { status: 503 });
        }
        const { businessId, userId, role } = await requireOrgAdmin();
        const { jobId } = await params;
        const existing = await databases.getDocument(DATABASE_ID, coll, jobId);
        if (String((existing as any).businessId || "") !== businessId) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (String((existing as any).status || "") !== "pending_approval") {
            return NextResponse.json({ error: "Job is not awaiting approval" }, { status: 400 });
        }

        const nowIso = new Date().toISOString();
        await databases.updateDocument(DATABASE_ID, coll, jobId, {
            status: "pending",
            queuedAt: nowIso,
            approvedAt: nowIso,
            approvedByUserId: String(userId || "").slice(0, 64),
        }).catch(async () =>
            databases.updateDocument(DATABASE_ID, coll, jobId, {
                status: "pending",
                queuedAt: nowIso,
            })
        );

        await recordPrintAudit({
            businessId,
            printJobId: jobId,
            jobType: String((existing as any).jobType || ""),
            status: "queued",
            orderId: String((existing as any).orderId || ""),
            summary: `Admin approved print job`,
            content: String((existing as any).content || ""),
            dedupeKey: String((existing as any).dedupeKey || ""),
            actorUserId: userId,
            actorRole: role,
            waiterId: String((existing as any).waiterId || ""),
            terminalId: String((existing as any).targetTerminal || ""),
            requeueReason: "admin_approval",
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to approve print job";
        const status = msg.includes("FORBIDDEN") ? 403 : msg.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

