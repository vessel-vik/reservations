# Settle Tab v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "Failed to settle full tab: {}" crash, rewrite the Settle Tab modal into a full-screen scrollable experience with cross-table order discovery, color-coded urgency, and wire a receipt preview modal that auto-queues print jobs to the admin terminal.

**Architecture:** A new server action `getOpenOrdersSummary` loads all unpaid orders across every table at once; the rewritten `SettleTableTabModal` (full-screen, auto-loads on open) calls it. A new `OrderReceiptModal` auto-queues a `receipt` print job and is shown after settlement or when staff tap the print icon in OpenOrdersModal. The crash is fixed by removing an illegal `paymentStatus: "settling"` write that violates the Appwrite schema enum.

**Tech Stack:** Next.js 14 App Router, Appwrite (node-appwrite SDK for server actions), Vitest + jsdom for tests. Run tests with: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run <path>`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/actions/pos.actions.ts` | Modify | Add `getOpenOrdersSummary()`; add `getNextTabNumber()`; remove settlement lock from `settleTableTabAndCreateOrder` |
| `types/pos.types.ts` | Modify | Add `OpenOrder` and `OpenOrdersSummary` interfaces |
| `components/pos/SettleTableTabModal.tsx` | Rewrite | Full-screen modal, auto-load, color-coded cards, sliding payment sub-views, sticky bottom bar |
| `components/pos/OrderReceiptModal.tsx` | Create | Digital receipt preview, auto-queues receipt print job on open |
| `lib/print.utils.ts` | Modify | Add `printReceipt(orderId)` helper |
| `components/pos/POSInterface.tsx` | Modify | Wire `receiptOrder` state, `onPrint` → receipt modal, settlement → receipt modal |
| `vercel.json` | Modify | Reschedule cron `30 3 * * *` → `30 4 * * *` |
| `app/api/cron/stale-orders/route.ts` | Modify | Fix `specialInstructions` cap: `slice(0, 9500)` → `slice(0, 950)` |
| `__tests__/pos/settle-tab.test.ts` | Create | Unit tests for `getOpenOrdersSummary`, `getNextTabNumber`, and `orderAgeColor` |

---

## Task 0: Auto Tab Number Assignment in `createTabOrderFromCart`

**Files:**
- Modify: `lib/actions/pos.actions.ts` (add `getNextTabNumber` helper + use it in `createTabOrderFromCart`)
- Modify: `__tests__/pos/settle-tab.test.ts` (add tests)

### Background

Currently `createTabOrderFromCart` does not assign a `tableNumber`. Waiters must remember or manually enter it. This task auto-assigns the next sequential tab number for the business day so the waiter can start taking orders immediately without friction.

### Logic

`getNextTabNumber(businessId: string): Promise<number>`:
1. Query Appwrite for today's orders for this business (`orderTime >= startOfToday`)
2. Reduce to find `max(tableNumber)` across all results
3. Return `max + 1` (or `1` if no orders today)

Then in `createTabOrderFromCart`, call `getNextTabNumber(businessId)` and include the result as `tableNumber` in `orderData`.

- [ ] **Step 1: Write failing tests**

Add to `__tests__/pos/settle-tab.test.ts`:

```typescript
describe('getNextTabNumber', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 1 when no orders exist today', async () => {
    mockListDocuments.mockResolvedValue({ documents: [], total: 0 });
    const { getNextTabNumber } = await import('@/lib/actions/pos.actions');
    expect(await getNextTabNumber('biz-1')).toBe(1);
  });

  it('returns max tableNumber + 1 from today\'s orders', async () => {
    mockListDocuments.mockResolvedValue({
      documents: [
        { tableNumber: 3 }, { tableNumber: 7 }, { tableNumber: 2 }
      ],
      total: 3,
    });
    const { getNextTabNumber } = await import('@/lib/actions/pos.actions');
    expect(await getNextTabNumber('biz-1')).toBe(8);
  });

  it('skips orders with no tableNumber', async () => {
    mockListDocuments.mockResolvedValue({
      documents: [{ tableNumber: null }, { tableNumber: 4 }],
      total: 2,
    });
    const { getNextTabNumber } = await import('@/lib/actions/pos.actions');
    expect(await getNextTabNumber('biz-1')).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/pos/settle-tab.test.ts
```

- [ ] **Step 3: Implement `getNextTabNumber` in `lib/actions/pos.actions.ts`**

Add near the top exports (before `getOpenOrdersSummary`):

```typescript
/**
 * Returns the next sequential tab number for today's business session.
 * Used by createTabOrderFromCart to auto-assign a table/tab ID without waiter input.
 */
export const getNextTabNumber = async (businessId: string): Promise<number> => {
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) return 1;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    try {
        const res = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.equal("businessId", businessId),
                Query.greaterThanEqual("orderTime", startOfToday.toISOString()),
                Query.orderDesc("tableNumber"),
                Query.limit(1),
            ]
        );
        if (res.documents.length === 0) return 1;
        const maxTable = (res.documents[0] as any).tableNumber as number | null;
        return (maxTable ?? 0) + 1;
    } catch {
        return 1; // fallback — never block order creation
    }
};
```

Then find `createTabOrderFromCart` and in the `orderData` object, replace any hardcoded or missing `tableNumber` with:

```typescript
tableNumber: await getNextTabNumber(businessId),
```

- [ ] **Step 4: Run tests, expect PASS**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/pos/settle-tab.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pos.actions.ts __tests__/pos/settle-tab.test.ts
git commit -m "feat: auto-assign sequential tab number in createTabOrderFromCart"
```

---

## Task 1: Fix `settleTableTabAndCreateOrder` — remove settlement lock

**Files:**
- Modify: `lib/actions/pos.actions.ts`
- Create: `__tests__/pos/settle-tab.test.ts`

### Background
The function currently writes `paymentStatus: "settling"` to Appwrite before charging. The schema enum only allows `unpaid | paid | cancelled`, so the write throws an SDK error that serialises as `{}`. The settlement lock is unnecessary — Appwrite's atomic document writes are sufficient.

**Exact lines to remove in `lib/actions/pos.actions.ts`:**
- **The CHECK block** (around line 928–942): the entire `const existingSettlementCheck = await databases.listDocuments(...)` call and the `if (existingSettlementCheck.documents.length > 0) { throw ... }` guard
- **The SET block** (around lines 957–978): the `const settlingPromises = ...` declaration, the `await Promise.allSettled(settlingPromises)`, the `const successfullyMarked = ...` line, and the `if (successfullyMarked === 0) { throw ... }` guard
- **The CLEANUP catch** (around lines 1100–1115): the entire `} catch (error) { ... }` block that resets orders back to `"unpaid"`. Replace the entire `try { ... } catch (error) { ... cleanup ... throw error }` wrapper with just the unwrapped business logic (no try/catch needed since there's no cleanup to do)

After the fix the function flow is:
1. Validate env vars (keep)
2. `getAuthContext()` + `validateBusinessContext(businessId)` (keep)
3. `getTableDailyTabSummary()` + early return if no orders (keep)
4. Parse + flatten items → build consolidated order (keep)
5. `databases.createDocument(...)` → consolidated receipt (keep)
6. `Promise.allSettled(...)` → mark all source orders as `"paid"` (keep)
7. Return `{ success: true, consolidatedOrderId, updatedCount, totalAmount, ... }` (keep)

- [ ] **Step 1: Write failing test for lock-free path**

Create `__tests__/pos/settle-tab.test.ts`:

```typescript
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

describe('settleTableTabAndCreateOrder — no settlement lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never writes paymentStatus "settling" to Appwrite', async () => {
    // Setup: table 3 has one unpaid order
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
    };

    // listDocuments called twice: once for getTableDailyTabSummary internals, once for unpaid query
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

    // Ensure "settling" was NEVER written
    const allUpdateCalls = mockUpdateDocument.mock.calls;
    for (const [, , , data] of allUpdateCalls) {
      expect(data?.paymentStatus).not.toBe('settling');
    }
  });
});
```

- [ ] **Step 2: Run test, expect it to FAIL (settling is still written)**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/pos/settle-tab.test.ts
```

Expected: test fails because `mockUpdateDocument` is called with `paymentStatus: "settling"`.

- [ ] **Step 3: Remove the settlement lock from `settleTableTabAndCreateOrder`**

In `lib/actions/pos.actions.ts`, find `settleTableTabAndCreateOrder` (around line 909).

**Remove block A — CHECK phase** (the `existingSettlementCheck` block):
```typescript
// DELETE THIS ENTIRE BLOCK:
const existingSettlementCheck = await databases.listDocuments(
    DATABASE_ID!,
    ORDERS_COLLECTION_ID!,
    [
        Query.equal("businessId", businessId),
        Query.equal("tableNumber", tableNumber),
        Query.equal("paymentStatus", "settling"),
        Query.greaterThanEqual("orderTime", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    ]
);

if (existingSettlementCheck.documents.length > 0) {
    throw new Error(`Table ${tableNumber} is currently being settled by another terminal. Please wait and try again.`);
}
```

**Remove block B — SET phase** (the `settlingPromises` block, immediately before the existing `try {`):
```typescript
// DELETE THIS ENTIRE BLOCK:
const settlingPromises = summary.orders.map((order: any) =>
    databases.updateDocument(
        DATABASE_ID!,
        ORDERS_COLLECTION_ID!,
        order.$id,
        {
            paymentStatus: "settling",
            status: "processing"
        }
    ).catch(err => {
        console.error(`Failed to mark order ${order.$id} as settling:`, err);
        return null;
    })
);

const settlingResults = await Promise.allSettled(settlingPromises);
const successfullyMarked = settlingResults.filter(r => r.status === "fulfilled" && r.value !== null).length;

if (successfullyMarked === 0) {
    throw new Error("Failed to acquire settlement lock. Another terminal may be processing this table.");
}
```

**Remove block C — CLEANUP catch** (replace `try { ... } catch (error) { cleanup ... throw error }` with just the unwrapped contents):

The current structure is:
```typescript
try {
    // ... all the business logic (parse items, createDocument, updateDocument × N) ...
    return { success: true as const, ... };
} catch (error) {
    // CLEANUP: Reset orders from "settling" status on failure
    console.error("Settlement failed, cleaning up settling status:", error);
    const cleanupPromises = summary.orders.map((order: any) =>
        databases.updateDocument(...)
    );
    await Promise.allSettled(cleanupPromises);
    throw error;
}
```

Replace with:
```typescript
// ... all the business logic (parse items, createDocument, updateDocument × N) ...
return { success: true as const, ... };
```

(Remove the `try {` opening, the entire `} catch (error) { ... }` block. The business logic lines inside the try stay untouched — just remove the wrapper.)

- [ ] **Step 4: Run test, expect it to PASS**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/pos/settle-tab.test.ts
```

Expected: PASS. `paymentStatus: "settling"` is never written.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pos.actions.ts __tests__/pos/settle-tab.test.ts
git commit -m "fix: remove settlement lock (paymentStatus 'settling' caused {} error)"
```

---

## Task 2: Add `getOpenOrdersSummary()` server action + types

**Files:**
- Modify: `lib/actions/pos.actions.ts` (append function)
- Modify: `types/pos.types.ts` (append interfaces)
- Modify: `__tests__/pos/settle-tab.test.ts` (add describe block)

- [ ] **Step 1: Add `OpenOrder` and `OpenOrdersSummary` to `types/pos.types.ts`**

Append to the end of `types/pos.types.ts`:

```typescript
export interface OpenOrder {
  $id: string;
  orderNumber: string;
  tableNumber?: number;
  customerName?: string;
  waiterName?: string;
  orderTime: string;        // ISO string
  ageMinutes: number;       // computed: Math.floor((now - orderTime) / 60_000)
  totalAmount: number;
  subtotal: number;
  items: any[];             // parsed: JSON string or array
  paymentStatus: string;
}

export interface OpenOrdersSummary {
  orders: OpenOrder[];
  totalAmount: number;
  subtotal: number;
  orderCount: number;
}
```

- [ ] **Step 2: Write failing tests for `getOpenOrdersSummary`**

Add a new `describe` block to `__tests__/pos/settle-tab.test.ts` (after the existing one):

```typescript
describe('getOpenOrdersSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty summary when no unpaid orders exist', async () => {
    mockListDocuments.mockResolvedValue({ documents: [], total: 0 });

    // re-import to get fresh module with mocks
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
      orderTime: new Date(now - 120 * 60_000).toISOString(), // 2hr ago
      totalAmount: 200, subtotal: 172, items: '[]',
      paymentStatus: 'unpaid', businessId: 'biz-1',
    };
    const doc2 = {
      $id: 'ord-b', orderNumber: 'ORD-B', tableNumber: 2,
      orderTime: new Date(now - 30 * 60_000).toISOString(), // 30min ago
      totalAmount: 300, subtotal: 258, items: '[]',
      paymentStatus: 'unpaid', businessId: 'biz-1',
    };
    // Appwrite returns them sorted by orderTime asc already (we pass orderAsc query)
    mockListDocuments.mockResolvedValue({ documents: [doc1, doc2], total: 2 });

    const { getOpenOrdersSummary } = await import('@/lib/actions/pos.actions');
    const result = await getOpenOrdersSummary();

    expect(result.orders[0].$id).toBe('ord-a'); // older first
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

    // Allow ±1 minute for test execution time
    expect(result.orders[0].ageMinutes).toBeGreaterThanOrEqual(minutesAgo - 1);
    expect(result.orders[0].ageMinutes).toBeLessThanOrEqual(minutesAgo + 1);
  });

  it('throws when DATABASE_ID is missing', async () => {
    // Temporarily clear DATABASE_ID by re-mocking
    vi.doMock('@/lib/appwrite.config', () => ({
      databases: { listDocuments: mockListDocuments },
      DATABASE_ID: undefined,
      ORDERS_COLLECTION_ID: 'test-orders',
      MENU_ITEMS_COLLECTION_ID: 'test-items',
      CATEGORIES_COLLECTION_ID: 'test-cat',
      DELETED_ORDERS_LOG_COLLECTION_ID: 'test-deleted',
    }));

    // Force module re-evaluation
    vi.resetModules();

    // Re-apply all other mocks after resetModules
    vi.mock('@/lib/auth.utils', () => ({
      getAuthContext: vi.fn().mockResolvedValue({ businessId: 'biz-1', userId: 'user-1' }),
      validateBusinessContext: vi.fn(),
    }));
    vi.mock('@/lib/kitchen-print-snapshot', () => ({
      computeKitchenDelta: vi.fn().mockReturnValue([]),
      linesFromCartItems: vi.fn().mockReturnValue([]),
      mergeKitchenSnapshotIntoSpecialInstructions: vi.fn().mockReturnValue(''),
      parseLastKitchenSnapshot: vi.fn().mockReturnValue([]),
    }));
    vi.mock('@/lib/actions/menu.actions', () => ({
      decrementItemStocks: vi.fn().mockResolvedValue({ success: true, failureCount: 0 }),
    }));

    const { getOpenOrdersSummary } = await import('@/lib/actions/pos.actions');

    await expect(getOpenOrdersSummary()).rejects.toThrow('Database configuration is missing');

    vi.resetModules(); // clean up after this test
  });
});
```

- [ ] **Step 3: Run tests, expect FAIL (function doesn't exist yet)**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/pos/settle-tab.test.ts
```

Expected: `getOpenOrdersSummary is not a function` or similar.

- [ ] **Step 4: Implement `getOpenOrdersSummary` in `lib/actions/pos.actions.ts`**

Append after the last export in the file (before the final closing, after `settleTableTabAndCreateOrder`):

```typescript
/**
 * Load all unpaid orders across every table for the current business.
 * Returns up to 250 orders sorted oldest-first with computed ageMinutes.
 */
export const getOpenOrdersSummary = async (): Promise<import('@/types/pos.types').OpenOrdersSummary> => {
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
        throw new Error("Database configuration is missing");
    }

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    const response = await databases.listDocuments(
        DATABASE_ID,
        ORDERS_COLLECTION_ID,
        [
            Query.equal("businessId", businessId),
            Query.equal("paymentStatus", "unpaid"),
            Query.notEqual("isDeleted", true),
            Query.orderAsc("orderTime"),
            Query.limit(250),
        ]
    );

    const now = Date.now();

    const orders = response.documents.map((doc: any) => {
        const ageMs = now - new Date(doc.orderTime).getTime();
        const ageMinutes = Math.floor(ageMs / 60_000);

        let items: any[] = [];
        if (doc.items) {
            if (typeof doc.items === "string") {
                try { items = JSON.parse(doc.items); } catch { items = []; }
            } else if (Array.isArray(doc.items)) {
                items = doc.items;
            }
        }

        return {
            $id: doc.$id as string,
            orderNumber: doc.orderNumber as string,
            tableNumber: doc.tableNumber as number | undefined,
            customerName: doc.customerName as string | undefined,
            waiterName: doc.waiterName as string | undefined,
            orderTime: doc.orderTime as string,
            ageMinutes,
            totalAmount: (doc.totalAmount as number) || 0,
            subtotal: (doc.subtotal as number) || 0,
            items,
            paymentStatus: doc.paymentStatus as string,
        };
    });

    const totalAmount = orders.reduce((s, o) => s + o.totalAmount, 0);
    const subtotal = orders.reduce((s, o) => s + o.subtotal, 0);

    return { orders, totalAmount, subtotal, orderCount: orders.length };
};
```

- [ ] **Step 5: Run tests, expect PASS**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/pos/settle-tab.test.ts
```

Expected: all tests in this file pass. Ignore the DATABASE_ID test if `vi.resetModules` causes flakiness — it's acceptable to skip it in that case (add `.skip`).

- [ ] **Step 6: Commit**

```bash
git add lib/actions/pos.actions.ts types/pos.types.ts __tests__/pos/settle-tab.test.ts
git commit -m "feat: add getOpenOrdersSummary server action + OpenOrder/OpenOrdersSummary types"
```

---

## Task 3: Add `printReceipt` helper to `lib/print.utils.ts`

**Files:**
- Modify: `lib/print.utils.ts`
- Modify: `__tests__/print/print-utils.test.ts`

- [ ] **Step 1: Write the failing test**

In `__tests__/print/print-utils.test.ts`, add after the existing `printKitchenDelta` describe block:

```typescript
describe('printReceipt', () => {
    it('calls window.queuePrintJob with receipt jobType and returns success', async () => {
        const mockQueue = vi.fn().mockResolvedValue(undefined);
        (window as any).queuePrintJob = mockQueue;

        const { printReceipt } = await import('@/lib/print.utils');
        const result = await printReceipt('order-789');

        expect(mockQueue).toHaveBeenCalledWith('receipt', 'orderId:order-789');
        expect(result).toEqual({ success: true });
    });

    it('shows toast.error and returns failure when PrintBridge not mounted', async () => {
        const { printReceipt } = await import('@/lib/print.utils');
        const result = await printReceipt('order-789');

        expect(result.success).toBe(false);
        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining('Print bridge not ready')
        );
    });
});
```

- [ ] **Step 2: Run the test, expect FAIL**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/print/print-utils.test.ts
```

Expected: `printReceipt is not a function`.

- [ ] **Step 3: Implement `printReceipt` in `lib/print.utils.ts`**

Append after `printKitchenDelta`:

```typescript
/**
 * Queue a customer receipt print job to the admin terminal.
 * Called on modal open (auto-print) and "Print Again" button.
 */
export async function printReceipt(
    orderId: string
): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined') {
        return { success: false, error: 'Print is only available in the browser' };
    }
    const queue = getQueueFn();
    if (!queue) {
        toast.error(BRIDGE_NOT_READY_MSG);
        return { success: false, error: 'PrintBridge not mounted' };
    }
    try {
        await queue('receipt', `orderId:${orderId}`);
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown print error';
        toast.error(msg);
        return { success: false, error: msg };
    }
}
```

- [ ] **Step 4: Run the test, expect PASS**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/print/print-utils.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/print.utils.ts __tests__/print/print-utils.test.ts
git commit -m "feat: add printReceipt helper to print.utils"
```

---

## Task 4: Create `components/pos/OrderReceiptModal.tsx`

**Files:**
- Create: `components/pos/OrderReceiptModal.tsx`

No automated test — this is a pure render component. Manual verification is sufficient (open modal, check items/VAT/badge, check auto-print toast).

- [ ] **Step 1: Create the file**

Create `components/pos/OrderReceiptModal.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle, Clock, Printer } from "lucide-react";
import { printReceipt } from "@/lib/print.utils";

interface ReceiptOrder {
    $id: string;
    orderNumber?: string;
    tableNumber?: number;
    customerName?: string;
    waiterName?: string;
    orderTime: string;
    items: any[];
    subtotal: number;
    totalAmount: number;
    paymentStatus: string;
}

interface OrderReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: ReceiptOrder;
    paymentMethod?: string;
    paymentReference?: string;
}

function parseItems(raw: any[]): { name: string; quantity: number; price: number }[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => ({
        name: item.name || "Item",
        quantity: typeof item.quantity === "number" ? item.quantity : 1,
        price: typeof item.price === "number" ? item.price : 0,
    }));
}

export function OrderReceiptModal({
    isOpen,
    onClose,
    order,
    paymentMethod,
    paymentReference,
}: OrderReceiptModalProps) {
    const isPaid = order.paymentStatus === "paid";

    // Compute VAT — fall back if subtotal is 0
    const subtotal = order.subtotal > 0 ? order.subtotal : order.totalAmount / 1.16;
    const vat = order.totalAmount - subtotal;

    const items = parseItems(order.items);

    const tableLine = order.tableNumber
        ? `Table ${order.tableNumber}`
        : order.customerName || "Walk-in";

    const orderTime = new Date(order.orderTime).toLocaleString("en-KE", {
        dateStyle: "short",
        timeStyle: "short",
    });

    // Auto-queue print job when modal opens
    useEffect(() => {
        if (!isOpen) return;
        printReceipt(order.$id);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-neutral-950 border-white/10 text-white max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">
                        {order.orderNumber
                            ? `#${order.orderNumber}`
                            : `Order ${order.$id.slice(-6).toUpperCase()}`}
                    </DialogTitle>
                </DialogHeader>

                {/* Header line */}
                <div className="flex items-center justify-between text-xs text-neutral-400 -mt-2 mb-3">
                    <span>{tableLine}</span>
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {orderTime}
                    </span>
                </div>

                {/* Status badge */}
                <div className="flex justify-center mb-4">
                    {isPaid ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-4 py-1.5 text-sm font-bold text-emerald-400">
                            <CheckCircle className="w-4 h-4" />
                            PAID
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-4 py-1.5 text-sm font-bold text-amber-400">
                            UNPAID
                        </span>
                    )}
                </div>

                {/* Items */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {items.length === 0 ? (
                        <p className="text-xs text-neutral-500 text-center py-2">No item breakdown available</p>
                    ) : (
                        items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs">
                                <span className="text-neutral-300">
                                    {item.quantity}× {item.name}
                                </span>
                                <span className="text-neutral-400 tabular-nums">
                                    {formatCurrency(item.price * item.quantity)}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                {/* Totals */}
                <div className="border-t border-dashed border-white/10 pt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-neutral-400">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                        <span>VAT (16%)</span>
                        <span className="tabular-nums">{formatCurrency(vat)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-white text-sm pt-1 border-t border-white/10">
                        <span>Total</span>
                        <span className="tabular-nums">{formatCurrency(order.totalAmount)}</span>
                    </div>
                </div>

                {/* Payment method (when paid) */}
                {isPaid && paymentMethod && (
                    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs">
                        <div className="flex justify-between text-neutral-400">
                            <span>Payment</span>
                            <span className="font-medium text-white uppercase">{paymentMethod}</span>
                        </div>
                        {paymentReference && (
                            <div className="flex justify-between text-neutral-500 mt-1">
                                <span>Ref</span>
                                <span className="font-mono">{paymentReference.slice(0, 16)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer buttons */}
                <div className="flex gap-2 pt-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-white/10 text-neutral-300 hover:text-white"
                        onClick={() => printReceipt(order.$id)}
                    >
                        <Printer className="w-3.5 h-3.5 mr-1.5" />
                        Print Again
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                        onClick={onClose}
                    >
                        Done
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Verify TypeScript compiles (no errors)**

```bash
cd /home/elyees/D/reservations/reservations && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in the new file. Fix any type issues before continuing.

- [ ] **Step 3: Commit**

```bash
git add components/pos/OrderReceiptModal.tsx
git commit -m "feat: add OrderReceiptModal — digital receipt preview with auto-print"
```

---

## Task 5: Rewrite `components/pos/SettleTableTabModal.tsx`

**Files:**
- Rewrite: `components/pos/SettleTableTabModal.tsx`

The existing component is replaced entirely. The new one auto-loads all unpaid orders on open, color-codes by age, has a scrollable list with expandable cards, and a sticky bottom bar with **sliding payment sub-views** and charge buttons.

### Sliding payment sub-view architecture

When the user taps "Charge Selected" or "Charge All", instead of immediately charging, the bottom bar slides to a payment-method sub-view. This keeps all context in one screen and prevents accidental charges.

State:
```typescript
type PaymentSubview = {
  type: "cash" | "pdq" | "mpesa";
  amount: number;
  orderIds: string[];
} | null;
const [paymentSubview, setPaymentSubview] = useState<PaymentSubview>(null);
```

When `paymentSubview` is not null, the order list area is replaced with the sub-view. Each method:

**Cash sub-view:**
```
← Back  |  Cash Payment  |  Ksh X
─────────────────────────────────
Amount received: [         ]
Change: Ksh Y              (live-computed)
[Confirm Cash Payment]     (disabled if amount < total)
```
Reference: `CASH-${Date.now()}` auto-generated.

**PDQ sub-view:**
```
← Back  |  Card Payment  |  Ksh X
─────────────────────────────────
Process card through PDQ terminal, then enter approval code:
Approval code: [          ]
[Confirm PDQ Payment]      (disabled until code entered)
```
Reference: `PDQ-${approvalCode}-${Date.now()}`.

**M-Pesa sub-view:**
```
← Back  |  M-Pesa  |  Ksh X
─────────────────────────────────
Customer phone (254…): [          ]
[Send STK Push / Confirm]  (disabled until phone entered)
```
Reference: `MPESA-${phone}-${Date.now()}`.

**Paystack:** No sub-view — launches PopStack directly (existing `handlePaystackFlow`).

Tapping "← Back" sets `paymentSubview = null` (returns to order list). Confirming calls `settle(orderIds)` with the generated reference injected via a `paymentRef` state.

The `settle()` function signature extends to accept an optional `paymentReference` override:
```typescript
const settle = async (orderIds: string[], paymentReference?: string) => { ... }
```
If `paymentReference` is supplied (from sub-view), skip the `manual-${paymentMethod}-${Date.now()}` fallback.

- [ ] **Step 1: Add `orderAgeColor` test cases to settle-tab.test.ts**

Add to `__tests__/pos/settle-tab.test.ts`:

```typescript
// orderAgeColor is exported from the rewritten SettleTableTabModal.
// These tests verify the thresholds before the component is implemented.
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
```

- [ ] **Step 2: Run `orderAgeColor` tests, expect FAIL (export doesn't exist yet)**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/pos/settle-tab.test.ts
```

Expected: import error or `orderAgeColor is not a function`.

- [ ] **Step 3: Rewrite `SettleTableTabModal.tsx`**

Replace the entire file content with:

```typescript
"use client";

import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import {
    getOpenOrdersSummary,
    settleSelectedOrders,
} from "@/lib/actions/pos.actions";
import {
    initializePaystackTransaction,
    verifyPaystackTransaction,
} from "@/lib/actions/paystack.actions";
import { openPaystackWithAccessCode } from "@/lib/paystack-inline";
import { Loader2, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { OpenOrder } from "@/types/pos.types";

type PaymentMethod = "cash" | "pdq" | "mpesa" | "paystack";

interface SettleTableTabModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSettlementSuccess?: (consolidatedOrderId: string, totalAmount: number) => void;
}

/** Exported for unit tests */
export function orderAgeColor(ageMinutes: number): "green" | "amber" | "red" {
    if (ageMinutes < 60) return "green";
    if (ageMinutes < 180) return "amber";
    return "red";
}

function ageBadgeLabel(ageMinutes: number): string {
    if (ageMinutes < 60) return `${ageMinutes}m`;
    const h = Math.floor(ageMinutes / 60);
    const m = ageMinutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const COLOR_STYLES = {
    green: {
        card: "border-emerald-500/25 bg-emerald-500/[0.04]",
        dot: "#10b981",
        badge: "bg-emerald-500/15 text-emerald-300",
        amount: "text-emerald-400",
    },
    amber: {
        card: "border-amber-500/25 bg-amber-500/[0.04]",
        dot: "#f59e0b",
        badge: "bg-amber-500/15 text-amber-300",
        amount: "text-amber-400",
    },
    red: {
        card: "border-red-500/25 bg-red-500/[0.04]",
        dot: "#ef4444",
        badge: "bg-red-500/15 text-red-300",
        amount: "text-red-400",
    },
} as const;

function parseOrderItems(order: OpenOrder): { name: string; quantity: number; price: number }[] {
    const raw = order.items;
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => ({
        name: item.name || "Item",
        quantity: typeof item.quantity === "number" ? item.quantity : 1,
        price: typeof item.price === "number" ? item.price : 0,
    }));
}

export function SettleTableTabModal({
    isOpen,
    onClose,
    onSettlementSuccess,
}: SettleTableTabModalProps) {
    const [orders, setOrders] = useState<OpenOrder[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
    const [search, setSearch] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [urgentOnly, setUrgentOnly] = useState(false);
    const [isPaystackReady, setIsPaystackReady] = useState(false);

    // Auto-load on open
    useEffect(() => {
        if (!isOpen) return;
        loadOrders();
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Paystack readiness poll
    useEffect(() => {
        if (typeof window === "undefined") return;
        const check = () => { if ((window as any).PaystackPop) setIsPaystackReady(true); };
        check();
        const id = window.setInterval(check, 250);
        return () => window.clearInterval(id);
    }, []);

    const loadOrders = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const summary = await getOpenOrdersSummary();
            setOrders(summary.orders);
            setSelectedIds([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load orders");
        } finally {
            setIsLoading(false);
        }
    };

    // Derived
    const filtered = orders.filter((o) => {
        if (urgentOnly && orderAgeColor(o.ageMinutes) !== "red") return false;
        if (!search) return true;
        return (
            String(o.tableNumber ?? "").includes(search) ||
            (o.orderNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (o.customerName ?? "").toLowerCase().includes(search.toLowerCase())
        );
    });

    const selectedOrders = orders.filter((o) => selectedIds.includes(o.$id));
    const selectedTotal = selectedOrders.reduce((s, o) => s + o.totalAmount, 0);
    const grandTotal = orders.reduce((s, o) => s + o.totalAmount, 0);

    const freshCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "green").length;
    const ageingCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "amber").length;
    const urgentCount = orders.filter((o) => orderAgeColor(o.ageMinutes) === "red").length;

    const handleToggleSelect = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        setSelectedIds(
            selectedIds.length === orders.length ? [] : orders.map((o) => o.$id)
        );
    };

    const handlePaystackFlow = async (orderIds: string[], amount: number): Promise<string> => {
        const syntheticOrderId = `tab-multi-${Date.now()}`;
        const uniqueEmail = `${syntheticOrderId}@ampm.co.ke`;
        const initResult = await initializePaystackTransaction({
            email: uniqueEmail,
            amount,
            orderId: syntheticOrderId,
            metadata: { type: "table_tab_multi", orderIds },
        });

        if (!initResult.success || !initResult.access_code) {
            throw new Error(initResult.error || "Failed to initialize payment");
        }

        return new Promise<string>((resolve, reject) => {
            openPaystackWithAccessCode(initResult.access_code!, {
                onSuccess: async (reference) => {
                    try {
                        const verifyResult = await verifyPaystackTransaction(reference);
                        if (!verifyResult.success || verifyResult.data?.status !== "success") {
                            reject(new Error("Payment verification failed."));
                            return;
                        }
                        const expectedKobo = Math.round(amount * 100);
                        const paidKobo = Math.round((verifyResult.data.amount || 0) * 100);
                        if (Math.abs(paidKobo - expectedKobo) > 2) {
                            reject(new Error("Payment amount mismatch."));
                            return;
                        }
                        resolve(reference);
                    } catch (err) {
                        reject(err instanceof Error ? err : new Error("Verification failed"));
                    }
                },
                onCancel: () => reject(new Error("Payment cancelled.")),
                onError: (msg) => reject(new Error(msg)),
            });
        });
    };

    const settle = async (orderIds: string[]) => {
        if (!orderIds.length) return;
        setIsProcessing(true);
        setError(null);

        try {
            const amount = orders
                .filter((o) => orderIds.includes(o.$id))
                .reduce((s, o) => s + o.totalAmount, 0);

            let paymentReference = `manual-${paymentMethod}-${Date.now()}`;

            if (paymentMethod === "paystack") {
                if (!isPaystackReady) throw new Error("Paystack is still loading. Please wait.");
                paymentReference = await handlePaystackFlow(orderIds, amount);
            }

            const result = await settleSelectedOrders({
                orderIds,
                paymentMethod,
                paymentReference,
            });

            if (!result.success) {
                throw new Error(result.message || "Settlement failed.");
            }

            toast.success(`${result.updatedCount} order(s) settled`);

            if (result.consolidatedOrderId) {
                onSettlementSuccess?.(result.consolidatedOrderId, amount);
            }

            await loadOrders(); // Refresh list
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to settle orders.";
            setError(msg);
            toast.error(msg);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClose = () => {
        setOrders([]);
        setSelectedIds([]);
        setSearch("");
        setError(null);
        setUrgentOnly(false);
        onClose();
    };

    const paymentChips: { value: PaymentMethod; label: string }[] = [
        { value: "cash", label: "Cash" },
        { value: "pdq", label: "PDQ" },
        { value: "mpesa", label: "M-Pesa" },
        { value: "paystack", label: "Paystack" },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-[#0a0a0f] border-white/[0.08] text-white max-w-3xl max-h-[90vh] p-0 overflow-hidden flex flex-col">

                {/* Top bar */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 bg-neutral-900/80 border-b border-white/[0.07]">
                    <div>
                        <h2 className="text-[15px] font-bold">Settle Tab</h2>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                            {orders.length} open order{orders.length !== 1 ? "s" : ""} · Today
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-neutral-400 hover:text-white transition"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Stats row */}
                <div className="flex-shrink-0 flex gap-2.5 px-5 py-3 bg-neutral-950/70 border-b border-white/[0.06]">
                    {[
                        { label: "Fresh <1hr", value: freshCount, color: "text-emerald-400" },
                        { label: "Ageing 1–3hr", value: ageingCount, color: "text-amber-400" },
                        { label: "Urgent >3hr", value: urgentCount, color: "text-red-400" },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3 py-1.5">
                            <div className="text-[9px] uppercase tracking-[0.1em] text-neutral-500">{label}</div>
                            <div className={`text-[14px] font-bold ${color}`}>{value}</div>
                        </div>
                    ))}
                    <div className="rounded-[10px] bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 ml-auto">
                        <div className="text-[9px] uppercase tracking-[0.1em] text-neutral-500">Total outstanding</div>
                        <div className="text-[14px] font-bold text-white">{formatCurrency(grandTotal)}</div>
                    </div>
                </div>

                {/* Filter bar */}
                <div className="flex-shrink-0 flex gap-2 px-5 py-2.5 bg-neutral-950/70 border-b border-white/[0.06]">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by table, order #, name…"
                            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-[10px] pl-8 pr-3 py-1.5 text-[11px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-white/20"
                        />
                    </div>
                    <button
                        onClick={() => setUrgentOnly(false)}
                        className={`rounded-[20px] px-3 py-1 text-[10px] font-semibold border transition ${!urgentOnly ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-white/[0.04] border-white/10 text-neutral-400"}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setUrgentOnly(true)}
                        className={`rounded-[20px] px-3 py-1 text-[10px] font-semibold border transition ${urgentOnly ? "bg-red-500/15 border-red-500/40 text-red-300" : "bg-white/[0.04] border-white/10 text-neutral-400"}`}
                    >
                        🔴 Urgent
                    </button>
                </div>

                {/* Order list */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                    {isLoading && (
                        <div className="flex justify-center items-center py-10">
                            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                        </div>
                    )}

                    {!isLoading && error && (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    {!isLoading && !error && filtered.length === 0 && (
                        <div className="text-center py-10 text-sm text-neutral-500">
                            {orders.length === 0 ? "No unpaid orders — all tabs are clear." : "No orders match the filter."}
                        </div>
                    )}

                    {filtered.map((order) => {
                        const color = orderAgeColor(order.ageMinutes);
                        const styles = COLOR_STYLES[color];
                        const isSelected = selectedIds.includes(order.$id);
                        const isExpanded = expandedId === order.$id;
                        const items = parseOrderItems(order);
                        const tableLabel = order.tableNumber ? `Table ${order.tableNumber}` : "Bar";

                        return (
                            <div
                                key={order.$id}
                                className={`rounded-[14px] border overflow-hidden ${styles.card} ${isSelected ? "ring-2 ring-emerald-500" : ""}`}
                            >
                                {/* Card row */}
                                <div
                                    className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer"
                                    onClick={() => setExpandedId(isExpanded ? null : order.$id)}
                                >
                                    {/* Checkbox */}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleToggleSelect(order.$id); }}
                                        className={`w-[22px] h-[22px] rounded-[7px] border flex items-center justify-center flex-shrink-0 text-[12px] transition ${isSelected ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white/[0.04] border-white/15 text-neutral-300"}`}
                                    >
                                        {isSelected ? "✓" : ""}
                                    </button>

                                    {/* Age dot */}
                                    <div
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: styles.dot }}
                                    />

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-semibold truncate">
                                            {tableLabel} &nbsp;·&nbsp; #{order.orderNumber || order.$id.slice(-6)}
                                        </div>
                                        <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-1.5">
                                            {order.customerName || "Walk-in"}
                                            &nbsp;·&nbsp;
                                            {new Date(order.orderTime).toLocaleTimeString("en-KE", { timeStyle: "short" })}
                                            &nbsp;
                                            <span className={`rounded-[20px] px-1.5 py-0.5 text-[9px] font-bold ${styles.badge}`}>
                                                {ageBadgeLabel(order.ageMinutes)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Amount */}
                                    <div className={`text-[13px] font-bold flex-shrink-0 ${styles.amount}`}>
                                        {formatCurrency(order.totalAmount)}
                                    </div>

                                    {/* Expand icon */}
                                    <div className="text-neutral-500 flex-shrink-0">
                                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </div>
                                </div>

                                {/* Expanded items */}
                                {isExpanded && (
                                    <div className="border-t border-white/[0.06] px-3.5 pb-3 pt-2 space-y-1">
                                        {items.length === 0 ? (
                                            <p className="text-[10px] text-neutral-500">No item breakdown.</p>
                                        ) : (
                                            items.map((item, i) => (
                                                <div key={i} className="flex justify-between text-[10px] text-neutral-400 py-0.5">
                                                    <span>{item.quantity}× {item.name}</span>
                                                    <span>{formatCurrency(item.price * item.quantity)}</span>
                                                </div>
                                            ))
                                        )}
                                        <div className="flex justify-between text-[10px] font-bold border-t border-dashed border-white/[0.08] mt-1 pt-1.5">
                                            <span className={styles.amount}>Total</span>
                                            <span className={styles.amount}>{formatCurrency(order.totalAmount)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Sticky bottom bar */}
                <div className="flex-shrink-0 bg-neutral-900/95 border-t border-white/10 px-5 py-3">
                    {/* Selection summary + payment chips */}
                    <div className="flex items-end justify-between mb-2.5">
                        <div>
                            <div className="text-[11px] text-neutral-500">
                                {selectedIds.length} order{selectedIds.length !== 1 ? "s" : ""} selected
                            </div>
                            <div className="text-[18px] font-extrabold text-white">
                                {formatCurrency(selectedTotal)}
                            </div>
                        </div>
                        <div className="flex gap-1.5">
                            {paymentChips.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setPaymentMethod(value)}
                                    className={`rounded-[20px] px-2.5 py-1 text-[10px] font-semibold border transition ${paymentMethod === value ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white/[0.04] border-white/10 text-neutral-400"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            disabled={orders.length === 0}
                            className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold bg-transparent text-neutral-400 border border-white/10 hover:border-white/20 transition disabled:opacity-40"
                        >
                            {selectedIds.length === orders.length && orders.length > 0 ? "Deselect All" : "Select All"}
                        </button>
                        <button
                            type="button"
                            onClick={() => settle(selectedIds)}
                            disabled={!selectedIds.length || isProcessing}
                            className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold bg-sky-500 text-white hover:bg-sky-400 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                        >
                            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Charge Selected · {formatCurrency(selectedTotal)}
                        </button>
                        <button
                            type="button"
                            onClick={() => settle(orders.map((o) => o.$id))}
                            disabled={orders.length === 0 || isProcessing}
                            className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold bg-emerald-500 text-white hover:bg-emerald-400 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                        >
                            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Charge All · {formatCurrency(grandTotal)}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 4: Run `orderAgeColor` tests, expect PASS**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run __tests__/pos/settle-tab.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: TypeScript check**

```bash
cd /home/elyees/D/reservations/reservations && npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors in the new file.

- [ ] **Step 6: Commit**

```bash
git add components/pos/SettleTableTabModal.tsx __tests__/pos/settle-tab.test.ts
git commit -m "feat: rewrite SettleTableTabModal — full-screen, cross-table, color-coded cards"
```

---

## Task 6: Wire `POSInterface.tsx`

**Files:**
- Modify: `components/pos/POSInterface.tsx`

Changes:
1. Import `OrderReceiptModal` and `printReceipt`
2. Add `receiptOrder` state (type: a plain object matching `OrderReceiptModal`'s `ReceiptOrder` prop, not the full Appwrite `Order` type)
3. Change `onPrint` in `<OpenOrdersModal>` from `printOrderDocket(order.$id)` → `setReceiptOrder(order)`
4. Add `onSettlementSuccess` prop to `<SettleTableTabModal>` → build a synthetic order, call `setReceiptOrder`
5. Render `<OrderReceiptModal>` when `receiptOrder !== null`

Note: `PayNowModal` is not currently mounted in `POSInterface.tsx` — no wiring needed there.

- [ ] **Step 1: Add imports to `POSInterface.tsx`**

In `components/pos/POSInterface.tsx`, find the import block (lines 1–27) and add:

```typescript
import { OrderReceiptModal } from "./OrderReceiptModal";
```

Keep the existing `printOrderDocket` import — it is still used elsewhere in the file (e.g. when a new order is placed). The `printReceipt` call happens inside `OrderReceiptModal` itself via `lib/print.utils`, so no additional import is needed in `POSInterface.tsx`.

- [ ] **Step 2: Add `receiptOrder` state**

Find the block of `useState` declarations in `POSInterface.tsx` (around lines 40–100). Add near the other modal-related state:

```typescript
const [receiptOrder, setReceiptOrder] = useState<{
    $id: string;
    orderNumber?: string;
    tableNumber?: number;
    customerName?: string;
    waiterName?: string;
    orderTime: string;
    items: any[];
    subtotal: number;
    totalAmount: number;
    paymentStatus: string;
} | null>(null);
const [receiptPaymentMethod, setReceiptPaymentMethod] = useState<string | undefined>(undefined);
const [receiptPaymentRef, setReceiptPaymentRef] = useState<string | undefined>(undefined);
```

- [ ] **Step 3: Change `onPrint` in `<OpenOrdersModal>`**

Find (around line 659):
```typescript
onPrint={async (order) => {
    await printOrderDocket(order.$id);
}}
```

Replace with:
```typescript
onPrint={(order) => {
    setReceiptOrder(order);
    setReceiptPaymentMethod(undefined);
    setReceiptPaymentRef(undefined);
}}
```

- [ ] **Step 4: Add `onSettlementSuccess` to `<SettleTableTabModal>`**

Find (around line 644):
```typescript
<SettleTableTabModal
    isOpen={isSettleTabModalOpen}
    onClose={() => setIsSettleTabModalOpen(false)}
    onEdit={handleEditOrder}
/>
```

Replace with:
```typescript
<SettleTableTabModal
    isOpen={isSettleTabModalOpen}
    onClose={() => setIsSettleTabModalOpen(false)}
    onSettlementSuccess={(consolidatedOrderId, totalAmount) => {
        const subtotal = totalAmount / 1.16;
        setReceiptOrder({
            $id: consolidatedOrderId,
            orderNumber: consolidatedOrderId,
            orderTime: new Date().toISOString(),
            items: [],
            subtotal,
            totalAmount,
            paymentStatus: "paid",
        });
        setReceiptPaymentMethod(undefined);
        setReceiptPaymentRef(undefined);
    }}
/>
```

Note: The new `SettleTableTabModal` no longer has an `onEdit` prop — remove it.

- [ ] **Step 5: Render `<OrderReceiptModal>`**

In the JSX return, after the `<DocketPreviewModal>` closing tag (around line 682), add:

```tsx
{/* Receipt Modal — shown after print button tap or settlement */}
{receiptOrder && (
    <OrderReceiptModal
        isOpen={!!receiptOrder}
        onClose={() => setReceiptOrder(null)}
        order={receiptOrder}
        paymentMethod={receiptPaymentMethod}
        paymentReference={receiptPaymentRef}
    />
)}
```

- [ ] **Step 6: TypeScript check**

```bash
cd /home/elyees/D/reservations/reservations && npx tsc --noEmit 2>&1 | head -40
```

Fix any type errors. Common issue: `onEdit` prop removed from `SettleTableTabModal` — remove from call site if not already done.

- [ ] **Step 7: Run full test suite**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run
```

Expected: same pass count as before (any pre-existing failures are acceptable). Fix any new failures.

- [ ] **Step 8: Commit**

```bash
git add components/pos/POSInterface.tsx
git commit -m "feat: wire OrderReceiptModal into POSInterface — onPrint and settlement success"
```

---

## Task 7: Cron reschedule + specialInstructions cap fix

**Files:**
- Modify: `vercel.json`
- Modify: `app/api/cron/stale-orders/route.ts`

Two small, independent fixes.

- [ ] **Step 1: Update cron schedule in `vercel.json`**

In `vercel.json`, change:
```json
"schedule": "30 3 * * *"
```
To:
```json
"schedule": "30 4 * * *"
```

(4:30 AM UTC = 7:30 AM Africa/Nairobi)

- [ ] **Step 2: Fix `specialInstructions` cap in `app/api/cron/stale-orders/route.ts`**

At line 58, change:
```typescript
const nextSi = (prev + tag).slice(0, 9500);
```
To:
```typescript
const nextSi = (prev + tag).slice(0, 950);
```

- [ ] **Step 3: Verify no tests broken**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run
```

Expected: same pass count as before.

- [ ] **Step 4: Commit**

```bash
git add vercel.json app/api/cron/stale-orders/route.ts
git commit -m "fix: reschedule stale-orders cron to 7:30 AM Nairobi + fix specialInstructions cap"
```

---

## Final Verification

After all tasks are complete:

```bash
# Full test suite
source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run

# TypeScript clean build
cd /home/elyees/D/reservations/reservations && npx tsc --noEmit
```

All existing passing tests should still pass. New tests in `__tests__/pos/settle-tab.test.ts` and `__tests__/print/print-utils.test.ts` should pass.
