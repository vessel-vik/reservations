"use server";

import { Query } from "node-appwrite";
import { databases, DATABASE_ID, CASH_VERIFICATIONS_COLLECTION_ID, BUCKET_ID } from "@/lib/appwrite.config";
import { getAuthContext, validateBusinessContext, requireOrgAdmin } from "@/lib/auth.utils";
import { parseStringify } from "@/lib/utils";

export type CashVerificationRow = {
    $id: string;
    paymentReference: string;
    fileId: string;
    deviceInstallId?: string;
    capturedAt: string;
    clerkUserId?: string;
    userAgent?: string;
    geoJson?: string;
    orderIdsJson?: string;
    businessId: string;
};

/** Admin-only: recent cash verification rows for Finance / audit UI. */
export async function listCashVerificationsForAdmin(limit = 50): Promise<CashVerificationRow[]> {
    await requireOrgAdmin();
    if (!DATABASE_ID || !CASH_VERIFICATIONS_COLLECTION_ID) return [];

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    const res = await databases.listDocuments(DATABASE_ID, CASH_VERIFICATIONS_COLLECTION_ID, [
        Query.equal("businessId", businessId),
        Query.orderDesc("$createdAt"),
        Query.limit(Math.min(limit, 100)),
    ]);

    return parseStringify(res.documents) as CashVerificationRow[];
}

/** Admin-only: verify file belongs to tenant before streaming preview. */
export async function assertCashVerificationFileForOrg(fileId: string): Promise<boolean> {
    await requireOrgAdmin();
    if (!DATABASE_ID || !CASH_VERIFICATIONS_COLLECTION_ID || !fileId) return false;
    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    const res = await databases.listDocuments(DATABASE_ID, CASH_VERIFICATIONS_COLLECTION_ID, [
        Query.equal("businessId", businessId),
        Query.equal("fileId", fileId),
        Query.limit(1),
    ]);
    return res.documents.length > 0;
}
