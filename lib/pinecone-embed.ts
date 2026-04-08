function decodeBase64ToUint8Array(b64: string): Uint8Array {
    const raw = b64.trim();
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(raw, "base64"));
    }
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * Deterministic 384-d (or `dimensions`) vector from a bottle/cash photo (data URL or raw base64).
 * Same bytes → same embedding (for Pinecone similarity of re-captures). Not a learned vision model.
 */
export function embeddingFromImageDataUrl(dataUrlOrBase64: string, dimensions: number): number[] {
    const trimmed = dataUrlOrBase64.trim();
    const m = /^data:image\/\w+;base64,(.+)$/i.exec(trimmed);
    const b64 = m ? m[1] : trimmed;
    let bytes: Uint8Array;
    try {
        bytes = decodeBase64ToUint8Array(b64);
    } catch {
        return pseudoEmbedding(trimmed, dimensions);
    }
    if (bytes.length < 32) return pseudoEmbedding(trimmed, dimensions);

    let h = bytes.length >>> 0;
    const step = Math.max(1, Math.floor(bytes.length / 128));
    for (let i = 0; i < bytes.length; i += step) {
        h = (Math.imul(31, h) + bytes[i]) >>> 0;
    }

    const v: number[] = [];
    let seed = h >>> 0;
    for (let i = 0; i < dimensions; i++) {
        const idx = bytes.length ? (seed + i * 13) % bytes.length : 0;
        seed = (Math.imul(1103515245, seed) + bytes[idx]) >>> 0;
        v.push((seed / 0xffffffff) * 2 - 1);
    }
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / mag);
}

/** Deterministic pseudo-embedding for dev / fallback when OpenAI is not configured. */
export function pseudoEmbedding(text: string, dimensions: number): number[] {
    const norm = text.trim().toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < norm.length; i++) {
        h ^= norm.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const v: number[] = [];
    let seed = h >>> 0;
    for (let i = 0; i < dimensions; i++) {
        seed = (Math.imul(1103515245, seed) + 12345) >>> 0;
        v.push((seed / 0xffffffff) * 2 - 1);
    }
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / mag);
}
