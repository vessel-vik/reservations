"use server";

import { ID, Query } from "node-appwrite";
import { databases, DATABASE_ID, INDIVIDUAL_UNITS_COLLECTION_ID } from "@/lib/appwrite.config";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";
import { parseStringify } from "@/lib/utils";
import { getPineconeClient, pineconeIndexDims } from "@/lib/pinecone-client";
import { pseudoEmbedding, embeddingFromImageDataUrl } from "@/lib/pinecone-embed";
import { getOrder } from "@/lib/actions/pos.actions";
import { decrementItemStocks } from "@/lib/actions/menu.actions";

function requireUnitsCollection() {
    if (!DATABASE_ID || !INDIVIDUAL_UNITS_COLLECTION_ID) {
        throw new Error("INDIVIDUAL_UNITS collection not configured");
    }
}

async function pineconeUpsertVector(
    businessId: string,
    pineconeId: string,
    vector: number[],
    metadata: Record<string, string | number | boolean>
) {
    const pc = getPineconeClient();
    const indexName = process.env.PINECONE_INDEX_NAME;
    if (!pc || !indexName) return;

    const index = pc.index(indexName);
    await index.upsert({
        namespace: businessId,
        records: [
            {
                id: pineconeId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 512),
                values: vector,
                metadata,
            },
        ],
    });
}

async function pineconeQueryVector(businessId: string, vector: number[], topK: number) {
    const pc = getPineconeClient();
    const indexName = process.env.PINECONE_INDEX_NAME;
    if (!pc || !indexName) return [];

    const index = pc.index(indexName);
    const res = await index.query({
        namespace: businessId,
        vector,
        topK,
        includeMetadata: true,
    });
    return res.matches ?? [];
}

async function menuItemOnCaptainOrder(orderId: string, menuItemId: string): Promise<boolean> {
    const order = await getOrder(orderId);
    if (!order) return false;
    const items = Array.isArray(order.items) ? order.items : [];
    const mid = String(menuItemId).trim();
    return items.some((it: { $id?: string }) => String(it?.$id ?? "") === mid);
}

export async function registerIndividualUnit(input: {
    unitUid: string;
    menuItemId: string;
    embeddingLabel?: string;
    /** High-fidelity bottle photo — drives 384-d visual embedding for Pinecone when set. */
    bottleImageDataUrl?: string;
}) {
    requireUnitsCollection();
    const { businessId, userId } = await getAuthContext();
    validateBusinessContext(businessId);

    const uid = input.unitUid.trim();
    if (!uid || !input.menuItemId.trim()) throw new Error("unitUid and menuItemId required");

    const now = new Date().toISOString();
    const label = input.embeddingLabel?.trim() || uid;
    const dims = pineconeIndexDims();
    const visual = Boolean(input.bottleImageDataUrl?.trim());
    const vector = visual
        ? embeddingFromImageDataUrl(input.bottleImageDataUrl!, dims)
        : pseudoEmbedding(`${uid} ${input.menuItemId.trim()} ${label}`, dims);

    const doc = await databases.createDocument(
        DATABASE_ID!,
        INDIVIDUAL_UNITS_COLLECTION_ID!,
        ID.unique(),
        {
            businessId,
            unitUid: uid,
            menuItemId: input.menuItemId.trim(),
            state: "in_stock",
            scannedInAt: now,
            lastScannedBy: userId,
            embeddingLabel: label,
        }
    );

    await pineconeUpsertVector(businessId, uid, vector, {
        unitUid: uid,
        menuItemId: input.menuItemId.trim(),
        label: label.slice(0, 200),
        visual: visual ? 1 : 0,
    }).catch((e) => console.warn("Pinecone upsert skipped:", e));

    return parseStringify(doc);
}

export async function scanInIndividualUnit(unitUid: string) {
    requireUnitsCollection();
    const { businessId, userId } = await getAuthContext();
    validateBusinessContext(businessId);

    const res = await databases.listDocuments(DATABASE_ID!, INDIVIDUAL_UNITS_COLLECTION_ID!, [
        Query.equal("businessId", businessId),
        Query.equal("unitUid", unitUid.trim()),
        Query.limit(1),
    ]);
    if (!res.documents.length) throw new Error("Unit not found");

    const doc = res.documents[0];
    const updated = await databases.updateDocument(
        DATABASE_ID!,
        INDIVIDUAL_UNITS_COLLECTION_ID!,
        doc.$id,
        {
            state: "in_stock",
            scannedInAt: new Date().toISOString(),
            lastScannedBy: userId,
        }
    );
    return parseStringify(updated);
}

export async function scanOutIndividualUnit(unitUid: string, orderId?: string) {
    requireUnitsCollection();
    const { businessId, userId } = await getAuthContext();
    validateBusinessContext(businessId);

    const res = await databases.listDocuments(DATABASE_ID!, INDIVIDUAL_UNITS_COLLECTION_ID!, [
        Query.equal("businessId", businessId),
        Query.equal("unitUid", unitUid.trim()),
        Query.limit(1),
    ]);
    if (!res.documents.length) throw new Error("Unit not found");

    const doc = res.documents[0];
    const updated = await databases.updateDocument(
        DATABASE_ID!,
        INDIVIDUAL_UNITS_COLLECTION_ID!,
        doc.$id,
        {
            state: "sold",
            scannedOutAt: new Date().toISOString(),
            lastScannedBy: userId,
            lastOrderId: orderId?.trim() ?? "",
        }
    );
    return parseStringify(updated);
}

/**
 * Scan-out after visual/barcode ID: optionally enforce captain-order line match and decrement menu stock by 1.
 */
export async function scanOutUnitWithDocketAndStock(input: {
    unitUid: string;
    captainOrderId: string;
    decrementStock?: boolean;
}) {
    requireUnitsCollection();
    const { businessId, userId } = await getAuthContext();
    validateBusinessContext(businessId);

    const uid = input.unitUid.trim();
    const captainId = input.captainOrderId.trim();
    if (!uid || !captainId) throw new Error("unitUid and captainOrderId required");

    const res = await databases.listDocuments(DATABASE_ID!, INDIVIDUAL_UNITS_COLLECTION_ID!, [
        Query.equal("businessId", businessId),
        Query.equal("unitUid", uid),
        Query.limit(1),
    ]);
    if (!res.documents.length) throw new Error("Unit not found");

    const doc = res.documents[0] as { $id: string; menuItemId?: string; state?: string };
    const menuItemId = String(doc.menuItemId ?? "").trim();
    if (!menuItemId) throw new Error("Unit has no menuItemId");

    const onDocket = await menuItemOnCaptainOrder(captainId, menuItemId);
    if (!onDocket) {
        throw new Error("Identified unit SKU is not on this captain order (docket mismatch).");
    }

    if (doc.state === "sold") {
        throw new Error("Unit already marked sold.");
    }

    const updated = await databases.updateDocument(
        DATABASE_ID!,
        INDIVIDUAL_UNITS_COLLECTION_ID!,
        doc.$id,
        {
            state: "sold",
            scannedOutAt: new Date().toISOString(),
            lastScannedBy: userId,
            lastOrderId: captainId,
        }
    );

    if (input.decrementStock !== false) {
        await decrementItemStocks([{ itemId: menuItemId, quantity: 1 }]);
    }

    return parseStringify(updated);
}

export async function searchDamagedBarcodeSimilar(queryText: string, topK = 5) {
    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    if (!queryText.trim()) return { matches: [] as { score?: number; metadata?: Record<string, unknown> }[] };

    const dims = pineconeIndexDims();
    const vector = pseudoEmbedding(queryText.trim(), dims);
    const matches = await pineconeQueryVector(businessId, vector, topK).catch((e) => {
        console.warn("Pinecone query skipped:", e);
        return [];
    });

    return {
        matches: matches.map((m) => ({
            score: m.score,
            metadata: m.metadata as Record<string, unknown> | undefined,
        })),
    };
}

/** Visual fallback: live bottle photo → same 384-d pipeline as registration photo. */
export async function searchDamagedBarcodeVisual(imageDataUrl: string, topK = 5) {
    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    if (!imageDataUrl?.trim()) return { matches: [] as { score?: number; metadata?: Record<string, unknown> }[] };

    const dims = pineconeIndexDims();
    const vector = embeddingFromImageDataUrl(imageDataUrl.trim(), dims);
    const matches = await pineconeQueryVector(businessId, vector, topK).catch((e) => {
        console.warn("Pinecone visual query skipped:", e);
        return [];
    });

    return {
        matches: matches.map((m) => ({
            score: m.score,
            metadata: m.metadata as Record<string, unknown> | undefined,
        })),
    };
}
