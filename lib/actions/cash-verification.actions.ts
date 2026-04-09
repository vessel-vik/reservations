"use server";

import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";
import {
    storage,
    databases,
    DATABASE_ID,
    BUCKET_ID,
    CASH_VERIFICATIONS_COLLECTION_ID,
} from "@/lib/appwrite.config";
import { ID, InputFile } from "node-appwrite";

export type RecordCashVerificationInput = {
    paymentReference: string;
    /** Base64 JPEG/PNG without data URL prefix, or full data:image/...;base64,... */
    imageBase64: string;
    deviceInstallId: string;
    capturedAt: string;
    userAgent?: string;
    orderIds?: string[];
    geo?: { lat: number; lng: number; accuracy?: number } | null;
};

function stripDataUrl(b64: string): Buffer {
    const trimmed = b64.trim();
    const m = /^data:image\/\w+;base64,(.+)$/i.exec(trimmed);
    const raw = m ? m[1] : trimmed;
    return Buffer.from(raw, "base64");
}

/**
 * Uploads cash verification photo to Appwrite Storage and writes a cash_verifications row.
 * Safe to fire-and-forget from the client after settlement.
 */
export async function recordCashVerification(
    input: RecordCashVerificationInput
): Promise<{ success: boolean; error?: string; fileId?: string }> {
    try {
        if (!CASH_VERIFICATIONS_COLLECTION_ID || !DATABASE_ID) {
            console.warn("cash_verifications: collection or database not configured");
            return { success: false, error: "not_configured" };
        }
        if (!BUCKET_ID) {
            console.warn("cash_verifications: bucket not configured");
            return { success: false, error: "no_bucket" };
        }

        const { businessId, userId } = await getAuthContext();
        validateBusinessContext(businessId);

        const ref = input.paymentReference?.trim();
        if (!ref || !input.imageBase64?.trim()) {
            return { success: false, error: "invalid_payload" };
        }

        let buffer: Buffer;
        try {
            buffer = stripDataUrl(input.imageBase64);
        } catch {
            return { success: false, error: "invalid_image" };
        }
        if (buffer.length < 100 || buffer.length > 6 * 1024 * 1024) {
            return { success: false, error: "image_size" };
        }

        const fileId = ID.unique();
        const file = InputFile.fromBuffer(buffer, `cash-${ref.replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`);
        const created = await storage.createFile(BUCKET_ID, fileId, file);

        const geoStr =
            input.geo != null
                ? JSON.stringify({
                      lat: input.geo.lat,
                      lng: input.geo.lng,
                      accuracy: input.geo.accuracy,
                  })
                : "";

        await databases.createDocument(
            DATABASE_ID,
            CASH_VERIFICATIONS_COLLECTION_ID,
            ID.unique(),
            {
                businessId,
                paymentReference: ref,
                fileId: created.$id,
                deviceInstallId: input.deviceInstallId || "",
                capturedAt: input.capturedAt,
                clerkUserId: userId,
                userAgent: input.userAgent?.slice(0, 500) ?? "",
                geoJson: geoStr,
                orderIdsJson: JSON.stringify(input.orderIds ?? []),
            }
        );

        return { success: true, fileId: created.$id };
    } catch (e) {
        console.error("recordCashVerification:", e);
        return {
            success: false,
            error: e instanceof Error ? e.message : "unknown",
        };
    }
}
