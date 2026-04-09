const STORAGE_KEY = "ampm_pos_device_install_id";

/** Stable per-browser install ID for fraud metadata (client-only). */
export function getOrCreateDeviceInstallId(): string {
    if (typeof window === "undefined") return "";
    try {
        let id = localStorage.getItem(STORAGE_KEY);
        if (!id) {
            id =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
            localStorage.setItem(STORAGE_KEY, id);
        }
        return id;
    } catch {
        return `ephemeral-${Date.now()}`;
    }
}
