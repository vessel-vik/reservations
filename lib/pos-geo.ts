export type GeoSnapshot = {
    lat: number;
    lng: number;
    accuracy?: number;
};

export function collectGeoSnapshot(timeoutMs = 8000): Promise<GeoSnapshot | null> {
    if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.geolocation) {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        const t = window.setTimeout(() => resolve(null), timeoutMs);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                window.clearTimeout(t);
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy ?? undefined,
                });
            },
            () => {
                window.clearTimeout(t);
                resolve(null);
            },
            { enableHighAccuracy: true, maximumAge: 60_000, timeout: timeoutMs }
        );
    });
}
