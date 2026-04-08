import { Pinecone } from "@pinecone-database/pinecone";

export function getPineconeClient(): Pinecone | null {
    const key = process.env.PINECONE_API_KEY;
    if (!key) return null;
    return new Pinecone({ apiKey: key });
}

export function pineconeIndexDims(): number {
    const n = parseInt(process.env.PINECONE_DIMENSIONS || "384", 10);
    return Number.isFinite(n) && n > 0 ? n : 384;
}
