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
        const databaseId = DATABASE_ID;
        const printJobsColl = coll;
        const { businessId, userId, role } = await requireOrgAdmin();
        const { jobId } = await params;
        const body = await request.json();
        const status = String(body?.status || "").trim();
        const errorMessage = body?.errorMessage ? String(body.errorMessage) : "";
        if (!["printing", "completed", "failed"].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const existing = await databases.getDocument(DATABASE_ID, coll, jobId);
        if (String((existing as any).businessId || "") !== businessId) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const previousAttempts = Number((existing as any).attemptCount || 0);
        const updateData: Record<string, unknown> = {
            status,
            attemptCount: status === "failed" ? previousAttempts + 1 : previousAttempts,
        };
        if (status === "completed") {
            updateData.printedAt = new Date().toISOString();
        }
        if (errorMessage) updateData.errorMessage = errorMessage.slice(0, 500);
        await databases
            .updateDocument(databaseId, printJobsColl, jobId, updateData)
            .catch(async () =>
                databases.updateDocument(databaseId, printJobsColl, jobId, {
                    status,
                    ...(errorMessage ? { errorMessage: errorMessage.slice(0, 500) } : {}),
                })
            );

        // Parse basic order ref from legacy/string content or JSON jobs.
        const content = String((existing as any).content || "");
        const byRegex = content.match(/orderId:([\w-]+)/)?.[1];
        const orderId =
            byRegex ||
            (() => {
                try {
                    const parsed = JSON.parse(content) as { orderId?: string };
                    return parsed.orderId || "";
                } catch {
                    return "";
                }
            })();

        await recordPrintAudit({
            businessId,
            printJobId: jobId,
            jobType: String((existing as any).jobType || ""),
            status: status as "printing" | "completed" | "failed",
            orderId: orderId || undefined,
            summary: `${String((existing as any).jobType || "print")} ${status}`,
            errorMessage: errorMessage || undefined,
            content,
            dedupeKey: String((existing as any).dedupeKey || ""),
            actorUserId: userId,
            actorRole: role,
            waiterId: String((existing as any).waiterId || ""),
            terminalId: String((existing as any).targetTerminal || ""),
            requeueReason: String((existing as any).requeueReason || ""),
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to update print status";
        const status = msg.includes("FORBIDDEN") ? 403 : msg.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

