"use client";

export type ActiveWaiterSession = {
    sessionId: string;
    waiterUserId: string;
    waiterName: string;
    verifiedAt: string;
    lastActiveAt: string;
};

const STORAGE_KEY = "central_pos_waiter_session_v1";

export function loadActiveWaiterSession(): ActiveWaiterSession | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<ActiveWaiterSession>;
        if (!parsed || typeof parsed !== "object") return null;
        if (!parsed.sessionId || !parsed.waiterUserId || !parsed.waiterName) return null;
        return {
            sessionId: String(parsed.sessionId),
            waiterUserId: String(parsed.waiterUserId),
            waiterName: String(parsed.waiterName),
            verifiedAt: String(parsed.verifiedAt || new Date().toISOString()),
            lastActiveAt: String(parsed.lastActiveAt || new Date().toISOString()),
        };
    } catch {
        return null;
    }
}

export function saveActiveWaiterSession(session: ActiveWaiterSession): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearActiveWaiterSession(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
}

export function touchActiveWaiterSession(): ActiveWaiterSession | null {
    const existing = loadActiveWaiterSession();
    if (!existing) return null;
    const next: ActiveWaiterSession = {
        ...existing,
        lastActiveAt: new Date().toISOString(),
    };
    saveActiveWaiterSession(next);
    return next;
}

