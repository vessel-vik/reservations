import { ID } from "node-appwrite";
import {
    databases,
    DATABASE_ID,
    PRINT_AUDIT_ENTRIES_COLLECTION_ID,
} from "@/lib/appwrite.config";

export type PrintAuditStatus = "queued" | "printing" | "completed" | "failed";
export type PrintAuditCategory = "docket" | "update" | "anomaly" | "receipt";

export function printCategoryFromJobType(jobType: string): PrintAuditCategory {
    if (jobType === "kitchen_delta") return "update";
    if (jobType === "anomaly_adjustment") return "anomaly";
    if (jobType === "receipt") return "receipt";
    return "docket";
}

export async function recordPrintAudit(input: {
    businessId: string;
    printJobId: string;
    jobType: string;
    status: PrintAuditStatus;
    orderId?: string;
    summary?: string;
    errorMessage?: string;
    content?: string;
    dedupeKey?: string;
    actorUserId?: string;
    actorRole?: string;
    waiterId?: string;
    terminalId?: string;
    requeueReason?: string;
}) {
    if (!DATABASE_ID || !PRINT_AUDIT_ENTRIES_COLLECTION_ID) return;
    try {
        await databases.createDocument(DATABASE_ID, PRINT_AUDIT_ENTRIES_COLLECTION_ID, ID.unique(), {
            businessId: input.businessId,
            printJobId: input.printJobId,
            orderId: input.orderId || "",
            jobType: input.jobType,
            category: printCategoryFromJobType(input.jobType),
            status: input.status,
            summary: String(input.summary || "").slice(0, 500),
            errorMessage: String(input.errorMessage || "").slice(0, 500),
            timestamp: new Date().toISOString(),
            contentSample: String(input.content || "").slice(0, 1800),
            dedupeKey: String(input.dedupeKey || "").slice(0, 120),
            actorUserId: String(input.actorUserId || "").slice(0, 64),
            actorRole: String(input.actorRole || "").slice(0, 40),
            waiterId: String(input.waiterId || "").slice(0, 64),
            terminalId: String(input.terminalId || "").slice(0, 120),
            requeueReason: String(input.requeueReason || "").slice(0, 80),
        });
    } catch (e) {
        // Best effort audit logging — print flow should still proceed.
        console.warn("recordPrintAudit skipped:", e);
    }
}

