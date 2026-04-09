import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";
import { verifyStaffPasskey } from "@/lib/pos-staff-passkeys";

export async function POST(request: NextRequest) {
    try {
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);
        const body = await request.json().catch(() => ({}));
        const pin = String(body?.pin || "").trim();
        if (!pin) {
            return NextResponse.json({ error: "PIN is required" }, { status: 400 });
        }
        const verified = await verifyStaffPasskey(businessId, pin);
        if (!verified) {
            return NextResponse.json({ error: "Invalid staff passkey" }, { status: 401 });
        }
        return NextResponse.json({
            success: true,
            waiterUserId: verified.waiterUserId,
            waiterName: verified.waiterName,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to verify staff passkey";
        const status = msg.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

