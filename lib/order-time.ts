/**
 * Resolve a reliable epoch (ms) for "when did this order start" for ageing / UI.
 * Prefer `orderTime`; fall back to Appwrite `$createdAt` if missing or invalid.
 */

export function resolveOrderTimestampMs(doc: {
  orderTime?: string | null;
  $createdAt?: string;
}): number {
  const tryParse = (raw: string | null | undefined): number | null => {
    if (raw == null || raw === "") return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  };

  const primary = tryParse(doc.orderTime ?? undefined);
  if (primary != null) return primary;

  const fallback = tryParse(doc.$createdAt);
  if (fallback != null) return fallback;

  return Date.now();
}

/** Minutes since order start; never negative; NaN-safe. */
export function computeOrderAgeMinutes(
  doc: { orderTime?: string | null; $createdAt?: string },
  nowMs: number = Date.now()
): number {
  const start = resolveOrderTimestampMs(doc);
  const raw = Math.floor((nowMs - start) / 60_000);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, raw);
}
