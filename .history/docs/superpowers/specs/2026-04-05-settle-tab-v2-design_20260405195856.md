# Settle Tab v2 — Design Spec

**Date:** 2026-04-05  
**Status:** Approved  

---

## Goal

Overhaul the Settle Table Tab modal into a full-screen, tablet-optimised experience that:
1. Fixes the `"Failed to settle full tab: {}"` runtime error
2. Makes the order list scrollable with a sticky payment/action bar
3. Loads **all** unpaid orders across every table (no upfront table filter required)
4. Color-codes orders by age to signal urgency
5. Reschedules the stale-orders cron to 7:30 AM Nairobi

---

## Background — the `{}` bug

`settleTableTabAndCreateOrder` contains a "settlement lock" mechanism that writes `paymentStatus: "settling"` to mark orders in-progress. The Appwrite schema's `paymentStatus` enum only allows `unpaid | paid | cancelled`. Writing `"settling"` causes an Appwrite SDK error that serialises as `{}` in `console.error` (non-enumerable properties). This error propagates to the modal's catch block and surfaces as `"Failed to settle full tab."`.

The lock is removed entirely. Appwrite's atomic document writes make application-level locking unnecessary for this use case.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/actions/pos.actions.ts` | Add `getOpenOrdersSummary()`. Fix `settleTableTabAndCreateOrder` (remove locking block). |
| `components/pos/SettleTableTabModal.tsx` | Full rewrite — full-screen modal, auto-load, color codes, sticky bar. |
| `components/pos/OrderReceiptModal.tsx` | New — digital receipt preview modal with auto-print on open. |
| `lib/print.utils.ts` | Add `printReceipt(orderId)` helper. |
| `components/pos/POSInterface.tsx` | Wire `receiptOrder` state; `onPrint` from OpenOrdersModal opens receipt modal. |
| `components/pos/PayNowModal.tsx` | No changes to the component itself — parent handles receipt show on `onPaymentSuccess`. |
| `vercel.json` | Cron schedule `30 3 * * *` → `30 4 * * *` |
| `__tests__/pos/settle-tab.test.ts` | Unit tests for `getOpenOrdersSummary` and age-color logic |

---

## Server Action: `getOpenOrdersSummary()`

### Signature

```typescript
export const getOpenOrdersSummary = async (): Promise<OpenOrdersSummary>
```

### Behaviour

- Queries Appwrite `ORDERS_COLLECTION_ID` for all documents where:
  - `businessId` = current auth context business ID
  - `paymentStatus` = `"unpaid"`
  - `isDeleted` ≠ `true` (exclude soft-deleted)
- Returns up to 250 orders (Appwrite single-page limit; sufficient for one venue's daily tab)
- Sorted by `orderTime` ascending — oldest (most urgent) first
- Each order in the response includes a computed `ageMinutes: number` field (current time minus `orderTime` in minutes)

### Return type

```typescript
interface OpenOrdersSummary {
  orders: OpenOrder[];
  totalAmount: number;
  subtotal: number;
  orderCount: number;
}

interface OpenOrder {
  $id: string;
  orderNumber: string;
  tableNumber?: number;
  customerName?: string;
  waiterName?: string;
  orderTime: string;           // ISO string
  ageMinutes: number;          // computed: Math.floor((now - orderTime) / 60_000)
  totalAmount: number;
  subtotal: number;
  items: any[];                // parsed from order.items (JSON string or array)
  paymentStatus: string;
}
```

### Error handling

- If `DATABASE_ID` or `ORDERS_COLLECTION_ID` is missing → throw `new Error("Database configuration is missing")`
- If Appwrite query fails → throw the error (let modal catch and display it)
- Empty result (no unpaid orders) is a valid success: returns `{ orders: [], totalAmount: 0, subtotal: 0, orderCount: 0 }`

---

## Bug Fix: `settleTableTabAndCreateOrder`

### What is removed

The entire "CHECK-THEN-SET" settlement lock block:

```typescript
// REMOVE: settlement lock check (listDocuments for paymentStatus: "settling")
// REMOVE: settlingPromises (Promise.allSettled that writes paymentStatus: "settling")
// REMOVE: successfullyMarked check
```

### What remains

The function flow after the fix:

1. Validate env vars
2. `getAuthContext()` + `validateBusinessContext()`
3. `getTableDailyTabSummary()` → get unpaid orders for table+date
4. Early return if no orders
5. Parse + flatten items → build consolidated order
6. `databases.createDocument(...)` → consolidated receipt order
7. `Promise.allSettled(...)` → mark all source orders as `paymentStatus: "paid"`
8. Return `{ success: true, consolidatedOrderId, updatedCount, totalAmount }`

No other logic changes. `settleSelectedOrders` and `settleTableTabForDate` are unchanged.

---

## UI: `SettleTableTabModal` Rewrite

### Shell

```
Dialog: open={isOpen}, max-w-3xl, max-h-[90vh], overflow hidden
  ├── TopBar (sticky, flex-shrink-0)
  │     Title "Settle Tab" · subtitle "N open orders · Today"
  │     Close button
  ├── StatsRow (sticky, flex-shrink-0)
  │     Fresh <1hr | Ageing 1–3hr | Urgent >3hr | Total outstanding
  │     (counts computed client-side: orders.filter(o => orderAgeColor(o.ageMinutes) === "green").length, etc.)
  ├── FilterBar (sticky, flex-shrink-0)
  │     Search input (table #, order #, customer name)
  │     Filter chips: All | 🔴 Urgent | active table filter if set
  ├── OrderList (overflow-y-auto, flex-1)
  │     OrderCard × N  (see below)
  └── StickyBar (sticky bottom, flex-shrink-0)
        Selected count + amount
        Payment chips: Cash | PDQ | M-Pesa | Paystack
        Buttons: Select All | Charge Selected (Ksh X) | Charge All (Ksh Y)
```

### Color coding

| Age | Border/background tint | Dot colour | Badge |
|-----|------------------------|------------|-------|
| `ageMinutes < 60` | emerald-500/25 | `#10b981` | green `Xm` |
| `60 ≤ ageMinutes < 180` | amber-500/25 | `#f59e0b` | amber `Xhr Ym` |
| `ageMinutes ≥ 180` | red-500/25 | `#ef4444` | red `Xhr Ym` |

Color is computed **client-side** from `order.ageMinutes`. No server involvement.

Helper:
```typescript
function orderAgeColor(ageMinutes: number): "green" | "amber" | "red" {
  if (ageMinutes < 60) return "green";
  if (ageMinutes < 180) return "amber";
  return "red";
}
```

### OrderCard

```
OrderCard (border + bg tinted by age)
  ├── CheckBox (toggles selection)
  ├── AgeDot (coloured circle)
  ├── Info: "Table N · #ORD-XXXX" / customer name · time · AgeBadge
  ├── Amount (coloured by age)
  └── Expand chevron (▼/▲)

  [Expanded]:
  ├── Item rows: "Qty× Name — Ksh X"
  └── Total line (dashed separator above)
```

Tap the card row (outside checkbox) to expand/collapse. Tap checkbox to select/deselect.

Items are parsed using the same `parseOrderItems` pattern already in the existing modal (handles both JSON-string and array forms of `order.items`).

### State

```typescript
const [orders, setOrders] = useState<OpenOrder[]>([]);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [selectedIds, setSelectedIds] = useState<string[]>([]);
const [expandedId, setExpandedId] = useState<string | null>(null);
const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
const [search, setSearch] = useState("");
const [isProcessing, setIsProcessing] = useState(false);
```

### Data loading

- `useEffect` with `[isOpen]` dep: when modal opens, call `getOpenOrdersSummary()` and populate `orders`
- No manual "Load Tab" button — auto-loads on open
- Refresh after any settlement: re-call `getOpenOrdersSummary()` and update state

### Search/filter

Client-side filter on `orders` array:
```typescript
const filtered = orders.filter(o =>
  !search ||
  String(o.tableNumber).includes(search) ||
  (o.orderNumber || "").toLowerCase().includes(search.toLowerCase()) ||
  (o.customerName || "").toLowerCase().includes(search.toLowerCase())
);
```

### Derived values

```typescript
const selectedOrders = orders.filter(o => selectedIds.includes(o.$id));
const selectedTotal = selectedOrders.reduce((s, o) => s + o.totalAmount, 0);
const grandTotal = orders.reduce((s, o) => s + o.totalAmount, 0);
```

**"Charge All" operates on the full unfiltered `orders` list**, not the search-filtered view. The button label shows the unfiltered grand total (`grandTotal`) to make this clear to staff. Search/filter only affects what's visible for selection — it never silently restricts a full-tab charge.

### Settlement flow (unchanged logic, new wiring)

- **Charge Selected**: calls existing `settleSelectedOrders({ orderIds: selectedIds, paymentMethod, paymentReference })`
- **Charge All**: calls existing `settleSelectedOrders({ orderIds: orders.map(o => o.$id), paymentMethod, paymentReference })`
- Paystack: `handlePaystackFlow` is adapted — the synthetic order ID becomes `tab-multi-${Date.now()}` (no table number available). The metadata object changes from `{ tableNumber, date, type, orders }` to `{ type: "table_tab_multi", orderIds: orderIdsBeingSettled }`. The Paystack amount and the verify/amount-check logic are unchanged.
- On success: `toast.success(...)`, re-load summary, push receipt if `consolidatedOrderId` returned

`settleTableTabAndCreateOrder` is **not used** by the new modal — `settleSelectedOrders` handles all cases since it already consolidates multi-order settlements. `settleTableTabAndCreateOrder` remains available for any other callers.

---

---

## Receipt Modal: `OrderReceiptModal`

### Purpose

A lightweight customer-facing receipt modal. Shown in two situations:
1. **Staff clicks the print button** on a row in the Open Orders tab → preview the receipt before printing
2. **Payment succeeds** (via PayNowModal or SettleTableTabModal settlement) → show the paid receipt

### Props

```typescript
interface OrderReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    $id: string;
    orderNumber?: string;
    tableNumber?: number;
    customerName?: string;
    waiterName?: string;
    orderTime: string;
    items: any[];        // parsed with parseOrderItems
    subtotal: number;
    totalAmount: number;
    paymentStatus: string;
  };
  paymentMethod?: string;    // "cash" | "pdq" | "mpesa" | "paystack" — shown when paid
  paymentReference?: string; // shown when paid
}
```

### Auto-print on open

`useEffect` with `[isOpen]` dep: when `isOpen` becomes true, call `window.queuePrintJob('receipt', \`orderId:${order.$id}\`)`.

This auto-queues the print job to the admin terminal without the staff pressing any button. A "Print Again" button allows re-queuing if needed.

### Layout

```
Dialog: max-w-sm, dark background
  ├── Header: order number + table + time
  ├── PAID / UNPAID badge (emerald if paid, amber if unpaid)
  ├── Items list: "Qty× Name — Ksh X" rows
  ├── Dashed separator
  ├── Subtotal row
  ├── VAT (16%) row
  ├── Total row (bold)
  ├── [if paid] Payment method + reference line
  └── Footer: "Print Again" (ghost, re-queues) | "Done" (closes)
```

VAT is computed client-side: `vat = totalAmount - subtotal`. If `subtotal === 0` or not set, fall back to `subtotal = totalAmount / 1.16` and `vat = totalAmount - subtotal`.

### `printReceipt` helper in `lib/print.utils.ts`

```typescript
export async function printReceipt(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  // mirrors printOrderDocket but queues jobType 'receipt'
  const queue = getQueueFn();
  if (!queue) { toast.error(BRIDGE_NOT_READY_MSG); return { success: false, error: 'PrintBridge not mounted' }; }
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

### Wiring in `POSInterface.tsx`

Add state:
```typescript
const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
```

Change `onPrint` prop in `<OpenOrdersModal>` (currently calls `printOrderDocket(order.$id)` silently):
```typescript
onPrint={(order) => setReceiptOrder(order)}
```

Add `onPaymentSuccess` handler at the `<PayNowModal>` usage site — after settlement succeeds the parent already has the order; call `setReceiptOrder(order)` there.

Render:
```tsx
{receiptOrder && (
  <OrderReceiptModal
    isOpen={!!receiptOrder}
    onClose={() => setReceiptOrder(null)}
    order={receiptOrder}
    paymentMethod={lastPaymentMethod}  // from existing state
    paymentReference={lastPaymentRef}  // from existing state
  />
)}
```

### Wiring in `SettleTableTabModal.tsx` (new modal, this spec)

After a successful `settleSelectedOrders` / `settleSelectedOrders` call returns a `consolidatedOrderId`, construct a minimal order object from the settled orders and call `setReceiptOrder(consolidatedOrder)` on the parent, OR — simpler — pass an `onSettlementSuccess: (consolidatedOrderId: string) => void` callback and let `POSInterface` open the modal with a refetched or synthetic order.

**Chosen approach:** Add `onSettlementSuccess?: (consolidatedOrderId: string, totalAmount: number) => void` prop to `SettleTableTabModal`. On success, call it. `POSInterface` opens `OrderReceiptModal` with a synthetic order object `{ $id: consolidatedOrderId, orderNumber: consolidatedOrderId, totalAmount, subtotal: totalAmount/1.16, items: [], paymentStatus: 'paid', orderTime: new Date().toISOString() }`.

---

## Cron Reschedule

**File:** `vercel.json`

```json
// Before
{ "path": "/api/cron/stale-orders", "schedule": "30 3 * * *" }

// After
{ "path": "/api/cron/stale-orders", "schedule": "30 4 * * *" }
```

4:30 AM UTC = 7:30 AM Africa/Nairobi. The cron only cancels orders from **before today** (Nairobi), so late-night orders placed at 6 AM are safe — they won't be cancelled until 7:30 AM the following day at the earliest.

Also fix the `specialInstructions` cap in the cron handler: line 58 `slice(0, 9500)` → `slice(0, 950)` to match the rest of the codebase.

---

## Tests: `__tests__/pos/settle-tab.test.ts`

```typescript
describe('getOpenOrdersSummary', () => {
  it('returns empty summary when no unpaid orders exist')
  it('sorts orders by orderTime ascending')
  it('computes ageMinutes correctly')
  it('throws when DATABASE_ID is missing')
})

describe('orderAgeColor', () => {
  it('returns green for ageMinutes < 60')
  it('returns amber for ageMinutes between 60 and 179')
  it('returns red for ageMinutes >= 180')
})
```

---

## What Is NOT Changing

- `settleSelectedOrders` — logic unchanged, just called from new modal wiring
- `settleTableTabForDate` — untouched
- `getTableDailyTabSummary` / `getUnpaidOrdersForTableOnDate` — untouched
- `/pos/receipt/[orderId]` page — untouched
- Paystack flow helpers — untouched
- `PayNowModal.tsx` — component logic untouched; receipt shown by parent on `onPaymentSuccess`
- All other POS modals — untouched
