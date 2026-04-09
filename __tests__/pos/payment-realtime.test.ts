import { describe, expect, it } from "vitest";
import { extractBankPaybillConfirmation } from "@/lib/payment-realtime";

describe("extractBankPaybillConfirmation", () => {
    it("returns null for non-paid order payloads", () => {
        const result = extractBankPaybillConfirmation({
            paymentStatus: "unpaid",
            paymentMethods: [
                { method: "bank_paybill", amount: 1200, reference: "JENGA-ABC123", settledAt: "2026-04-09T10:00:00.000Z" },
            ],
        });
        expect(result).toBeNull();
    });

    it("extracts confirmed bank payment details from paid order payload", () => {
        const result = extractBankPaybillConfirmation(
            {
                paymentStatus: "paid",
                paymentMethods: [
                    { method: "cash", amount: 300, reference: "CASH-1", settledAt: "2026-04-09T09:59:00.000Z" },
                    { method: "bank_paybill", amount: 900, reference: "JENGA-ABC123", settledAt: "2026-04-09T10:00:00.000Z" },
                ],
                $updatedAt: "2026-04-09T10:00:10.000Z",
            },
            { referenceContains: "ABC123" }
        );

        expect(result).toEqual({
            amount: 900,
            method: "bank_paybill",
            reference: "JENGA-ABC123",
            settledAt: "2026-04-09T10:00:00.000Z",
        });
    });

    it("falls back to latest bank payment method when reference filter is missing", () => {
        const result = extractBankPaybillConfirmation({
            paymentStatus: "settled",
            paymentMethods: JSON.stringify([
                { method: "bank_paybill", amount: 400, reference: "JENGA-OLD", settledAt: "2026-04-09T08:00:00.000Z" },
                { method: "bank_paybill", amount: 600, reference: "JENGA-NEW", settledAt: "2026-04-09T10:00:00.000Z" },
            ]),
            $updatedAt: "2026-04-09T10:01:00.000Z",
        });

        expect(result?.reference).toBe("JENGA-NEW");
        expect(result?.amount).toBe(600);
    });
});
