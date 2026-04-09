const TERMINAL_INSTALL_ID_KEY = "pos_terminal_install_id_v1";

function randomIdPart(): string {
    return Math.random().toString(36).slice(2, 10);
}

/**
 * Stable client terminal/device identifier for audit and idempotency.
 * Stored in localStorage and reused across sessions on the same tablet/browser.
 */
export function getOrCreateTerminalInstallId(): string {
    if (typeof window === "undefined") return "server";

    const existing = window.localStorage.getItem(TERMINAL_INSTALL_ID_KEY);
    if (existing && existing.trim() !== "") return existing;

    const created = `term-${Date.now().toString(36)}-${randomIdPart()}${randomIdPart()}`;
    window.localStorage.setItem(TERMINAL_INSTALL_ID_KEY, created);
    return created;
}

