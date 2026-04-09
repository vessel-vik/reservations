/**
 * Tracks what has already been sent to the kitchen via [KITCHEN_PRINTED] lines in specialInstructions
 * (no extra Appwrite attributes). Delta printing only emits quantity increases and new lines.
 */

export const KITCHEN_PRINTED_PREFIX = "[KITCHEN_PRINTED]";
export const KITCHEN_SNAPSHOT_MIN_VERSION = 1;

export type KitchenLine = { i: string; q: number; n?: string };
export type KitchenSnapshotMeta = { lines: KitchenLine[]; snapshotVersion: number };

export function linesFromCartItems(items: unknown[]): KitchenLine[] {
    if (!Array.isArray(items)) return [];
    return items
        .map((it: any) => ({
            i: String(it?.$id || "").trim(),
            q: Math.max(0, Math.floor(Number(it?.quantity) || 1)),
            // n intentionally omitted — specialInstructions is capped at 1000 chars
        }))
        .filter((l) => l.i.length > 0 && l.q > 0);
}

export function stripKitchenPrintedLines(text: string): string {
    return (text || "")
        .split("\n")
        .filter((line) => !line.startsWith(KITCHEN_PRINTED_PREFIX))
        .join("\n")
        .trimEnd();
}

/** Parse the last [KITCHEN_PRINTED] line (most recent snapshot wins). */
export function parseLastKitchenSnapshot(specialInstructions: string): KitchenLine[] {
    return parseLastKitchenSnapshotMeta(specialInstructions).lines;
}

/** Parse the last snapshot and return both lines and monotonic snapshotVersion. */
export function parseLastKitchenSnapshotMeta(specialInstructions: string): KitchenSnapshotMeta {
    const lines = String(specialInstructions || "").split("\n");
    let last: KitchenLine[] = [];
    let snapshotVersion = KITCHEN_SNAPSHOT_MIN_VERSION;
    for (const line of lines) {
        if (!line.startsWith(KITCHEN_PRINTED_PREFIX)) continue;
        const jsonPart = line.slice(KITCHEN_PRINTED_PREFIX.length).trim();
        try {
            const parsed = JSON.parse(jsonPart) as { v?: number; sv?: number; lines?: unknown };
            if (!Array.isArray(parsed.lines)) continue;
            const normalized: KitchenLine[] = [];
            for (const row of parsed.lines) {
                const r = row as Record<string, unknown>;
                const i = String(r.i || "").trim();
                const q = Math.max(0, Math.floor(Number(r.q) || 0));
                if (!i || q <= 0) continue;
                normalized.push({ i, q, n: r.n != null ? String(r.n).slice(0, 120) : undefined });
            }
            last = normalized;
            const rawSv = Number(parsed.sv ?? parsed.v ?? KITCHEN_SNAPSHOT_MIN_VERSION);
            snapshotVersion =
                Number.isFinite(rawSv) && rawSv >= KITCHEN_SNAPSHOT_MIN_VERSION
                    ? Math.floor(rawSv)
                    : KITCHEN_SNAPSHOT_MIN_VERSION;
        } catch {
            /* ignore malformed */
        }
    }
    return { lines: last, snapshotVersion };
}

export function buildKitchenPrintedLine(lines: KitchenLine[], snapshotVersion = KITCHEN_SNAPSHOT_MIN_VERSION): string {
    const safeSv =
        Number.isFinite(snapshotVersion) && snapshotVersion >= KITCHEN_SNAPSHOT_MIN_VERSION
            ? Math.floor(snapshotVersion)
            : KITCHEN_SNAPSHOT_MIN_VERSION;
    const payload = JSON.stringify({ v: 1, sv: safeSv, lines: sanitizeSnapshotLines(lines) });
    return `\n${KITCHEN_PRINTED_PREFIX}${payload}`;
}

function sanitizeSnapshotLines(lines: KitchenLine[]): KitchenLine[] {
    if (!Array.isArray(lines)) return [];
    return lines
        .map((row) => ({
            i: String(row?.i || "").trim(),
            q: Math.max(0, Math.floor(Number(row?.q) || 0)),
        }))
        .filter((row) => row.i.length > 0 && row.q > 0);
}

export function mergeKitchenSnapshotIntoSpecialInstructions(
    previousSpecialInstructions: string,
    newSnapshot: KitchenLine[],
    snapshotVersion = KITCHEN_SNAPSHOT_MIN_VERSION
): string {
    const base = stripKitchenPrintedLines(previousSpecialInstructions || "");
    const maxLength = 950;
    const cleaned = sanitizeSnapshotLines(newSnapshot);

    // Keep shrinking payload until it fits rather than slicing a JSON line mid-string.
    for (let i = cleaned.length; i >= 0; i -= 1) {
        const addition = buildKitchenPrintedLine(cleaned.slice(0, i), snapshotVersion);
        const merged = `${base}${addition}`;
        if (merged.length <= maxLength) return merged;
    }

    // Absolute fallback: only keep the non-kitchen content.
    return base.slice(0, maxLength);
}

export type KitchenDeltaItem = { itemId?: string; name: string; quantity: number };
export type KitchenAnomalyItem = { itemId?: string; name: string; quantity: number; note?: string };

/**
 * Compare proposed cart to last printed snapshot. Only positive quantity deltas go to the printer.
 * New snapshot always reflects the full proposed cart (cumulative truth for the tab).
 */
export function computeKitchenDelta(
    snapshot: KitchenLine[],
    proposed: { $id: string; quantity: number; name: string }[]
): { deltaItems: KitchenDeltaItem[]; newSnapshot: KitchenLine[] } {
    const prevQty = new Map<string, number>();
    for (const row of snapshot) {
        prevQty.set(row.i, Math.max(0, row.q));
    }

    const deltaItems: KitchenDeltaItem[] = [];
    for (const p of proposed) {
        const id = String(p.$id || "").trim();
        if (!id) continue;
        const rawQty = Number(p.quantity);
        const want = Math.max(0, Math.floor(Number.isFinite(rawQty) ? rawQty : 1));
        const was = prevQty.get(id) ?? 0;
        const dq = want - was;
        if (dq > 0) {
            deltaItems.push({
                name: (p.name || "Item").slice(0, 80),
                quantity: dq,
            });
        }
    }

    const newSnapshot = proposed
        .filter((p) => String(p.$id || "").trim())
        .map((p) => ({
            i: String(p.$id).trim(),
            q: Math.max(0, Math.floor(Number(p.quantity) || 1)),
            // n intentionally omitted
        }));

    return { deltaItems, newSnapshot };
}

/**
 * Full print diff against last printed snapshot.
 * - `deltaItems`: new work to fire (quantity up / new lines)
 * - `anomalyItems`: quantity down / removed lines after snapshot was already printed
 * - `newSnapshot`: full proposed state (becomes the next printed truth)
 */
export function computeKitchenPrintChanges(
    snapshot: KitchenLine[],
    proposed: { $id: string; quantity: number; name: string }[]
): {
    deltaItems: KitchenDeltaItem[];
    anomalyItems: KitchenAnomalyItem[];
    newSnapshot: KitchenLine[];
} {
    const prevQty = new Map<string, number>();
    for (const row of snapshot) {
        prevQty.set(row.i, Math.max(0, row.q));
    }

    const nextQty = new Map<string, number>();
    for (const p of proposed) {
        const id = String(p.$id || "").trim();
        if (!id) continue;
        const rawQty = Number(p.quantity);
        nextQty.set(id, Math.max(0, Math.floor(Number.isFinite(rawQty) ? rawQty : 1)));
    }

    const deltaItems: KitchenDeltaItem[] = [];
    const anomalyItems: KitchenAnomalyItem[] = [];

    for (const p of proposed) {
        const id = String(p.$id || "").trim();
        if (!id) continue;
        const rawQty = Number(p.quantity);
        const want = Math.max(0, Math.floor(Number.isFinite(rawQty) ? rawQty : 1));
        const was = prevQty.get(id) ?? 0;
        const dq = want - was;
        const safeName = String(p.name || "Item").slice(0, 80);
        if (dq > 0) {
            deltaItems.push({ itemId: id, name: safeName, quantity: dq });
        } else if (dq < 0) {
            anomalyItems.push({
                itemId: id,
                name: safeName,
                quantity: Math.abs(dq),
                note: "Customer requested to return item",
            });
        }
    }

    // Removed lines (present in printed snapshot, now absent) are anomalies too.
    for (const row of snapshot) {
        const id = String(row.i || "").trim();
        if (!id) continue;
        if (!nextQty.has(id) && row.q > 0) {
            anomalyItems.push({
                itemId: id,
                name: row.n?.slice(0, 80) || "Item",
                quantity: row.q,
                note: "Customer requested to return item",
            });
        }
    }

    const newSnapshot = proposed
        .filter((p) => String(p.$id || "").trim())
        .map((p) => ({
            i: String(p.$id).trim(),
            q: Math.max(0, Math.floor(Number(p.quantity) || 1)),
        }));

    return { deltaItems, anomalyItems, newSnapshot };
}
