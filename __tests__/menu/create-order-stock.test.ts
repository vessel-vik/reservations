import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/appwrite.config', () => ({
  databases: {
    createDocument: vi.fn().mockResolvedValue({ $id: 'order1' }),
    getDocument: vi.fn().mockResolvedValue({ stock: 10, popularity: 5 }),
    updateDocument: vi.fn().mockResolvedValue({}),
  },
  DATABASE_ID: 'test-db',
  ORDERS_COLLECTION_ID: 'test-orders',
  MENU_ITEMS_COLLECTION_ID: 'test-items',
  CATEGORIES_COLLECTION_ID: 'test-cat',
}));

vi.mock('@/lib/actions/menu.actions', () => ({
  decrementItemStocks: vi.fn().mockResolvedValue({ success: true, failureCount: 0 }),
}));

import { createOrder } from '@/lib/actions/pos.actions';
import { decrementItemStocks } from '@/lib/actions/menu.actions';

const baseOrder = {
  orderNumber: 'ORD-TEST-001',
  type: 'dine_in' as const,
  status: 'pending' as const,
  tableNumber: 1,
  customerName: 'Test Customer',
  guestCount: 2,
  waiterName: 'Staff',
  waiterId: 'staff1',
  subtotal: 500,
  taxAmount: 0,
  serviceCharge: 0,
  discountAmount: 0,
  tipAmount: 0,
  totalAmount: 500,
  paymentStatus: 'unpaid' as const,
  orderTime: new Date().toISOString(),
  priority: 'normal' as const,
  items: [
    { $id: 'item-a', name: 'Burger', price: 300, quantity: 1 },
    { $id: 'item-b', name: 'Fries', price: 100, quantity: 2 },
  ],
};

describe('createOrder — stock decrement integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(decrementItemStocks).mockResolvedValue({ success: true, failureCount: 0 });
  });

  it('calls decrementItemStocks with itemId and quantity for each cart item', async () => {
    await createOrder(baseOrder as any);
    expect(decrementItemStocks).toHaveBeenCalledTimes(1);
    expect(decrementItemStocks).toHaveBeenCalledWith([
      { itemId: 'item-a', quantity: 1 },
      { itemId: 'item-b', quantity: 2 },
    ]);
  });

  it('still returns the created order when decrementItemStocks throws', async () => {
    vi.mocked(decrementItemStocks).mockRejectedValueOnce(new Error('Stock service down') as any);
    const result = await createOrder(baseOrder as any);
    expect(result.$id).toBe('order1');
  });
});
