import { NextRequest, NextResponse } from 'next/server';
import { databases, DATABASE_ID, DELETED_ORDERS_LOG_COLLECTION_ID } from '@/lib/appwrite.config';
import { getAuthContext } from '@/lib/auth.utils';
import { Query } from 'node-appwrite';

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await getAuthContext();

    if (!DATABASE_ID || !DELETED_ORDERS_LOG_COLLECTION_ID) {
      return NextResponse.json({ error: 'Database configuration is missing' }, { status: 500 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100); // Max 100 records
    const offset = Number(url.searchParams.get('offset')) || 0;

    const deletedOrders = await databases.listDocuments(
      DATABASE_ID,
      DELETED_ORDERS_LOG_COLLECTION_ID,
      [
        Query.equal('businessId', businessId),
        Query.orderDesc('$createdAt'),
        Query.limit(limit),
        Query.offset(offset),
      ]
    );

    return NextResponse.json({
      deletedOrders: deletedOrders.documents,
      total: deletedOrders.total,
    }, { status: 200 });
  } catch (error) {
    console.error('Error in GET /api/pos/deleted-orders:', error);
    return NextResponse.json({ error: 'Failed to load deleted orders audit log' }, { status: 500 });
  }
}