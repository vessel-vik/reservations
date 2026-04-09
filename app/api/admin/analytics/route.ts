import { NextResponse } from "next/server";
import { getAdminAnalytics } from "@/lib/actions/admin.actions";
import { Analytics } from "@vercel/analytics/next";

// Enable ISR with 30 second revalidation
export const revalidate = 30;

export async function GET() {
  try {
    console.log("🔍 Admin API: Fetching real-time POS analytics...");
    
    const analytics = await getAdminAnalytics();
    
    if (!analytics.success) {
      console.error("❌ Admin API: Failed to fetch analytics");
      return NextResponse.json(
        { error: analytics.error || 'Failed to fetch analytics' },
        { status: 500 }
      );
    }

    console.log("✅ Admin API: Analytics fetched successfully:", {
      todayOrders: analytics.today?.orders ?? 0,
      todayRevenue: analytics.today?.revenue ?? 0,
      peakTime: analytics.peakHours?.time ?? null,
      topProductsCount: analytics.topProducts?.length ?? 0
    });

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("❌ Admin API: Unexpected error:", error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
