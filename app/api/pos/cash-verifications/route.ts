import { NextRequest, NextResponse } from "next/server";
import { listCashVerificationsForAdmin } from "@/lib/actions/cash-verification-list.actions";

export async function GET(request: NextRequest) {
    try {
        const raw = request.nextUrl.searchParams.get("limit");
        const n = raw ? parseInt(raw, 10) : 50;
        const limit = Number.isFinite(n) ? Math.min(Math.max(n, 1), 100) : 50;
        const verifications = await listCashVerificationsForAdmin(limit);
        return NextResponse.json({ verifications });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to list cash verifications";
        if (msg.includes("FORBIDDEN")) {
            return NextResponse.json({ error: msg }, { status: 403 });
        }
        if (msg.includes("UNAUTHORIZED")) {
            return NextResponse.json({ error: msg }, { status: 401 });
        }
        console.error("[cash-verifications GET]", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
