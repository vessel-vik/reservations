import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from "@/lib/appwrite.config";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";
import { jengaStateToInternalStatus, queryJengaTransactionDetails } from "@/lib/jenga-client";

export async function POST(request: NextRequest) {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            return NextResponse.json({ error: "Database not configured" }, { status: 503 });
        }

        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const body = await request.json().catch(() => ({}));
        const reference = String(body?.reference || "").trim();
        const orderReference = String(body?.orderReference || "").trim();
        if (!reference) {
            return NextResponse.json({ error: "reference is required" }, { status: 400 });
        }

        const provider = await queryJengaTransactionDetails(reference);
        const status = jengaStateToInternalStatus({
            transactionStatus: provider?.data?.state,
            stateCode: typeof provider?.data?.stateCode === "number" ? provider.data.stateCode : undefined,
        });

        let matchedOrders: any[] = [];
        if (orderReference) {
            const orders = await databases.listDocuments(DATABASE_ID, ORDERS_COLLECTION_ID, [
                Query.equal("businessId", businessId),
                Query.equal("orderNumber", orderReference),
                Query.limit(20),
            ]);
            matchedOrders = (orders.documents || []).map((doc: any) => ({
                id: doc.$id,
                orderNumber: doc.orderNumber,
                paymentStatus: doc.paymentStatus,
                totalAmount: doc.totalAmount,
            }));
        }

        return NextResponse.json({
            success: true,
            reference,
            status,
            provider,
            matchedOrders,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to reconcile Jenga payment";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

