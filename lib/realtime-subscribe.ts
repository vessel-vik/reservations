"use client";

type Unsubscribe = () => void;

function isRetryableRealtimeError(error: unknown): boolean {
    const msg = String(
        error instanceof Error ? error.message : error || ""
    ).toLowerCase();
    return (
        msg.includes("connecting state") ||
        msg.includes("still in connecting") ||
        msg.includes("closing state") ||
        msg.includes("closed state") ||
        msg.includes("websocket")
    );
}

/**
 * Appwrite subscribe wrapper that retries short-lived websocket state races.
 */
export function subscribeWithRetry(
    subscribe: () => Unsubscribe,
    options?: { maxAttempts?: number; initialDelayMs?: number }
): Unsubscribe {
    const maxAttempts = Math.max(1, options?.maxAttempts ?? 4);
    const initialDelayMs = Math.max(50, options?.initialDelayMs ?? 150);

    let cancelled = false;
    let activeUnsubscribe: Unsubscribe | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
        if (cancelled) return;
        try {
            activeUnsubscribe = subscribe();
        } catch (error) {
            if (!isRetryableRealtimeError(error) || attempt >= maxAttempts - 1) {
                throw error;
            }
            attempt += 1;
            const delay = initialDelayMs * Math.pow(2, attempt - 1);
            timer = setTimeout(connect, delay);
        }
    };

    connect();

    return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        if (activeUnsubscribe) {
            try {
                activeUnsubscribe();
            } catch {
                // Ignore websocket close races during teardown.
            }
        }
    };
}

