import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth utils
vi.mock('@/lib/auth.utils', () => ({
    getAuthContext: vi.fn().mockResolvedValue({ businessId: 'biz-1', userId: 'user-1' }),
    validateBusinessContext: vi.fn(),
}));

// Mock kitchen-print-snapshot (imported by pos.actions)
vi.mock('@/lib/kitchen-print-snapshot', () => ({
    computeKitchenDelta: vi.fn().mockReturnValue([]),
    linesFromCartItems: vi.fn().mockReturnValue([]),
    mergeKitchenSnapshotIntoSpecialInstructions: vi.fn().mockReturnValue(''),
    parseLastKitchenSnapshot: vi.fn().mockReturnValue([]),
}));

// Mock menu.actions
vi.mock('@/lib/actions/menu.actions', () => ({
    decrementItemStocks: vi.fn().mockResolvedValue({ success: true, failureCount: 0 }),
}));

const mockListDocuments = vi.fn();
const mockCreateDocument = vi.fn();
const mockUpdateDocument = vi.fn();

vi.mock('@/lib/appwrite.config', () => ({
    databases: {
        listDocuments: mockListDocuments,
        createDocument: mockCreateDocument,
        updateDocument: mockUpdateDocument,
    },
    DATABASE_ID: 'test-db',
    ORDERS_COLLECTION_ID: 'test-orders',
    MENU_ITEMS_COLLECTION_ID: 'test-items',
    CATEGORIES_COLLECTION_ID: 'test-cat',
    DELETED_ORDERS_LOG_COLLECTION_ID: 'test-deleted',
}));

// ─── Task 1: settleTableTabAndCreateOrder lock removal ─────────────────────

describe('settleTableTabAndCreateOrder — no settlement lock', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('never writes paymentStatus "settling" to Appwrite', async () => {
        const unpaidOrder = {
            $id: 'order-1',
            orderNumber: 'ORD-001',
            tableNumber: 3,
            customerName: 'Walk-in',
            paymentStatus: 'unpaid',
            orderTime: new Date().toISOString(),
            totalAmount: 500,
            subtotal: 500,
            items: JSON.stringify([{ name: 'Beer', price: 500, quantity: 1 }]),
            type: 'dine_in',
            status: 'active',
            businessId: 'biz-1',
            waiterName: 'Staff',
            waiterId: 'staff-1',
            guestCount: 2,
            taxAmount: 0,
            serviceCharge: 0,
            discountAmount: 0,
            tipAmount: 0,
            paymentReference: '',
            paymentMethods: [],
            specialInstructions: '',
        };

        mockListDocuments.mockResolvedValue({
            documents: [unpaidOrder],
            total: 1,
        });

        mockCreateDocument.mockResolvedValue({
            $id: 'consolidated-1',
            orderNumber: 'ORD-CONSOLIDATED',
        });

        mockUpdateDocument.mockResolvedValue({ $id: 'order-1', paymentStatus: 'paid' });

        const { settleTableTabAndCreateOrder } = await import('@/lib/actions/pos.actions');
        await settleTableTabAndCreateOrder({
            tableNumber: 3,
            date: new Date().toISOString().slice(0, 10),
            paymentReference: 'CASH-123',
            paymentMethod: 'cash',
        });

        const allUpdateCalls = mockUpdateDocument.mock.calls;
        for (const [, , , data] of allUpdateCalls) {
            expect(data?.paymentStatus).not.toBe('settling');
        }
    });
});

// ─── Task 2: getOpenOrdersSummary ──────────────────────────────────────────

describe('getOpenOrdersSummary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty summary when no unpaid orders exist', async () => {
        mockListDocuments.mockResolvedValue({ documents: [], total: 0 });

        const { getOpenOrdersSummary } = await import('@/lib/actions/pos.actions');
        const result = await getOpenOrdersSummary();

        expect(result).toEqual({
            orders: [],
            totalAmount: 0,
            subtotal: 0,
            orderCount: 0,
        });
    });

    it('sorts orders by orderTime ascending (oldest first)', async () => {
        const now = Date.now();
        const doc1 = {
            $id: 'ord-a', orderNumber: 'ORD-A', tableNumber: 1,
            orderTime: new Date(now - 120 * 60_000).toISOString(),
            totalAmount: 200, subtotal: 172, items: '[]',
            paymentStatus: 'unpaid', businessId: 'biz-1',
        };
        const doc2 = {
            $id: 'ord-b', orderNumber: 'ORD-B', tableNumber: 2,
            orderTime: new Date(now - 30 * 60_000).toISOString(),
            totalAmount: 300, subtotal: 258, items: '[]',
            paymentStatus: 'unpaid', businessId: 'biz-1',
        };
        mockListDocuments.mockResolvedValue({ documents: [doc1, doc2], total: 2 });

        const { getOpenOrdersSummary } = await import('@/lib/actions/pos.actions');
        const result = await getOpenOrdersSummary();

        expect(result.orders[0].$id).toBe('ord-a');
        expect(result.orders[1].$id).toBe('ord-b');
    });

    it('computes ageMinutes correctly', async () => {
        const minutesAgo = 47;
        const orderTime = new Date(Date.now() - minutesAgo * 60_000).toISOString();
        const doc = {
            $id: 'ord-c', orderNumber: 'ORD-C', tableNumber: 3,
            orderTime, totalAmount: 100, subtotal: 86,
            items: '[]', paymentStatus: 'unpaid', businessId: 'biz-1',
        };
        mockListDocuments.mockResolvedValue({ documents: [doc], total: 1 });

        const { getOpenOrdersSummary } = await import('@/lib/actions/pos.actions');
        const result = await getOpenOrdersSummary();

        expect(result.orders[0].ageMinutes).toBeGreaterThanOrEqual(minutesAgo - 1);
        expect(result.orders[0].ageMinutes).toBeLessThanOrEqual(minutesAgo + 1);
    });

    it('throws when DATABASE_ID is missing', async () => {
        vi.doMock('@/lib/appwrite.config', () => ({
            databases: { listDocuments: mockListDocuments },
            DATABASE_ID: undefined,
            ORDERS_COLLECTION_ID: 'test-orders',
            MENU_ITEMS_COLLECTION_ID: 'test-items',
            CATEGORIES_COLLECTION_ID: 'test-cat',
            DELETED_ORDERS_LOG_COLLECTION_ID: 'test-deleted',
        }));
        vi.resetModules();

        vi.doMock('@/lib/auth.utils', () => ({
            getAuthContext: vi.fn().mockResolvedValue({ businessId: 'biz-1', userId: 'user-1' }),
            validateBusinessContext: vi.fn(),
        }));
        vi.doMock('@/lib/kitchen-print-snapshot', () => ({
            computeKitchenDelta: vi.fn().mockReturnValue([]),
            linesFromCartItems: vi.fn().mockReturnValue([]),
            mergeKitchenSnapshotIntoSpecialInstructions: vi.fn().mockReturnValue(''),
            parseLastKitchenSnapshot: vi.fn().mockReturnValue([]),
        }));
        vi.doMock('@/lib/actions/menu.actions', () => ({
            decrementItemStocks: vi.fn().mockResolvedValue({ success: true, failureCount: 0 }),
        }));

        const { getOpenOrdersSummary } = await import('@/lib/actions/pos.actions');
        await expect(getOpenOrdersSummary()).rejects.toThrow('Database configuration is missing');

        vi.resetModules();
    });
});

// ─── Task 5: orderAgeColor ─────────────────────────────────────────────────

describe('orderAgeColor', () => {
    it('returns green for ageMinutes < 60', async () => {
        const { orderAgeColor } = await import('@/components/pos/SettleTableTabModal');
        expect(orderAgeColor(0)).toBe('green');
        expect(orderAgeColor(59)).toBe('green');
    });

    it('returns amber for ageMinutes 60–179', async () => {
        const { orderAgeColor } = await import('@/components/pos/SettleTableTabModal');
        expect(orderAgeColor(60)).toBe('amber');
        expect(orderAgeColor(179)).toBe('amber');
    });

    it('returns red for ageMinutes >= 180', async () => {
        const { orderAgeColor } = await import('@/components/pos/SettleTableTabModal');
        expect(orderAgeColor(180)).toBe('red');
        expect(orderAgeColor(999)).toBe('red');
    });
});
