type PaymentMethodLine = {
    method?: string;
    amount?: number;
    reference?: string;
    settledAt?: string;
};

type OrderLike = {
    paymentStatus?: string;
    paymentMethods?: unknown;
    $updatedAt?: string;
};

export type BankPaybillConfirmation = {
    method: string;
    amount: number;
    reference: string;
    settledAt: string;
};

type ExtractOptions = {
    referenceContains?: string;
};

function parsePaymentMethods(raw: unknown): PaymentMethodLine[] {
    if (Array.isArray(raw)) return raw as PaymentMethodLine[];
    if (typeof raw !== "string" || raw.trim() === "") return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as PaymentMethodLine[]) : [];
    } catch {
        return [];
    }
}

function toTimestamp(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : fallback;
}

export function extractBankPaybillConfirmation(
    order: OrderLike | null | undefined,
    options?: ExtractOptions
): BankPaybillConfirmation | null {
    if (!order || typeof order !== "object") return null;
    const status = String(order.paymentStatus || "").toLowerCase().trim();
    if (status !== "paid" && status !== "settled") return null;

    const methods = parsePaymentMethods(order.paymentMethods);
    if (methods.length === 0) return null;

    const filterToken = String(options?.referenceContains || "").trim().toUpperCase();
    const bankLines = methods
        .map((line) => ({
            method: String(line.method || "").toLowerCase().trim(),
            amount: Number(line.amount) || 0,
            reference: String(line.reference || "").trim(),
            settledAt: String(line.settledAt || "").trim(),
        }))
        .filter(
            (line) =>
                (line.method === "bank_paybill" || line.method === "jenga") &&
                line.reference &&
                line.amount > 0 &&
                (filterToken === "" || line.reference.toUpperCase().includes(filterToken))
        );

    if (bankLines.length === 0) return null;

    const fallbackTs = toTimestamp(order.$updatedAt, 0);
    bankLines.sort((a, b) => toTimestamp(b.settledAt, fallbackTs) - toTimestamp(a.settledAt, fallbackTs));
    const match = bankLines[0];
    if (!match) return null;

    return {
        method: match.method,
        amount: match.amount,
        reference: match.reference,
        settledAt: match.settledAt || String(order.$updatedAt || ""),
    };
}

