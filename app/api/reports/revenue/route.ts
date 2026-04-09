import { NextResponse, NextRequest } from "next/server";
import { getRevenueByPeriod } from "@/lib/actions/admin.actions";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const daysStr = url.searchParams.get('days');
    
    let days = 7;
    if (daysStr) {
      days = parseInt(daysStr, 10);
      if (isNaN(days) || days <= 0) {
        return NextResponse.json({ error: 'days must be a positive integer' }, { status: 400 });
      }
    }

    const { success, data, totalRevenue } = await getRevenueByPeriod(days);

    if (!success) {
      return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
    }

    return NextResponse.json({ data, totalRevenue });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
  }
}
