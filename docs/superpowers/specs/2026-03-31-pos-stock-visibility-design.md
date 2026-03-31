# POS Stock Visibility — Sub-project 3 Design Spec

**Date:** 2026-03-31
**Status:** Approved
**Project:** ScanNServe Reservations Admin Panel
**Scope:** POS Stock Visibility (Sub-project 3 of 4)

---

## Problem Statement

The POS product grid shows every menu item regardless of stock or availability. Staff can add out-of-stock items to the cart without any warning, leading to order failures, customer disappointment, and manual intervention. When stock runs low, no indicator exists — staff discover shortages only after attempting to fulfil an order. The `isAvailable` field exists but is never checked in `ProductCard` or `POSInterface`. Sub-project 2 adds `stock` and `lowStockThreshold` to the Appwrite `MENU_ITEMS` documents; this sub-project surfaces those values in the POS UI.

---

## Goals

1. Show a **remaining stock count badge** on every product card (subtle amber for low, red for out).
2. Out-of-stock items **sink to the bottom** of the grid by default and can be hidden via a toggle.
3. Tapping an out-of-stock item shows a **staff override warning dialog** — they can add it anyway.
4. Real-time Appwrite subscription already in place propagates stock decrements from other POS terminals without any new wiring.
5. Implement with TDD: all tests written and confirmed failing before any implementation.

---

## What Is Not Changing

- `getMenuItems()` and `getCategories()` server actions — no changes.
- Cart logic, payment flow, order creation — unchanged.
- No new API routes — all data arrives through the existing `getMenuItems()` fetch.
- `POSInterface` realtime subscription (lines 98–117) already handles live document updates.

---

## Design System

The POS uses an existing dark glassmorphism system (`neutral-800/900` backgrounds, `white/10` borders, `emerald-500` accents). All new elements honour this system exactly — no new colour tokens introduced.

**Stock status colour mapping:**

| State | Stock condition | Badge colour | Text |
|-------|----------------|--------------|------|
| Healthy | `stock > threshold` | Hidden | — |
| Low | `0 < stock ≤ threshold` | `bg-amber-500/20 text-amber-400 border-amber-500/30` | "Last {N}" |
| Out | `stock === 0` or `!isAvailable` | `bg-red-500/20 text-red-400 border-red-500/30` | "Out of Stock" |

> **Implementation note:** The "Out" state covers both `stock === 0` and `isAvailable === false` (e.g. a manager manually disabling a seasonal item). Every predicate in this spec — sort, filter, dialog trigger — uses the combined helper: `const isOut = !item.isAvailable || (item.stock !== undefined && item.stock === 0)`. Import `getStockStatus` and `isOutOfStock` from `lib/stock-utils.ts` for consistency — do not inline duplicate logic.
| Untracked | `stock === undefined` | Hidden | — |

---

## Component Architecture

### Modified Files Only (no new component files)

```
types/pos.types.ts
  Product interface: add stock?: number, lowStockThreshold?: number

components/pos/ProductCard.tsx
  - Import getStockStatus, isOutOfStock from lib/stock-utils.ts (do NOT inline duplicate logic)
  - Stock badge overlay (top-left, above image)
  - Remove existing "Unavailable" pill from price row (lines 114–118 in current file)
  - Out-of-stock: card opacity-40, conditionally omit hover-lift class, pointer-events-none on quick-add button
  - Low stock: amber badge "Last N", no opacity change (item still orderable)
  - Healthy / untracked: no badge, no change to existing UI

components/pos/POSInterface.tsx
  - Import isOutOfStock from lib/stock-utils.ts for sort/filter predicates
  - filteredProducts sort: in-stock items first; out-of-stock AND isAvailable=false sink to bottom
  - showOutOfStock: boolean state (default false), persists per session
  - Toggle pill below category filter row
  - Out-of-stock warning dialog (inline state, ~30 lines, no new file)
```

> **`lib/stock-utils.ts` colour note:** `stock-utils.ts` exports `STOCK_STATUS_COLORS` which uses `text-yellow-400` for low stock. The POS badge spec uses `text-amber-400`. Amber and yellow are distinct Tailwind tokens. Use the badge classes defined in this spec directly in `ProductCard`; do not import `STOCK_STATUS_COLORS` (it is fine for the status logic functions `getStockStatus`, `isOutOfStock`, `isLowStock`).

---

## Type Changes

Add to `Product` in `types/pos.types.ts`:

```typescript
stock?: number            // undefined = untracked (no badge shown)
lowStockThreshold?: number  // defaults to 5 when absent from Appwrite doc
```

Both fields are optional to maintain backward compatibility with existing documents that do not yet have these fields (they appear once the Appwrite migration from Sub-project 2 is applied).

---

## ProductCard UI — Detailed Spec

### Stock Badge

Position: `absolute top-2 left-2 z-10` — overlaid on the product image, top-left corner.

**Low stock badge:**
```
┌─────────────────────────────────┐
│ [amber pill] Last 3             │
│                                 │
│  [product image]                │
│                                 │
│  Product Name          KSh 450  │
│                        [+ Add]  │
└─────────────────────────────────┘
```

Pill: `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-500/20 text-amber-400 border-amber-500/30 backdrop-blur-sm`

Icon: `<AlertTriangle className="w-3 h-3" />` — from Lucide (already imported in project).

**Out-of-stock badge:**
Same pill structure with `bg-red-500/20 text-red-400 border-red-500/30`.
Icon: `<XCircle className="w-3 h-3" />`.

### Out-of-Stock Card State

- Card wrapper: add `opacity-40 transition-all duration-200`
- Quick-add `+` button: add `pointer-events-none opacity-0` (hidden, not disabled — click handled at card level)
- Card click still fires, triggering the warning dialog via `onView`

> **Existing badge removal:** `ProductCard` currently renders an "Unavailable" rose pill in the price row at `lines 114–118` when `!product.isAvailable`. Remove that pill — its function is fully replaced by the new top-left red badge. Keeping both would show two conflicting badges on the same card.

The dimming uses `opacity-40` (not `opacity-0`) so staff can still see the item name and price — important for explaining to customers what was available.

### Micro-interactions

- **Badge entrance:** `animate-in fade-in duration-300` — badge fades in when stock data arrives, never jarring.
- **Stock drop realtime:** When Appwrite pushes a stock change (stock goes to 0), the card transitions `opacity-40` over `duration-300` and the badge swaps from amber → red over `duration-200`. Both transitions use `transition-all`.
- **Card press state (existing):** `hover-lift` class is conditionally omitted (not added alongside `pointer-events-none`) when the item is out of stock — `className={cn('hover-lift', isOut && 'pointer-events-none')}` would break card click; instead use `cn(cardBase, !isOut && 'hover-lift')`. Out-of-stock cards are still clickable for the warning dialog.
- **Quick-add button:** existing `active:scale-95` press feedback retained. For in-stock items no change. For out-of-stock: button is visually hidden so press feedback is irrelevant.

---

## POSInterface Changes

### Sort Logic

Applied to the already-computed `filteredProducts` array, after search + category filter, before render:

```typescript
const sorted = useMemo(() => {
  return [...filtered].sort((a, b) => {
    const aOut = !a.isAvailable || (a.stock !== undefined && a.stock === 0)
    const bOut = !b.isAvailable || (b.stock !== undefined && b.stock === 0)
    if (aOut === bOut) return 0   // preserve existing order within each group
    return aOut ? 1 : -1          // out-of-stock / unavailable sinks to bottom
  })
}, [filtered])
```

`useMemo` dependency: `filtered` (which already depends on search, category, products).

> **`isAvailable === false` coverage:** Items with `isAvailable: false` but `stock > 0` (e.g. manager-disabled seasonal items) are treated identically to `stock === 0` items — they sink to the bottom, are hidden by default, and trigger the warning dialog on click.

### Show/Hide Toggle

Rendered as a small pill button immediately below the category filter row, right-aligned:

```
                              [ ⊙ Show out-of-stock (4) ]
```

When toggled on: `[ ⊙ Hide out-of-stock ]`

Spec:
- State: `const [showOutOfStock, setShowOutOfStock] = useState(false)`
- Default: `false` — out-of-stock items hidden
- When `false`: `sorted` is filtered to items where `item.isAvailable !== false && (item.stock === undefined || item.stock > 0)`
- When `true`: all `sorted` items shown (out-of-stock / unavailable at bottom, dimmed)
- Count label: number of currently hidden items — `sorted.filter(i => !i.isAvailable || (i.stock !== undefined && i.stock === 0)).length` — only shown when `showOutOfStock === false` and count > 0
- Reset: toggle resets to `false` when `selectedCategory` changes

**Pill styling:**
```
text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-full
bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-150
cursor-pointer select-none
```

**Micro-interaction:** `transition-all duration-150` for hover state. No animation on toggle — the grid reflow is the feedback (items appear/disappear). A `200ms` stagger on appearing items would be ideal but is YAGNI for v1.

### Out-of-Stock Warning Dialog

Triggered when: staff taps a card where `!item.isAvailable || (item.stock !== undefined && item.stock === 0)` — i.e. any item in the "Out" state — via `onView` or `onAdd`. The `showOutOfStock` toggle does not gate this; the guard is the item's state alone.

State: `const [outOfStockItem, setOutOfStockItem] = useState<Product | null>(null)`

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│   ⚠️  Out of Stock                                    │
│                                                       │
│   "Grilled Chicken" is currently out of stock.        │
│   Adding it to the cart may not be fulfillable.       │
│                                                       │
│   [ Cancel ]              [ Add Anyway ]              │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**Styling:**
- Backdrop: `fixed inset-0 bg-black/60 backdrop-blur-sm z-50` — follows existing modal pattern in `POSInterface`
- Dialog: `bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl`
- Title: `text-white font-semibold text-lg flex items-center gap-2` with `AlertTriangle` icon in `text-amber-400`
- Body: `text-slate-400 text-sm mt-2 leading-relaxed`
- Item name: `text-white font-medium` (quoted, inline)
- Buttons row: `flex gap-3 mt-6`
  - Cancel: `flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium transition`
  - Add Anyway: `flex-1 px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 text-sm font-medium transition`

**Micro-interactions:**
- Dialog entrance: `animate-in fade-in zoom-in-95 duration-200` — scales up from 95% + fades in, consistent with existing `<PaymentModal>` pattern
- Dialog exit (Cancel): immediate close, no exit animation (responsive feel)
- "Add Anyway": closes dialog, calls `addToCart(outOfStockItem, 1)`, then shows existing cart add feedback

**Keyboard / accessibility:**
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title
- Focus trapped inside dialog while open
- Escape key closes (Cancel behaviour)
- "Cancel" is the default focused button on open (safer default — prevents accidental adds)

---

## Realtime Stock Updates

No new subscription code needed. The existing `client.subscribe` in `POSInterface` (line 100) fires on any document mutation in `MENU_ITEMS_COLLECTION_ID`. When Sub-project 2's `createOrder()` calls `decrementItemStocks()`, the stock field update triggers this subscription. The handler at line 107–111 already merges the updated document into the `products` state array — the card's badge and opacity will update reactively.

**What staff sees:** When another terminal processes an order that zeroes out "Grilled Chicken", that card dims from full opacity to `opacity-40`, the badge transitions from amber → red (or appears fresh in red), and the card sinks to the bottom of the grid on the next render cycle. No page refresh needed.

---

## TDD Test Plan

All tests written **RED** before any implementation.

### `__tests__/pos/stock-visibility.test.tsx`

```
✗ ProductCard renders "Last N" amber badge when stock ≤ lowStockThreshold
✗ ProductCard renders no badge when stock > lowStockThreshold
✗ ProductCard renders no badge when stock is undefined (untracked item)
✗ ProductCard renders "Out of Stock" red badge when stock = 0
✗ ProductCard renders "Out of Stock" red badge when isAvailable = false (stock > 0)
✗ ProductCard card is dimmed (opacity-40 class) when stock = 0
✗ ProductCard card is dimmed when isAvailable = false regardless of stock
✗ ProductCard quick-add button has pointer-events-none when stock = 0
✗ ProductCard does not render legacy "Unavailable" pill in price row
✗ POSInterface sorts stock=0 items to bottom of product grid
✗ POSInterface sorts isAvailable=false items (with stock > 0) to bottom of grid
✗ POSInterface hides out-of-stock and unavailable items by default (showOutOfStock = false)
✗ POSInterface hides isAvailable=false items when showOutOfStock = false
✗ POSInterface shows out-of-stock items when toggle is activated
✗ POSInterface toggle label shows correct count of hidden items
✗ POSInterface toggle resets to false when selectedCategory changes
✗ POSInterface shows warning dialog when out-of-stock card is clicked
✗ POSInterface shows warning dialog when isAvailable=false card is clicked
✗ warning dialog "Add Anyway" calls addToCart and closes dialog
✗ warning dialog "Cancel" does not call addToCart
✗ warning dialog closes on Escape key press
✗ warning dialog has role="dialog" and aria-modal="true"
```

---

## Implementation Order

1. Write `__tests__/pos/stock-visibility.test.tsx` (all tests RED)
2. Add `stock?: number`, `lowStockThreshold?: number` to `Product` in `types/pos.types.ts`
3. Update `ProductCard.tsx` — stock badge, out-of-stock opacity, pointer-events on quick-add
4. Update `POSInterface.tsx` — sort logic, toggle pill, warning dialog
5. Run full test suite GREEN
