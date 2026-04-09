import { validateReferenceForMethod } from "@/lib/payment-reference-policy";

export type SplitRowLike = {
    method: "cash" | "pdq" | "mpesa" | "bank_paybill";
    amount: string;
    reference: string;
};

const SPLIT_EPS = 0.05;

type FormatMoney = (amount: number) => string;

/**
 * Human-readable blockers for split settlement UI (show in-panel, not only toasts).
 */
export function getSplitBlockingMessages(
    rows: SplitRowLike[],
    due: number,
    formatMoney: FormatMoney
): string[] {
    const messages: string[] = [];

    if (rows.length === 0) {
        messages.push("Add at least one payment line.");
        return messages;
    }

    let anyAmount = false;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const amt = parseFloat(row.amount) || 0;
        if (amt > 0) anyAmount = true;
        if (amt <= 0) {
            messages.push(`Line ${i + 1}: enter an amount greater than zero.`);
        }
        if (row.method === "pdq" && row.reference.trim().length === 0 && amt > 0) {
            messages.push(`Line ${i + 1}: enter the PDQ / card approval code.`);
        } else if (row.method === "pdq" && row.reference.trim().length > 0 && amt > 0) {
            const v = validateReferenceForMethod("pdq", row.reference);
            if (!v.valid) messages.push(`Line ${i + 1}: ${v.message}`);
        }
        if (row.method === "mpesa" && row.reference.trim().length === 0 && amt > 0) {
            messages.push(`Line ${i + 1}: enter the M-Pesa confirmation code from the SMS.`);
        } else if (row.method === "mpesa" && row.reference.trim().length > 0 && amt > 0) {
            const v = validateReferenceForMethod("mpesa", row.reference);
            if (!v.valid) messages.push(`Line ${i + 1}: ${v.message}`);
        }
        if (row.method === "bank_paybill" && row.reference.trim().length === 0 && amt > 0) {
            messages.push(`Line ${i + 1}: enter the bank paybill transaction reference.`);
        } else if (row.method === "bank_paybill" && row.reference.trim().length > 0 && amt > 0) {
            const v = validateReferenceForMethod("bank_paybill", row.reference);
            if (!v.valid) messages.push(`Line ${i + 1}: ${v.message}`);
        }
    }

    if (!anyAmount) {
        messages.push("Enter amounts so the lines add up to the bill.");
    }

    const sum = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    if (anyAmount && Math.abs(sum - due) > SPLIT_EPS) {
        if (sum < due - SPLIT_EPS) {
            messages.push(
                `Still ${formatMoney(due - sum)} short—the lines must total ${formatMoney(due)}. Use “Apply remainder” or fix amounts.`
            );
        } else {
            messages.push(
                `Over by ${formatMoney(sum - due)}—reduce a line or remove one so the total is ${formatMoney(due)}.`
            );
        }
    }

    return messages;
}

export function splitTotalsBalanced(rows: SplitRowLike[], due: number): boolean {
    const sum = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    return rows.length > 0 && Math.abs(sum - due) <= SPLIT_EPS;
}
