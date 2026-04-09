import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { requireOrgAdmin } from "@/lib/auth.utils";

function jobsCollectionId(): string | undefined {
    return process.env.PAYMENT_SETTLEMENT_JOBS_COLLECTION_ID;
}

export async function GET() {
    try {
        const { businessId } = await requireOrgAdmin();
        const jobsColl = jobsCollectionId();
        if (!DATABASE_ID || !jobsColl) {
            return NextResponse.json({ error: "Settlement jobs collection not configured" }, { status: 503 });
        }

        const [unresolved, unresolvedDrift, pendingBank, completedBank] = await Promise.all([
            databases.listDocuments(DATABASE_ID, jobsColl, [
                Query.equal("businessId", businessId),
                Query.equal("status", ["unresolved_callback", "unresolved_drift"]),
                Query.limit(500),
            ]),
            databases.listDocuments(DATABASE_ID, jobsColl, [
                Query.equal("businessId", businessId),
                Query.equal("status", "unresolved_drift"),
                Query.limit(500),
            ]),
            databases.listDocuments(DATABASE_ID, jobsColl, [
                Query.equal("businessId", businessId),
                Query.equal("status", "pending"),
                Query.equal("paymentMethod", "bank_paybill"),
                Query.limit(500),
            ]),
            databases.listDocuments(DATABASE_ID, jobsColl, [
                Query.equal("businessId", businessId),
                Query.equal("status", "completed"),
                Query.equal("paymentMethod", "bank_paybill"),
                Query.limit(500),
            ]),
        ]);

        const now = Date.now();
        const unresolvedAgeMinutes = unresolved.documents
            .map((doc: any) => {
                const createdAt = new Date(String(doc.createdAt || doc.$createdAt || "")).getTime();
                if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
                return (now - createdAt) / 60000;
            })
            .filter((n: number | null): n is number => typeof n === "number" && Number.isFinite(n));

        const avgUnresolvedAgeMinutes =
            unresolvedAgeMinutes.length > 0
                ? unresolvedAgeMinutes.reduce((s, n) => s + n, 0) / unresolvedAgeMinutes.length
                : 0;
        const unresolvedOver5mCount = unresolvedAgeMinutes.filter((age) => age > 5).length;

        const settledLatencies = completedBank.documents
            .map((doc: any) => {
                const started = new Date(String(doc.createdAt || doc.$createdAt || "")).getTime();
                const completedAt = new Date(String(doc.completedAt || doc.$updatedAt || "")).getTime();
                if (!Number.isFinite(started) || !Number.isFinite(completedAt) || completedAt <= started) {
                    return null;
                }
                return (completedAt - started) / 60000;
            })
            .filter((n: number | null): n is number => typeof n === "number" && Number.isFinite(n));

        const avgCallbackToSettleMinutes =
            settledLatencies.length > 0
                ? settledLatencies.reduce((s, n) => s + n, 0) / settledLatencies.length
                : 0;

        return NextResponse.json({
            success: true,
            unresolvedCount: unresolved.total ?? unresolved.documents.length,
            unresolvedDriftCount: unresolvedDrift.total ?? unresolvedDrift.documents.length,
            unresolvedOver5mCount,
            pendingBankCount: pendingBank.total ?? pendingBank.documents.length,
            avgUnresolvedAgeMinutes,
            avgCallbackToSettleMinutes,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load Jenga summary";
        const status = message.includes("FORBIDDEN") ? 403 : message.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

