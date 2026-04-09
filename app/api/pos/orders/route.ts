import { NextRequest, NextResponse } from 'next/server';
import {
  getOrders,
  getOrdersByTable,
  getUnpaidOrdersForBusiness,
  getClosedOrdersForAudit,
  updateOrder,
  voidOrderValidated,
} from '@/lib/actions/pos.actions';
import { databases, DATABASE_ID } from '@/lib/appwrite.config';
import { Query } from 'node-appwrite';
import { getAuthContext, validateBusinessContext } from '@/lib/auth.utils';

const PAYMENT_LEDGER_COLLECTION_ID = process.env.PAYMENT_LEDGER_COLLECTION_ID;

async function attachLedgerMethods(
  businessId: string,
  orders: any[]
): Promise<any[]> {
  if (!DATABASE_ID || !PAYMENT_LEDGER_COLLECTION_ID || !Array.isArray(orders) || orders.length === 0) {
    return orders;
  }

  const ids = orders.map((o: any) => String(o.$id || "")).filter(Boolean);
  if (!ids.length) return orders;

  const byOrderId = new Map<string, any[]>();
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const rows = await databases.listDocuments(DATABASE_ID, PAYMENT_LEDGER_COLLECTION_ID, [
      Query.equal("businessId", businessId),
      Query.equal("status", "confirmed"),
      Query.equal("orderId", chunk),
      Query.limit(5000),
      Query.orderAsc("settledAt"),
    ]);
    for (const d of rows.documents as any[]) {
      const oid = String(d.orderId || "");
      if (!oid) continue;
      const list = byOrderId.get(oid) || [];
      list.push({
        method: d.method,
        amount: d.amount,
        reference: d.reference || undefined,
        settledAt: d.settledAt || d.$createdAt,
        terminalId: d.terminalId || undefined,
      });
      byOrderId.set(oid, list);
    }
  }

  return orders.map((o: any) => {
    const ledgerMethods = byOrderId.get(String(o.$id || ""));
    if (!ledgerMethods || ledgerMethods.length === 0) return o;
    return {
      ...o,
      paymentMethods: ledgerMethods,
      paymentMethodsSource: "ledger",
      paymentMethodsTotal: ledgerMethods.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    const url = new URL(request.url);
    const tableParam = url.searchParams.get('table');
    const status = url.searchParams.get('status') || 'open';
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

    let orders = [];
    if (tableParam) {
      const tableNumber = Number(tableParam);
      if (Number.isNaN(tableNumber)) {
        return NextResponse.json({ error: 'Invalid table number' }, { status: 400 });
      }
      orders = await getOrdersByTable(tableNumber, false);
    } else if (status === 'closed') {
      orders = await getClosedOrdersForAudit();
    } else if (status === 'open') {
      orders = await getUnpaidOrdersForBusiness();
    } else {
      orders = await getOrders();
    }

    // Filter out soft-deleted orders unless explicitly requested
    let filteredOrders = includeDeleted ? orders : orders.filter((order: any) => !order.isDeleted);

    // Apply status filtering
    filteredOrders = filteredOrders.filter((order: any) => {
      if (status === 'open') {
        return order.paymentStatus === 'unpaid' || order.status === 'placed';
      }
      if (status === 'closed') {
        return (
          order.paymentStatus === 'paid' ||
          order.paymentStatus === 'settled' ||
          order.status === 'paid'
        );
      }
      return order.status === status || order.paymentStatus === status;
    });

    if (status === 'closed' && filteredOrders.length > 0) {
      filteredOrders = await attachLedgerMethods(businessId, filteredOrders);
    }

    return NextResponse.json({ orders: filteredOrders }, { status: 200 });
  } catch (error) {
    console.error('Error in GET /api/pos/orders:', error);
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);
    const body = await request.json();
    const { orderId, data } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'data is required' }, { status: 400 });
    }

    const updated = await updateOrder(orderId, data);
    return NextResponse.json({ order: updated }, { status: 200 });
  } catch (error) {
    console.error('Error in PUT /api/pos/orders:', error);
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'JSON body required: { orderId, voidCategory, reason }' },
        { status: 400 }
      );
    }

    await voidOrderValidated(body);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to delete order';
    if (msg.includes('FORBIDDEN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (msg.includes('Invalid') || msg.includes('at least 15')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('Error in DELETE /api/pos/orders:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
