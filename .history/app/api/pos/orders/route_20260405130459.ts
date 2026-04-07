import { NextRequest, NextResponse } from 'next/server';
import { getOrders, getOrdersByTable, updateOrder, softDeleteOrder } from '@/lib/actions/pos.actions';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const tableParam = url.searchParams.get('table');
    const status = url.searchParams.get('status') || 'open';

    let orders = [];
    if (tableParam) {
      const tableNumber = Number(tableParam);
      if (Number.isNaN(tableNumber)) {
        return NextResponse.json({ error: 'Invalid table number' }, { status: 400 });
      }
      orders = await getOrdersByTable(tableNumber, false);
    } else {
      orders = await getOrders();
    }

    const filteredOrders = orders.filter((order: any) => {
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

    return NextResponse.json({ orders: filteredOrders }, { status: 200 });
  } catch (error) {
    console.error('Error in GET /api/pos/orders:', error);
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
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
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }
    await deleteOrder(orderId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error in DELETE /api/pos/orders:', error);
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 });
  }
}
