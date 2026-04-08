import { NextRequest, NextResponse } from "next/server";
import { assertCashVerificationFileForOrg } from "@/lib/actions/cash-verification-list.actions";
import { storage, BUCKET_ID } from "@/lib/appwrite.config";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    try {
        const { fileId } = await params;
        if (!fileId?.trim()) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
        }
        if (!BUCKET_ID) {
            return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
        }

        const allowed = await assertCashVerificationFileForOrg(fileId.trim());
        if (!allowed) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const buf = await storage.getFileDownload(BUCKET_ID, fileId.trim());
        const body = buf instanceof Buffer ? buf : Buffer.from(buf as ArrayBuffer);

        return new NextResponse(body, {
            status: 200,
            headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "private, max-age=300",
            },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Preview failed";
        if (msg.includes("FORBIDDEN")) {
            return NextResponse.json({ error: msg }, { status: 403 });
        }
        if (msg.includes("UNAUTHORIZED")) {
            return NextResponse.json({ error: msg }, { status: 401 });
        }
        console.error("[cash-verification preview]", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
