# Print System, Tablet UI & Org-Based Print Routing — Design Spec

**Date:** 2026-04-05  
**Status:** Approved  
**Scope:** Three coordinated enhancements to the AM|PM POS system

---

## 1. Problem Statement

Three issues make the current POS unusable for a multi-waiter tablet deployment:

1. **Print never completes.** `printOrderDocket` either silently discards the result (`void` call) or tries to open a USB device on the waiter's tablet (which has no printer). The `kitchen_docket` branch in `PrintBridge.executePrintJob` fetches ESC/POS bytes then throws them away — they are never sent to the printer.

2. **Tablet UI is broken.** At the `md` breakpoint (768 px) the desktop sidebar (fixed 400 px) steals more than half the viewport. All action buttons — Open Orders, Closed Orders, Settle Table, Dashboard — are hidden on tablet. Waiters can only see products and categories.

3. **No central print routing.** All staff share one Clerk organisation. The thermal printer is USB-connected only to the admin's machine. There is no mechanism to route waiter-generated print jobs to the admin terminal.

---

## 2. Solution Overview

| Area | Solution |
|------|----------|
| Print bugs | Fix every broken code path; always queue via Appwrite; never attempt USB from a waiter device |
| Digital docket | New `DocketPreviewModal` mirrors the physical receipt format and surfaces on every print trigger |
| Print routing | Role-based: `org:admin` PrintBridge processes jobs; `org:member` PrintBridge queues only |
| Tablet portrait | Bottom tab bar (Menu · Cart · Orders · Settle · Closed) + full-width product grid |
| Tablet landscape | 150 px compact sidebar + full action header + 👤 person icon for dashboard |

---

## 3. Print System

### 3.1 Architecture: Queue-Always Model

All devices — waiter tablets and admin desktop — use the same code path:

```
printOrderDocket(orderId)
  → window.queuePrintJob("captain_docket", `orderId:${orderId}`)
      → Appwrite PRINT_JOBS document created (status: "pending", businessId, jobType)
          → PrintBridge on org:admin terminal picks it up
              → executePrintJob → printRawCommands → USB thermal printer
```

`ThermalPrinterClient` is **never instantiated on waiter devices**. USB is only touched inside `PrintBridge.executePrintJob` on the admin terminal.

### 3.2 Changes to `lib/print.utils.ts`

- **Remove** the `ThermalPrinterClient.loadConfig()` branch entirely.
- `printOrderDocket` always calls `tryQueuePrintJob`. If `window.queuePrintJob` is unavailable (PrintBridge not mounted), show `toast.error` with an actionable message: *"Print bridge not ready — reload the page or contact the admin."*
- Return `{ success: true }` immediately after queuing (the job is async; the tablet's job is done).

### 3.3 Changes to `components/pos/PrintBridge.tsx`

**Role gate — add at top of `setupPrintListener`:**

`useAuth()` does **not** expose `orgRole`. Use `useOrganization()` which provides the membership object:

```typescript
const { membership } = useOrganization(); // from @clerk/nextjs
// Clerk's default admin role slug is 'org:admin' — verify against the
// dashboard (Settings → Roles) before deploying if roles were customised.
if (membership?.role !== 'org:admin') return; // waiters: mount silently, never process
```

`membership` is `null` until the organisation context loads. The early return is safe because `setupPrintListener` is called inside a `useEffect` that will re-run when `membership` becomes available.

**Fix `executePrintJob` — `kitchen_docket` branch** (currently fetches bytes then discards them):
```typescript
// BEFORE (broken):
const res = await fetch('/api/print/thermal', { ... });
if (res.ok) { /* bytes discarded */ }

// AFTER (fixed):
const res = await fetch('/api/print/thermal', { ... });
const data = await res.json();
if (data.commands) {
  await printer.printRawCommands(data.commands);
}
```

**Fix silent `setupPrintListener` failure:** Replace `console.error` with `toast.error` when `NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID` or `NEXT_PUBLIC_DATABASE_ID` is missing.

**Fix `window.queuePrintJob` assignment:** Move from render body into a `useEffect` (run once on mount) so it isn't reassigned on every render.

### 3.4 Changes to `components/pos/POSInterface.tsx`

Replace the fire-and-forget `void printOrderDocket(...)` pattern.

**Add to Tab flow:**
```typescript
const newOrder = await createTabOrderFromCart({ ... });
clearCart();
void printOrderDocket(newOrder.$id);          // queues captain_docket
openDocketModal(newOrder, 'new');              // show digital docket
```

**Update Order flow** (edit save):

`computeKitchenDeltaForOrder` returns `{ name, quantity }` only. Prices must be
joined from `cart` **before** `clearCart()` is called, while cart items are still in state:

```typescript
const { deltaItems, newSnapshotLines } = await computeKitchenDeltaForOrder(...);

// Enrich with price from current cart before clearing
const enrichedDelta = deltaItems.map(d => {
  const cartItem = cart.find(c => c.name === d.name);
  return { ...d, price: cartItem?.price ?? 0 };
});

if (enrichedDelta.length > 0) {
  void printKitchenDelta(editingOrder.$id, enrichedDelta);   // queues kitchen_delta
  openDocketModal({ order: editingOrder, deltaItems: enrichedDelta }, 'addition');
}
await updateOrder(...);
clearCart();
setEditingOrder(null);
```

Note: `clearCart()` is moved **after** `updateOrder` to preserve cart prices for the enrich step.

**Removing the print gate on `updateOrder`:** The previous implementation blocked `updateOrder` if `printKitchenDeltaDirect` failed. This gate is removed because print is now asynchronous (queue-based). If the admin terminal is offline, the order is still saved and the docket prints when the terminal reconnects. The waiter's digital docket modal serves as a visual fallback — they can relay the addition verbally to the kitchen if needed. This tradeoff is accepted; a future enhancement can add an offline indicator.

### 3.5 ESC/POS Docket Format

The physical docket format (from approved reference photo) must be replicated exactly in `generateESCPOSKitchenDocket` inside `app/api/print/thermal/route.ts`:

```
AM | PM                        [centered, double-height bold]
CAPTAIN ORDER                  [centered, bold]
Terminal: Main Counter         [centered, normal]
-------------------------------- [dashed]
Order #: KITCHEN-XXXX
Date: DD/MM/YYYY
Time: HH:MM:SS
Server: <waiterName>
Type: dine_in | Table: #N
-------------------------------- [dashed]
Qty  Item                 Price  [header row]
-------------------------------- [dashed]
1x   Savanna             350.00
2x   Pilsner             600.00
-------------------------------- [dashed]
TOTAL:                 1,300.00  [bold]
```

For delta/addition dockets (`generateESCPOSKitchenDelta`), insert after the terminal line:
```
*** ADDITION - NOT A FULL ORDER ***   [inverted/bold banner]
```
And replace `TOTAL:` with `ADDITION:` showing only the delta sum.

---

## 4. Digital Docket Modal

### 4.1 New Component: `components/pos/DocketPreviewModal.tsx`

A dark-overlay modal that renders a paper-white thermal-receipt preview on the waiter's tablet.

**Props:**
```typescript
interface DocketPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  order: {
    orderNumber?: string;
    tableNumber?: number;
    waiterName?: string;
    totalAmount: number;
    items: CartItem[];
    createdAt?: string;
  };
  // For 'addition': enriched delta items including price, derived from cart
  // before clearCart() is called. See data-flow note in section 7.
  deltaItems?: { name: string; quantity: number; price: number }[];
  type: 'new' | 'addition';
}
```

**Layout:**
- Dark modal overlay (`bg-black/80 backdrop-blur-sm`)
- Paper-white receipt card (`bg-white font-mono text-black`)
  - Torn-paper top/bottom edge (CSS repeating-gradient)
  - Header: AM|PM bold large, CAPTAIN ORDER bold, Terminal: Main Counter
  - For `addition`: yellow `⚡ ADDITION — NOT A FULL ORDER ⚡` banner
  - Order metadata block (Order #, Date, Time, Server, Table)
  - Dashed separator
  - Column header: `Qty  Item  Price`
  - Items list (all items for `new`; `deltaItems` for `addition`)
  - Dashed separator
  - `TOTAL:` (new) or `ADDITION:` (addition) with formatted amount
- Status pill: `✓ Sent to printer` in emerald
- Two buttons: **Edit Order** (outline) · **Done** (emerald fill)

**Print status:** The modal mounts with status `queued`. It does not poll for job completion — the admin terminal handles that asynchronously.

### 4.2 Replacing `OrderConfirmationModal` in the Add-to-Tab Flow

`OrderConfirmationModal` is already cleaned up (Edit + Done only). `DocketPreviewModal` replaces it specifically for the post-Add-to-Tab and post-Update-Order moments. `OrderConfirmationModal` remains available for other uses (e.g. viewing orders from `OpenOrdersModal`).

---

## 5. Tablet UI

### 5.1 Breakpoint Strategy

| Context | Trigger | Layout |
|---------|---------|--------|
| Phone | `< 768px` | Mobile: 2-col grid, floating cart FAB, hamburger menu |
| Tablet portrait | `≥ 768px AND orientation: portrait` | Full-width grid, bottom tab bar |
| Tablet landscape | `≥ 768px AND orientation: landscape` (up to 1023px) | 3-col grid, 150 px compact sidebar, full action header |
| Desktop | `≥ 1024px` | 4–6 col grid, 400 px full sidebar, full action header |

CSS implementation uses `@media (min-width: 768px) and (orientation: portrait)` alongside the existing Tailwind `md:` and `lg:` classes. No JavaScript orientation detection needed.

### 5.2 Portrait Tablet — `MobileCart.tsx` becomes `TabletPortraitNav`

The component handles both phone (< 768px) and portrait tablet (≥ 768px portrait):

**Phone (< 768px) — unchanged:**
- Floating circular cart FAB bottom-right
- Slide-up drawer on tap

**Portrait tablet (≥ 768px portrait):**
- No FAB
- Persistent bottom tab bar with 5 tabs:
  - 🍽️ Menu (active state = green)
  - 🛒 Cart — badge shows item count; tapping slides up the order panel
  - 📋 Orders — opens `OpenOrdersModal`
  - 💳 Settle — opens `SettleTableTabModal`
  - 📁 Closed — opens `ClosedOrdersModal`
- Tab bar height: 60 px + `env(safe-area-inset-bottom)` for iOS home indicator
- Active tab: emerald background pill

**Cart panel (portrait tablet):**
- Slides up from bottom (80% viewport height)
- Same cart item list as `CartSidebar`
- "Add to Tab" button at bottom triggers `onAddToTab` prop
- "Edit" banner when editing an order

**New props added to `MobileCart`:**
```typescript
// Existing
onAddToTab: () => void;
onUpdateQuantity: (id: string, delta: number) => void;
// New — tablet bottom tab bar actions
onOpenOrders?: () => void;
onSettle?: () => void;
onClosedOrders?: () => void;
```
`POSInterface.tsx` passes the corresponding state setters (`setIsOpenOrdersOpen`, `setIsSettleTabModalOpen`, `setIsClosedOrdersOpen`) through these new optional props.

### 5.3 Landscape Tablet — `CartSidebar.tsx` responsive width

Add a `lg` class for the width transition:
- `768px–1023px` (tablet landscape): `w-[150px]` compact — item name, qty controls, price only
- `≥ 1024px` (desktop): `w-[400px]` full — images, descriptions, full controls

The compact mode hides product images and descriptions, shows only name + price + qty stepper.

### 5.4 Header — `POSInterface.tsx`

**Tablet landscape header (`md:` to `lg:` range):**
- Logo + tagline (unchanged)
- Search input (visible — currently hidden on all `< md`)
- Open Orders button (icon + label)
- Closed Orders button (icon + label)
- Settle Table button (icon + label)
- 👤 `<Link href={/pos/dashboard/${user.id}}>` — circular icon button (replaces `Dashboard` text link)
- `<UserButton>` hidden on tablet (the 👤 icon covers it)

**Phone header (unchanged):**
- Logo
- Hamburger menu

### 5.5 Category Bar

- **Tablet portrait**: horizontal scroll strip below header (same as desktop, currently hidden on mobile)
- **Tablet landscape**: existing desktop category strip — no change

### 5.6 Product Grid Column Count (CSS)

Update `app/pos/product-card.css`:

```css
/* Portrait tablet — full width, 3 columns */
@media (min-width: 768px) and (orientation: portrait) {
  .product-grid { grid-template-columns: repeat(3, 1fr); }
}

/* Landscape tablet — grid shares space with 150px sidebar, 3 columns */
@media (min-width: 768px) and (orientation: landscape) and (max-width: 1023px) {
  .product-grid { grid-template-columns: repeat(3, 1fr); }
}
```

---

## 6. File Change Map

| File | Type | What changes |
|------|------|-------------|
| `components/pos/DocketPreviewModal.tsx` | **NEW** | Digital receipt preview modal |
| `lib/print.utils.ts` | Modify | Remove USB path; always queue; better error message |
| `components/pos/PrintBridge.tsx` | Modify | Role gate; fix `kitchen_docket` bytes bug; fix silent failure; `useEffect` for `window.queuePrintJob` |
| `components/pos/POSInterface.tsx` | Modify | Open `DocketPreviewModal` after Add-to-Tab and after Update Order; pass delta items for addition state |
| `components/pos/MobileCart.tsx` | Modify | Add portrait-tablet bottom tab bar mode; wire Orders/Settle/Closed modals via new props (see 5.2) |
| `components/pos/CartSidebar.tsx` | Modify | Responsive width (`w-[150px]` on tablet, `w-[400px]` on desktop); compact mode hides images |
| `app/pos/product-card.css` | Modify | Orientation-aware grid columns for portrait and landscape tablet |
| `app/api/print/thermal/route.ts` | Modify | Update `generateESCPOSKitchenDocket`, `generateESCPOSKitchenDelta`, and `generateESCPOSReceipt` to match approved physical formats (see §3.5 and §9) |
| `lib/kitchen-print-snapshot.ts` | Modify | Strip `n` (name) from `linesFromCartItems`; lower merge cap to 950 chars (§10) |
| `lib/actions/pos.actions.ts` | Modify | Add `guestCount: 1` default to `createTabOrderFromCart`; move `clearCart` after `updateOrder` in POSInterface (§3.4) |

---

## 7. Data Flow

### Add to Tab

```
Waiter: tap "Add to Tab"
  ↓
createTabOrderFromCart() → Appwrite ORDERS
  ↓
queuePrintJobInternal(businessId, orderId, "captain_docket") → Appwrite PRINT_JOBS
  ↓ (client)
window.queuePrintJob confirmed available
  ↓
DocketPreviewModal opens (type: "new", all items)
  ↓
[Admin terminal, async]
PrintBridge: orgRole === 'org:admin' → picks up pending job
  → executePrintJob("captain_docket") → POST /api/print/thermal
  → generateESCPOSKitchenDocket → commands[]
  → printRawCommands → USB thermal printer
```

### Update Order

```
Waiter: tap "Update Order"
  ↓
computeKitchenDeltaForOrder() → deltaItems[] (name + quantity only)
  ↓
Enrich deltaItems with price from cart (BEFORE clearCart)
  ↓ (if deltaItems.length > 0)
window.queuePrintJob("kitchen_delta", `orderId:${id}`) → Appwrite PRINT_JOBS
  ↓
DocketPreviewModal opens (type: "addition", enrichedDelta)
  ↓
updateOrder() [no longer blocked by print]
clearCart() + setEditingOrder(null)
  ↓
[Admin terminal, async]
PrintBridge: membership.role === 'org:admin' → picks up kitchen_delta job
  → executePrintJob → POST /api/print/thermal
  → generateESCPOSKitchenDelta → commands[]
  → printRawCommands → USB printer
```

---

## 8. Security & Anti-Scam Rules

- **Addition dockets are delta-only.** The kitchen/bar receives only newly added items. Previously printed items are not reprinted. This prevents a customer from showing an old docket for items they did not re-order.
- **ADDITION banner is mandatory** on every delta ESC/POS output: `*** ADDITION - NOT A FULL ORDER ***` in inverted/bold print.
- **No receipt on captain orders.** The docket header reads `CAPTAIN ORDER` not `RECEIPT`. Customers cannot use it as proof of payment.
- **Print jobs are tenant-isolated.** Every `PRINT_JOBS` document carries `businessId` and `PrintBridge` filters by it. Cross-org leakage is structurally impossible.

---

## 9. Receipt ESC/POS Format

The physical receipt (reference photo) must be replicated in `generateESCPOSReceipt` inside `app/api/print/thermal/route.ts`. Supports up to 20 line items without truncation.

```
[TWO-COLUMN HEADER — 80mm width]
Left:  "Northern Bypass, Thome"          AM | PM         Right: "Tel: +254 757 650 125"
       "After Windsor, Nairobi"           LOUNGE                 "info@ampm.co.ke"
                                                                  "Terminal: front desk"
------------------------------------------------------------------------  [dashed]
ORD #: ORD-XXXX | Date: DD/MM/YYYY | Time: HH:MM:SS
Server: <waiterName> | Table: <N> | Guests: <guestCount>
------------------------------------------------------------------------  [dashed]
QTY    ITEM DESCRIPTION                              TOTAL (KSh)
------------------------------------------------------------------------  [dashed]
1x     Jagermeister (original)                            1,500
1x     Veuve Clicquot NV (Bottle)                        18,000
[... up to 20 items, all right-aligned prices]
------------------------------------------------------------------------  [dashed]
Subtotal:                                                77,500
VAT (16%):                                              12,400
------------------------------------------------------------------------  [dashed]
GRAND TOTAL: KSh 89,900                     [double-height bold, full width]
                 PAID - THANK YOU           [centered bold]
                    [QR CODE — orderId]
       Thank you for choosing AM | PM.
       We hope to see you again soon.
```

**Key differences from current implementation:**
- Business address left-aligned, brand center, contact right-aligned in header
- Column header: `QTY  ITEM DESCRIPTION  TOTAL (KSh)` not `Qty Item Price`
- `TOTAL (KSh)` column is right-aligned
- Subtotal + VAT (16%) lines before grand total
- `GRAND TOTAL: KSh X,XXX` in double-height bold (ESC `!` with size byte)
- `PAID - THANK YOU` centered below grand total
- QR code encodes the `orderId`
- Closing message at bottom

---

## 10. Bug Fix — >5 Items Order Creation Failure

### Root cause (confirmed via Appwrite MCP)

The `specialInstructions` attribute in the `orders` collection has **`size: 1000` chars** (set at schema creation and cannot be increased on the free plan — the collection is at its attribute size limit).

The kitchen snapshot stored in `specialInstructions` uses this format per line:
```json
{"i":"67f2a3b4c5d6e7f8a9b0","q":1,"n":"Jagermeister (original)"}
```
≈ 72 chars per item with name. At 6 items this pushes `specialInstructions` to ~550 chars; at 12 items it exceeds 1000. With long item names it fails sooner.

### Secondary issues fixed via Appwrite MCP (already applied)

| Field | Old | New | Why |
|-------|-----|-----|-----|
| `guestCount` | required, no default, max 20 | optional, default 1, max 999 | `createTabOrderFromCart` doesn't pass it → every order was at risk |
| `tableNumber` | max 100 | max 9999 | Busy days exceed 100 auto-assigned tabs |

### Code fix: strip names from kitchen snapshot

In `lib/kitchen-print-snapshot.ts`, `linesFromCartItems` currently stores `{ i, q, n }`. Change to `{ i, q }` only:

```typescript
// BEFORE:
export function linesFromCartItems(items: CartItem[]): KitchenLine[] {
  return items.map(item => ({ i: item.$id, q: item.quantity, n: item.name }));
}

// AFTER:
export function linesFromCartItems(items: CartItem[]): KitchenLine[] {
  return items.map(item => ({ i: item.$id, q: item.quantity }));
  // Names omitted — specialInstructions is capped at 1000 chars.
  // Delta computation only needs ID + quantity; names come from order.items.
}
```

With names stripped: each line is `{"i":"67f2a3b4c5d6e7f8a9b0","q":1},` ≈ 35 chars.
20 items × 35 = 700 chars + JSON wrapper (52 chars) + TAB prefix (20 chars) = **~772 chars — fits in 1000**.

This is safe because `computeKitchenDelta` only reads `i` (ID) and `q` (quantity) from the snapshot — names are never used for delta computation. When printing, item names come from `order.items`, not the snapshot.

Also lower the cap in `mergeKitchenSnapshotIntoSpecialInstructions` from 9500 to **950** to match the actual Appwrite field limit.

### Code fix: always pass `guestCount` in `createTabOrderFromCart`

Add `guestCount: 1` to the `orderData` object in `createTabOrderFromCart` as a safe fallback (the Appwrite schema now has `default: 1` but being explicit prevents any edge-case schema-migration gaps).

### `items` field (5000 chars) — no change needed

With `compressOrderItems` stripping to `{ $id, name, price, quantity }`:
- 20 items × ~90 chars = ~1800 chars — well under 5000
- Schema increase was attempted but blocked by free-plan limits; not needed at this item count

---

## 11. Out of Scope

- Waiter-specific printer configuration UI
- Network printer support (`/api/print/network` does not exist and is not added here)
- Push notifications when admin terminal is offline
- Receipt printing (separate flow, not touched)
