"use server";

import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

interface InitializeTransactionParams {
    email: string;
    amount: number; // Amount in KES
    orderId: string;
    metadata?: Record<string, any>;
}

interface InitializeTransactionResponse {
    success: boolean;
    access_code?: string;
    reference?: string;
    authorization_url?: string;
    error?: string;
}

interface VerifyTransactionResponse {
    success: boolean;
    data?: {
        status: string;
        amount: number;
        reference: string;
        paid_at: string;
        channel: string;
        currency: string;
    };
    error?: string;
}

/**
 * Initialize Paystack transaction (Server-side only)
 * Converts KES to cents and creates transaction
 */
export async function initializePaystackTransaction({
    email,
    amount,
    orderId,
    metadata = {}
}: InitializeTransactionParams): Promise<InitializeTransactionResponse> {
    try {
        if (!PAYSTACK_SECRET_KEY) {
            throw new Error("Paystack secret key not configured");
        }

        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        // Convert KES to cents (Paystack expects smallest currency unit)
        const amountInCents = Math.round(amount * 100);

        const payload = {
            email,
            amount: amountInCents,
            currency: "KES",
            reference: `ORDER_${orderId}_${Date.now()}`,
            metadata: {
                businessId,
                orderId,
                ...metadata
            },
            channels: ["card", "mobile_money", "bank_transfer"] // Available payment methods
        };

        const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok || !result.status) {
            console.error("Paystack initialization error:", result);
            return {
                success: false,
                error: result.message || "Failed to initialize payment"
            };
        }

        return {
            success: true,
            access_code: result.data.access_code,
            reference: result.data.reference,
            authorization_url: result.data.authorization_url
        };
    } catch (error) {
        console.error("Error initializing Paystack transaction:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}

/**
 * Verify Paystack transaction (Server-side only)
 * CRITICAL: Always verify before delivering value
 */
export async function verifyPaystackTransaction(
    reference: string
): Promise<VerifyTransactionResponse> {
    try {
        if (!PAYSTACK_SECRET_KEY) {
            throw new Error("Paystack secret key not configured");
        }

        const response = await fetch(
            `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                },
            }
        );

        const result = await response.json();

        if (!response.ok || !result.status) {
            console.error("Paystack verification error:", result);
            return {
                success: false,
                error: result.message || "Failed to verify payment"
            };
        }

        // Extract critical data
        const transactionData = result.data;

        return {
            success: true,
            data: {
                status: transactionData.status,
                amount: transactionData.amount / 100, // Convert cents back to KES
                reference: transactionData.reference,
                paid_at: transactionData.paid_at,
                channel: transactionData.channel,
                currency: transactionData.currency
            }
        };
    } catch (error) {
        console.error("Error verifying Paystack transaction:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error"
        };
    }
}
