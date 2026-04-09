export type ReferenceMethod = "cash" | "pdq" | "mpesa" | "paystack" | "bank_paybill" | "jenga";

/**
 * M-Pesa confirmation codes in Kenya are typically 10-char alphanumeric tokens.
 * We enforce strict uppercase A-Z/0-9, length 10.
 */
const MPESA_CODE_RE = /^[A-Z0-9]{10}$/;

/**
 * Card flows vary by processor:
 * - Approval code (ISO8583 DE38): often 6 chars
 * - Retrieval ref (ISO8583 DE37): often 12 chars
 * Accept either 6 or 12 alphanumeric.
 */
const PDQ_CODE_RE = /^(?:[A-Z0-9]{6}|[A-Z0-9]{12})$/;
const BANK_PAYBILL_REF_RE = /^[A-Z0-9]{6,24}$/;

export function normalizeReference(input: string | undefined | null): string {
    return String(input || "").trim().toUpperCase();
}

export function validateReferenceForMethod(
    method: ReferenceMethod,
    input: string | undefined | null
): { valid: boolean; message?: string } {
    const ref = normalizeReference(input);

    if (method === "cash" || method === "paystack") {
        return { valid: true };
    }

    if (method === "bank_paybill" || method === "jenga") {
        if (!BANK_PAYBILL_REF_RE.test(ref)) {
            return {
                valid: false,
                message:
                    "Bank paybill reference must be 6-24 letters/numbers.",
            };
        }
        return { valid: true };
    }

    if (method === "mpesa") {
        if (!MPESA_CODE_RE.test(ref)) {
            return {
                valid: false,
                message:
                    "M-Pesa code must be exactly 10 letters/numbers (e.g. RGH12345XY).",
            };
        }
        return { valid: true };
    }

    // PDQ
    if (!PDQ_CODE_RE.test(ref)) {
        return {
            valid: false,
            message:
                "PDQ reference must be 6 or 12 letters/numbers (approval or retrieval code).",
        };
    }
    return { valid: true };
}

