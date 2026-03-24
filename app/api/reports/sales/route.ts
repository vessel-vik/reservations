import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from '@/lib/appwrite.config';
import { Query } from 'appwrite';
import { parseStringify } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const paymentStatus = searchParams.get('paymentStatus') || 'paid';
    
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
      return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 });
    }

    const queries: any[] = [
      Query.equal('status', 'paid'),
      Query.notEqual('paymentStatus', 'settled'),
    ];
    
    // Filter by date range
    if (startDate && endDate) {
      queries.push(Query.greaterThanEqual('$createdAt', startDate));
      queries.push(Query.lessThanEqual('$createdAt', endDate));
    }
    
    queries.push(Query.orderDesc('$createdAt'));
    queries.push(Query.limit(500));

    const result = await databases.listDocuments(
      DATABASE_ID,
      ORDERS_COLLECTION_ID,
      queries
    );

    const orders = parseStringify(result.documents);
    console.log('[Sales API] Found orders:', orders.length);
    if (orders.length > 0) {
      console.log('[Sales API] First order keys:', Object.keys(orders[0]));
    }
    
    // Calculate summary - handle multiple field name variants
    const totalSales = orders.reduce((sum: number, order: any) => {
      return sum + (order.total || order.totalAmount || order.grandTotal || 0);
    }, 0);
    const totalVat = orders.reduce((sum: number, order: any) => {
      return sum + (order.vatAmount || order.taxAmount || 0);
    }, 0);
    const orderCount = orders.length;
    
    return NextResponse.json({
      orders,
      summary: {
        totalSales,
        totalVat,
        orderCount,
        averageOrderValue: orderCount > 0 ? totalSales / orderCount : 0
      }
    });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    return NextResponse.json({ error: 'Failed to fetch sales report' }, { status: 500 });
  }
}
