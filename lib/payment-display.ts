/**
 * Human-readable payment method labels for POS UI and receipts.
 * Stored `method` values stay stable (cash, pdq, mpesa, paystack).
 */
export function displayPaymentMethod(method: string | undefined | null): string {
    const m = String(method || "").toLowerCase().trim();
    if (m === "mpesa") return "M-Pesa Paybill";
    if (m === "bank_paybill" || m === "jenga") return "Bank Paybill (Equity)";
    if (m === "paystack") return "Prompt";
    if (m === "pdq") return "PDQ";
    if (m === "cash") return "Cash";
    if (!m) return "Payment";
    return method || "Payment";
}

/** Badge text for admin closed-order cards: method + formatted amount when present. */
export function formatPaymentMethodEntry(entry: {
    method?: string;
    amount?: number;
    reference?: string;
}): string {
    const label = displayPaymentMethod(entry.method);
    if (typeof entry.amount === "number" && Number.isFinite(entry.amount)) {
        return `${label} · KSh ${entry.amount.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
    }
    return label;
}
