/**
 * Short, plain-language copy for POS settlement flows.
 * Keep sentences scannable on a busy tablet shift.
 */

export const STAFF_GUIDE_SETTLE_TAB_LIST: string[] = [
    "Select every open order this guest is paying for on this visit. If you miss one, that tab stays unpaid.",
    "Think of each listed order as its own ticket on the rail—only tick the ones going out together on this payment.",
    "Cash, PDQ, or M-Pesa Paybill opens split entry. Prompt sends the guest to checkout in the browser (card / mobile money).",
    "Charge Selected settles only ticked orders. Charge All pays every order in this list—pause if you are not sure.",
];

export const STAFF_GUIDE_SETTLE_SPLIT: string[] = [
    "Add one row per way the guest paid. Example: part cash + part M-Pesa Paybill = two rows; amounts must add up to the bill.",
    "The running total must turn green and match the bill before Confirm. Use the quick actions if you are short by a few shillings.",
    "M-Pesa Paybill: use the confirmation code from the guest’s SMS. PDQ: use the approval code on the card machine receipt.",
    "Cash rows do not need a code. If you are unsure, ask a supervisor before confirming—settlement is logged for audit.",
];

export const STAFF_GUIDE_PAY_NOW: string[] = [
    "This screen records payment for the single order you are closing from the cart.",
    "Enter what actually happened: cash received (you can type more than the bill—we record change in the reference), PDQ code, or M-Pesa SMS code.",
    "Prompt opens secure checkout in the browser; the order is marked paid when the guest completes it.",
    "If the guest split across two methods on one bill, finish this order then use Settle Tab to split across methods, or ask a supervisor.",
];

/** Microcopy under fields in split rows */
export const SPLIT_HINT_CASH =
    "Only the cash amount for this row. Add another row if they also paid by card or M-Pesa.";
export const SPLIT_HINT_PDQ =
    "Digits from the card terminal slip—usually at least 4 characters.";
export const SPLIT_HINT_MPESA =
    "Letters and numbers from the M-Pesa confirmation SMS—usually at least 6 characters.";

export const PAY_NOW_HINT_CASH =
    "Type how much the guest handed you. It must be at least the bill; extra is treated as change in the payment record.";
export const PAY_NOW_HINT_PDQ =
    "Use the approval / auth code printed on the card slip (at least 4 characters).";
export const PAY_NOW_HINT_MPESA =
    "Same code as in the M-Pesa SMS confirmation (at least 6 characters).";
export const PAY_NOW_HINT_PROMPT =
    "Optional phone helps fill the checkout email. The guest completes payment in the browser; do not close the tab early.";
