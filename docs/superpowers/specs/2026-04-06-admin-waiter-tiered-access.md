# Admin/Waiter Tiered Access + Order Void — Design Spec

**Date:** 2026-04-06  
**Status:** Approved  
**Scope:** Role-scoped order visibility, soft-delete (Void) with audit trail, Void button hidden from waiters

---

## Background

All staff currently share one Clerk organisation. The same `getOpenOrdersSummary` query returns all unpaid orders regardless of who is logged in. There is no way to delete an order without removing it from the database — which creates compliance risk. Admin should see everything; waiters should see only their own tables.

---

## What Is NOT Changing

- PrintBridge role gate (`org:admin` only processes print jobs) — already implemented
- `paymentStatus` enum — unchanged
- `settleSelectedOrders` — unchanged
- All existing Paystack / receipt / print flows — unchanged

---

## 1. Appwrite Schema Changes

Two new optional fields on the **`orders`** collection:

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `isVoided` | Boolean | No | `false` |
| `voidReason` | String (size 500) | No | — |
| `voidedBy` | String (size 100) | No | — |
| `voidedAt` | DateTime | No | — |

Add via Appwrite MCP **before** implementing any code changes.

> `isVoided` orders are excluded from all list queries (`Query.notEqual("isVoided", true)` alongside the existing `paymentStatus` filter).

---

## 2. Role-Aware Order Visibility

### 2.1 `getOpenOrdersSummary()` — role-scoped query

The server action receives an optional `waiterId` param. If provided, it adds `Query.equal("waiterId", waiterId)` to the query. If omitted (admin call), all orders for the business are returned.

**Updated signature:**
```typescript
export const getOpenOrdersSummary = async (
  opts?: { waiterId?: string }
): Promise<OpenOrdersSummary>
```

**Query build:**
```typescript
const queries = [
  Query.equal("businessId", businessId),
  Query.equal("paymentStatus", "unpaid"),
  Query.notEqual("isDeleted", true),
  Query.notEqual("isVoided", true),       // exclude voided orders
  Query.orderAsc("orderTime"),
  Query.limit(250),
];
if (opts?.waiterId) {
  queries.push(Query.equal("waiterId", opts.waiterId));
}
```

### 2.2 `getClosedOrders()` / `getOrdersForTable()` — same pattern

Any server action that lists orders for the UI must also exclude `isVoided: true`. If a specific function already filters by table/date, add `Query.notEqual("isVoided", true)` to it.

### 2.3 Call sites

**`SettleTableTabModal.tsx`** (new rewrite):
- Gets `membership.role` and `user.id` from `useOrganization()` / `useUser()`
- Admin: calls `getOpenOrdersSummary()` with no `waiterId`
- Waiter: calls `getOpenOrdersSummary({ waiterId: user.id })`

**`OpenOrdersModal.tsx`**:
- Same pattern — pass `waiterId` for `org:member` calls

---

## 3. Void System

### 3.1 Server action: `voidOrder()`

```typescript
export const voidOrder = async ({
  orderId,
  reason,
}: {
  orderId: string;
  reason: string;
}): Promise<{ success: boolean; message?: string }> 
```

**Logic:**
1. `getAuthContext()` + `validateBusinessContext(businessId)`
2. Verify caller has `org:admin` role (use Clerk `auth().orgRole`). Throw `"Unauthorised — only admins can void orders"` if not.
3. `databases.updateDocument(...)` with:
   ```typescript
   {
     isVoided: true,
     voidReason: reason.trim().slice(0, 500),
     voidedBy: userId,
     voidedAt: new Date().toISOString(),
   }
   ```
4. Return `{ success: true }`

### 3.2 `VoidConfirmationModal.tsx` — new component

```typescript
interface VoidConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: { $id: string; orderNumber?: string; totalAmount: number };
  onVoided: () => void;   // called after successful void to refresh list
}
```

**Layout:**
```
Dialog: max-w-sm, dark background
  ├── Header: "Void Order" + order number + amount (red badge)
  ├── Warning: "This cannot be undone. The order remains in the database for audit."
  ├── Label: "Reason for voiding *"
  ├── Textarea: required, minLength 5, maxLength 500
  ├── Paste-ref field: "Confirm by typing order number"
  │   (Input must match order.orderNumber before Submit enables)
  └── Footer: "Cancel" | "Void Order" (red button, disabled until reason + ref match)
```

**On submit:**
1. Calls `voidOrder({ orderId: order.$id, reason })`
2. `toast.success("Order voided")` → `onVoided()` → `onClose()`
3. On error: `toast.error(...)`, keep modal open

### 3.3 Void button placement

**`OpenOrdersModal.tsx`:**
- Shows a `Trash2` icon button per order row (red, `size-4`)
- Conditionally rendered: `{isAdmin && <VoidButton />}`
- Tapping opens `VoidConfirmationModal` with that order

**`ClosedOrdersModal.tsx`:**
- Same pattern

**`SettleTableTabModal.tsx` (new rewrite):**
- OrderCard expanded view: shows "Void" button only when `isAdmin`

### 3.4 Role detection in client components

```typescript
import { useOrganization } from "@clerk/nextjs";

const { membership } = useOrganization();
const isAdmin = membership?.role === "org:admin";
```

This is already the pattern used in `PrintBridge.tsx` — consistent.

---

## 4. Files Changed

| File | Change |
|------|--------|
| `lib/actions/pos.actions.ts` | Add `voidOrder()`. Update `getOpenOrdersSummary(opts?)` with `waiterId` scoping + `isVoided` exclusion. Update any other list queries to exclude `isVoided`. |
| `components/pos/VoidConfirmationModal.tsx` | **New** — reason modal with order-ref confirmation |
| `components/pos/OpenOrdersModal.tsx` | Add `Trash2` void button (admin only); wire `VoidConfirmationModal`; refresh list on void |
| `components/pos/ClosedOrdersModal.tsx` | Same as OpenOrdersModal |
| `components/pos/SettleTableTabModal.tsx` | Pass `waiterId` to `getOpenOrdersSummary` for waiters; show void button in expanded card for admins |

---

## 5. Tests

```typescript
describe('voidOrder', () => {
  it('marks order as voided with reason, userId, timestamp')
  it('throws when caller is not org:admin')
  it('throws when reason is empty')
  it('excludes voided orders from getOpenOrdersSummary')
})

describe('getOpenOrdersSummary — scoping', () => {
  it('returns all unpaid orders when no waiterId provided')
  it('returns only this waiter's orders when waiterId provided')
  it('excludes isVoided orders regardless of role')
})
```

---

## 6. What Is NOT In This Spec

- Un-void / restore functionality (not requested)
- Void audit log UI (records exist in DB, no UI needed yet)
- Waiter-scoped Closed Orders (waiter sees all closed for now — lower urgency)
- Push notifications to admin when waiter voids (not requested)
