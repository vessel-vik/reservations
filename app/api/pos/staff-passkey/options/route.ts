import { NextResponse } from "next/server";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";
import { listStaffPasskeyOptions } from "@/lib/pos-staff-passkeys";

export async function GET() {
    try {
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);
        const options = await listStaffPasskeyOptions(businessId);
        return NextResponse.json({ options });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load staff passkeys";
        const status = msg.includes("UNAUTHORIZED") ? 401 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

