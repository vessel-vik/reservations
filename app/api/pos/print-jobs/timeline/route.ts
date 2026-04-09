import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import {
    databases,
    DATABASE_ID,
    PRINT_AUDIT_ENTRIES_COLLECTION_ID,
    ORDERS_COLLECTION_ID,
} from "@/lib/appwrite.config";
import { requireOrgAdmin } from "@/lib/auth.utils";

function printJobsCollectionId(): string | undefined {
    return process.env.PRINT_JOBS_COLLECTION_ID || process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
}

export async function GET(request: NextRequest) {
    try {
        const coll = printJobsCollectionId();
        if (!coll || !DATABASE_ID || !ORDERS_COLLECTION_ID) {
            return NextResponse.json({ error: "Print jobs not configured" }, { status: 503 });
        }
        const { businessId } = await requireOrgAdmin();
        const orderId = String(request.nextUrl.searchParams.get("orderId") || "").trim();
        if (!orderId) {
            return NextResponse.json({ error: "orderId is required" }, { status: 400 });
        }

        // Ensure the requested order belongs to this tenant.
        const order = await databases.getDocument(DATABASE_ID, ORDERS_COLLECTION_ID, orderId).catch(() => null);
        if (!order || String((order as any).businessId || "") !== businessId) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        let jobs: any[] = [];
        try {
            const jobsRes = await databases.listDocuments(DATABASE_ID, coll, [
                Query.equal("businessId", businessId),
                Query.equal("orderId", orderId),
                Query.orderDesc("$createdAt"),
                Query.limit(200),
            ]);
            jobs = jobsRes.documents;
        } catch {
            // Backward compatibility where `orderId` attribute is not yet created on print_jobs.
            const fallbackRes = await databases.listDocuments(DATABASE_ID, coll, [
                Query.equal("businessId", businessId),
                Query.orderDesc("$createdAt"),
                Query.limit(400),
            ]);
            jobs = fallbackRes.documents.filter((j: any) => {
                if (String(j.orderId || "") === orderId) return true;
                const content = String(j.content || "");
                if (content.startsWith(`orderId:${orderId}`)) return true;
                try {
                    const parsed = JSON.parse(content) as { orderId?: string };
                    return String(parsed.orderId || "") === orderId;
                } catch {
                    return false;
                }
            });
        }

        let auditRows: any[] = [];
        if (PRINT_AUDIT_ENTRIES_COLLECTION_ID) {
            const auditRes = await databases.listDocuments(DATABASE_ID, PRINT_AUDIT_ENTRIES_COLLECTION_ID, [
                Query.equal("businessId", businessId),
                Query.equal("orderId", orderId),
                Query.orderDesc("timestamp"),
                Query.limit(400),
            ]);
            auditRows = auditRes.documents;
        }

        const timeline = [
            ...jobs.map((j: any) => ({
                source: "job" as const,
                id: j.$id,
                at: j.timestamp || j.$createdAt,
                jobType: j.jobType,
                status: j.status,
                summary: j.content ? String(j.content).slice(0, 220) : "",
                actorUserId: j.createdByUserId || "",
                actorRole: j.createdByRole || "",
            })),
            ...auditRows.map((a: any) => ({
                source: "audit" as const,
                id: a.$id,
                at: a.timestamp || a.$createdAt,
                jobType: a.jobType,
                status: a.status,
                summary: a.summary || "",
                actorUserId: a.actorUserId || "",
                actorRole: a.actorRole || "",
                errorMessage: a.errorMessage || "",
            })),
        ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

        return NextResponse.json({
            order: {
                $id: (order as any).$id,
                orderNumber: (order as any).orderNumber,
                tableNumber: (order as any).tableNumber,
                waiterName: (order as any).waiterName,
                customerName: (order as any).customerName,
                paymentStatus: (order as any).paymentStatus,
            },
            timeline,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load timeline";
        const status = msg.includes("FORBIDDEN") ? 403 : msg.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

