import { NextRequest, NextResponse } from 'next/server';
import { generateVatRemittanceReport } from '@/lib/actions/vat.actions';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    
    // Default to current month if dates not provided
    if (!startDate || !endDate) {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      startDate = firstDayOfMonth.toISOString().split('T')[0];
      endDate = lastDayOfMonth.toISOString().split('T')[0];
      console.log(`Using default date range: ${startDate} to ${endDate}`);
    }

    const result = await generateVatRemittanceReport({
      startDate,
      endDate
    });
    
    if (!result.success || !result.report) {
      return NextResponse.json({ error: result.error || 'Failed to generate report' }, { status: 500 });
    }
    
    return NextResponse.json(result.report);
  } catch (error) {
    console.error('Error generating VAT report:', error);
    return NextResponse.json({ error: 'Failed to generate VAT report' }, { status: 500 });
  }
}
