/**
 * Opens Paystack checkout using a server-issued access_code.
 * Supports both InlineJS patterns seen in the wild (constructor + resumeTransaction, or setup + openIframe).
 */
export function openPaystackWithAccessCode(
    accessCode: string,
    handlers: {
        onSuccess: (reference: string) => void | Promise<void>;
        onCancel: () => void;
        onError: (message: string) => void;
    }
): void {
    if (typeof window === "undefined") {
        handlers.onError("Paystack can only open in the browser.");
        return;
    }

    const PaystackGlobal = (window as unknown as { PaystackPop?: unknown }).PaystackPop;

    if (!PaystackGlobal) {
        handlers.onError("Paystack checkout is not loaded. Wait a moment and try again.");
        return;
    }

    const wrapSuccess = (payload: unknown) => {
        const p = payload as Record<string, unknown> | string | undefined;
        let reference: string | undefined;
        if (typeof p === "string") reference = p;
        else if (p && typeof p === "object") {
            reference =
                (p.reference as string) ||
                (p.trxref as string) ||
                (p.transactionRef as string);
        }
        if (!reference) {
            handlers.onError("Paystack did not return a payment reference.");
            return;
        }
        void Promise.resolve(handlers.onSuccess(reference)).catch(() => {});
    };

    const Pop = PaystackGlobal as any;

    // Prefer the modern constructor API (v2 inline.js) — avoids the "setup() deprecated" warning
    if (typeof Pop === "function") {
        try {
            const instance = new Pop();
            if (typeof instance.resumeTransaction === "function") {
                instance.resumeTransaction(accessCode, {
                    onSuccess: (transaction: { reference?: string }) =>
                        wrapSuccess(transaction?.reference ? transaction : transaction),
                    onCancel: () => handlers.onCancel(),
                    onError: (err: { message?: string }) =>
                        handlers.onError(err?.message || "Paystack failed."),
                });
                return;
            }
        } catch {
            // constructor failed — fall through to legacy setup() path
        }
    }

    // Legacy fallback: setup() / openIframe() (v1 inline.js)
    if (typeof Pop.setup === "function") {
        const modal = Pop.setup({
            access_code: accessCode,
            onSuccess: (ref: unknown) => wrapSuccess(ref),
            onCancel: () => handlers.onCancel(),
            onError: (err: unknown) => {
                const msg =
                    err && typeof err === "object" && "message" in err
                        ? String((err as { message: string }).message)
                        : "Paystack error";
                handlers.onError(msg);
            },
        });
        if (modal?.openIframe) { modal.openIframe(); return; }
        if (modal?.open) { modal.open(); return; }
    }

    handlers.onError("Unsupported Paystack script on this page. Check js.paystack.co is loaded.");
}
