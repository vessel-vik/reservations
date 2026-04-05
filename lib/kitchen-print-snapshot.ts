/**
 * Tracks what has already been sent to the kitchen via [KITCHEN_PRINTED] lines in specialInstructions
 * (no extra Appwrite attributes). Delta printing only emits quantity increases and new lines.
 */

export const KITCHEN_PRINTED_PREFIX = "[KITCHEN_PRINTED]";

export type KitchenLine = { i: string; q: number; n?: string };

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
    const lines = String(specialInstructions || "").split("\n");
    let last: KitchenLine[] = [];
    for (const line of lines) {
        if (!line.startsWith(KITCHEN_PRINTED_PREFIX)) continue;
        const jsonPart = line.slice(KITCHEN_PRINTED_PREFIX.length).trim();
        try {
            const parsed = JSON.parse(jsonPart) as { v?: number; lines?: unknown };
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
        } catch {
            /* ignore malformed */
        }
    }
    return last;
}

export function buildKitchenPrintedLine(lines: KitchenLine[]): string {
    const payload = JSON.stringify({ v: 1, lines });
    return `\n${KITCHEN_PRINTED_PREFIX}${payload}`;
}

export function mergeKitchenSnapshotIntoSpecialInstructions(
    previousSpecialInstructions: string,
    newSnapshot: KitchenLine[]
): string {
    const base = stripKitchenPrintedLines(previousSpecialInstructions || "");
    const addition = buildKitchenPrintedLine(newSnapshot);
    return `${base}${addition}`.slice(0, 950);
}

export type KitchenDeltaItem = { name: string; quantity: number };

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
        const want = Math.max(0, Math.floor(Number(p.quantity) || 1));
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
