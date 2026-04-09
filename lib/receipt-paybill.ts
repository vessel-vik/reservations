/**
 * AM | PM Lounge — customer-facing paybill / till instructions for receipts.
 * Matches operational Paybill card (Equity / M-Pesa / Airtel).
 */
export const RECEIPT_BUSINESS_NAME = "AMTOPM LOUNGE";

export const PAYBILL_INFO = {
    mpesaAirtelPaybill:
        process.env.NEXT_PUBLIC_RECEIPT_PAYBILL_NUMBER || "247247",
    mpesaAirtelAccount:
        process.env.NEXT_PUBLIC_RECEIPT_PAYBILL_ACCOUNT || "555045",
    mpesaAirtelAccountName:
        process.env.NEXT_PUBLIC_RECEIPT_PAYBILL_ACCOUNT_NAME || RECEIPT_BUSINESS_NAME,
    equityEquitelBusiness:
        process.env.NEXT_PUBLIC_RECEIPT_EQUITY_BUSINESS_NUMBER || "555045",
} as const;

/** Plain-text lines for web / modal receipts (thermal uses same content via route). */
export function buildPaybillReceiptLines(orderNumber: string): string[] {
    const ref = orderNumber?.trim() || "ORDER #";
    return [
        "──────── PAYMENT ────────",
        RECEIPT_BUSINESS_NAME,
        "",
        "M-PESA / AIRTEL MONEY",
        `Paybill / Business No: ${PAYBILL_INFO.mpesaAirtelPaybill}`,
        `Account No: ${PAYBILL_INFO.mpesaAirtelAccount}`,
        `Account Name: ${PAYBILL_INFO.mpesaAirtelAccountName}`,
        `Reference: ${ref}`,
        "",
        "EQUITY / EQUITEL (*247#)",
        `Business No: ${PAYBILL_INFO.equityEquitelBusiness}`,
        `Account: ${ref} (payment purpose)`,
        "────────────────────────",
    ];
}
