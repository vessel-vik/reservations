# Print System, Tablet UI & Org-Based Print Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every broken print code path, add a digital docket modal, route print jobs to the admin terminal via Clerk role, and make the POS usable on tablets (portrait bottom tab bar, landscape compact sidebar).

**Architecture:** All devices queue print jobs as Appwrite documents. Only the `org:admin` terminal's PrintBridge subscribes to and processes jobs via USB. Waiters get a digital docket preview immediately after queuing. Tablet layout switches on CSS orientation media queries — no JavaScript detection needed.

**Tech Stack:** Next.js 14 App Router, Appwrite (Databases, real-time), Clerk (`useOrganization`), Vitest + jsdom, Tailwind CSS, ESC/POS byte arrays via `ThermalPrinterClient.printRawCommands`.

---

## File Map

| File | Create/Modify | Responsibility |
|------|--------------|----------------|
| `lib/kitchen-print-snapshot.ts` | Modify | Strip `n` from snapshot lines; lower cap to 950 |
| `lib/actions/pos.actions.ts` | Modify | Lower `specialInstructions` cap to 950 in `createOrder` |
| `lib/print.utils.ts` | Modify (rewrite) | Queue-always `printOrderDocket`; new `printKitchenDelta` |
| `components/pos/PrintBridge.tsx` | Modify | Role gate; fix `kitchen_docket` bytes bug; add `kitchen_delta`; `useEffect` for `window.queuePrintJob` |
| `components/pos/DocketPreviewModal.tsx` | **Create** | Digital receipt preview modal (new/addition states) |
| `components/pos/POSInterface.tsx` | Modify | Wire `DocketPreviewModal`; fix delta enrich + clearCart order |
| `components/pos/MobileCart.tsx` | Modify | Portrait-tablet bottom tab bar (5 tabs) |
| `components/pos/CartSidebar.tsx` | Modify | `w-[150px]` on tablet landscape, `w-[400px]` on desktop |
| `app/pos/product-card.css` | Modify | Orientation-aware grid columns |
| `app/api/print/thermal/route.ts` | Modify | Rewrite `generateESCPOSKitchenDocket`, `generateESCPOSKitchenDelta`, `generateESCPOSReceipt` |
| `__tests__/kitchen-print-snapshot.test.ts` | Modify | Update snapshot assertions; add 20-item size guard |
| `__tests__/print/print-utils.test.ts` | **Create** | Unit tests for `printOrderDocket` + `printKitchenDelta` |
| `__tests__/pos/docket-preview-modal.test.tsx` | **Create** | Render tests for `DocketPreviewModal` |

---

## Task 1: Fix >5 Items Bug — Strip Names from Kitchen Snapshot

**Files:**
- Modify: `lib/kitchen-print-snapshot.ts`
- Modify: `lib/actions/pos.actions.ts` (line ~330)
- Modify: `__tests__/kitchen-print-snapshot.test.ts`

- [ ] **Step 1: Update the existing test to reflect name-stripped snapshots**

Replace the `newSnapshot` assertion in `__tests__/kitchen-print-snapshot.test.ts` and add a 20-item size guard:

```typescript
// __tests__/kitchen-print-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import {
    computeKitchenDelta,
    linesFromCartItems,
    mergeKitchenSnapshotIntoSpecialInstructions,
    parseLastKitchenSnapshot,
    stripKitchenPrintedLines,
} from '@/lib/kitchen-print-snapshot';

describe('kitchen-print-snapshot', () => {
    it('computes delta only for new qty', () => {
        const snap = [{ i: 'a', q: 2 }];
        const proposed = [{ $id: 'a', quantity: 5, name: 'Beer' }];
        const { deltaItems, newSnapshot } = computeKitchenDelta(snap, proposed);
        expect(deltaItems).toEqual([{ name: 'Beer', quantity: 3 }]);
        // n must be absent — names are not stored in snapshots
        expect(newSnapshot).toEqual([{ i: 'a', q: 5 }]);
    });

    it('prints full qty for new line id', () => {
        const { deltaItems } = computeKitchenDelta([], [{ $id: 'x', quantity: 2, name: 'Wine' }]);
        expect(deltaItems).toEqual([{ name: 'Wine', quantity: 2 }]);
    });

    it('parses and merges snapshot lines in specialInstructions', () => {
        // Parser must still handle legacy data that contains n
        const si = 'TAB note\n[KITCHEN_PRINTED]{"v":1,"lines":[{"i":"a","q":1,"n":"A"}]}';
        expect(parseLastKitchenSnapshot(si)).toEqual([{ i: 'a', q: 1, n: 'A' }]);
        const merged = mergeKitchenSnapshotIntoSpecialInstructions(si, [{ i: 'a', q: 2 }]);
        expect(merged).toContain('TAB note');
        expect(merged).toContain('[KITCHEN_PRINTED]');
        expect(stripKitchenPrintedLines(merged)).not.toContain('[KITCHEN_PRINTED]');
    });

    it('linesFromCartItems strips name — snapshot under 950 chars for 20 items', () => {
        const items = Array.from({ length: 20 }, (_, i) => ({
            $id: `item${String(i).padStart(16, '0')}`,
            quantity: 2,
            name: `Long Item Name ${i}`,
        }));
        const lines = linesFromCartItems(items);
        // No n field
        expect(lines[0]).not.toHaveProperty('n');
        const si = mergeKitchenSnapshotIntoSpecialInstructions('TAB - Table 1', lines);
        expect(si.length).toBeLessThanOrEqual(950);
    });
});
```

- [ ] **Step 2: Run test to confirm it fails on the old code**

```bash
cd /home/elyees/D/reservations/reservations && npx vitest run __tests__/kitchen-print-snapshot.test.ts 2>&1 | tail -20
```

Expected: FAIL — `newSnapshot` contains `n: 'Beer'` and `lines[0]` has property `n`.

- [ ] **Step 3: Fix `linesFromCartItems` and `computeKitchenDelta` in `lib/kitchen-print-snapshot.ts`**

```typescript
// lib/kitchen-print-snapshot.ts
// Change linesFromCartItems to strip n:
export function linesFromCartItems(items: unknown[]): KitchenLine[] {
    if (!Array.isArray(items)) return [];
    return items
        .map((it: any) => ({
            i: String(it?.$id || "").trim(),
            q: Math.max(0, Math.floor(Number(it?.quantity) || 1)),
            // n intentionally omitted — specialInstructions is capped at 1000 chars
        }))
        .filter((l) => l.i.length > 0 && l.q > 0);
}

// Change newSnapshot mapping in computeKitchenDelta to strip n:
const newSnapshot = proposed
    .filter((p) => String(p.$id || "").trim())
    .map((p) => ({
        i: String(p.$id).trim(),
        q: Math.max(0, Math.floor(Number(p.quantity) || 1)),
        // n intentionally omitted
    }));
```

- [ ] **Step 4: Lower the merge cap from 9500 to 950**

In `mergeKitchenSnapshotIntoSpecialInstructions`, change the `.slice` limit:
```typescript
return `${base}${addition}`.slice(0, 950);
```

- [ ] **Step 5: Lower the settlement audit cap in `lib/actions/pos.actions.ts`**

Find the line `orderData.specialInstructions = \`${prevSi}${createAudit}\`.slice(0, 9500);` (~line 330) and change it to:
```typescript
orderData.specialInstructions = `${prevSi}${createAudit}`.slice(0, 950);
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npx vitest run __tests__/kitchen-print-snapshot.test.ts 2>&1 | tail -15
```

Expected: 4/4 PASS.

- [ ] **Step 7: Run full suite to catch regressions**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: same pass count as baseline (61/63 or better).

- [ ] **Step 8: Commit**

```bash
git add lib/kitchen-print-snapshot.ts lib/actions/pos.actions.ts __tests__/kitchen-print-snapshot.test.ts
git commit -m "fix: strip names from kitchen snapshot — fixes >5 items order creation failure"
```

---

## Task 2: Rewrite `lib/print.utils.ts` to Queue-Always

**Files:**
- Modify: `lib/print.utils.ts`
- Create: `__tests__/print/print-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/print/print-utils.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock sonner before importing print.utils
vi.mock('sonner', () => ({ toast: { error: vi.fn(), message: vi.fn() } }));
// ThermalPrinterClient is no longer used — mock it to ensure it's never called
vi.mock('@/lib/thermal-printer', () => ({ ThermalPrinterClient: { loadConfig: vi.fn() } }));

import { toast } from 'sonner';
import { ThermalPrinterClient } from '@/lib/thermal-printer';
import { printOrderDocket, printKitchenDelta } from '@/lib/print.utils';

beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).queuePrintJob;
});

describe('printOrderDocket', () => {
    it('calls window.queuePrintJob with captain_docket and returns success', async () => {
        const mockQueue = vi.fn().mockResolvedValue(undefined);
        (window as any).queuePrintJob = mockQueue;

        const result = await printOrderDocket('order-123');

        expect(mockQueue).toHaveBeenCalledWith('captain_docket', 'orderId:order-123');
        expect(result).toEqual({ success: true });
        expect(ThermalPrinterClient.loadConfig).not.toHaveBeenCalled();
    });

    it('shows toast.error and returns failure when PrintBridge not mounted', async () => {
        const result = await printOrderDocket('order-456');

        expect(result.success).toBe(false);
        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining('Print bridge not ready')
        );
    });
});

describe('printKitchenDelta', () => {
    it('calls window.queuePrintJob with kitchen_delta JSON payload', async () => {
        const mockQueue = vi.fn().mockResolvedValue(undefined);
        (window as any).queuePrintJob = mockQueue;

        const delta = [{ name: 'Savanna', quantity: 1, price: 350 }];
        const result = await printKitchenDelta('order-123', delta);

        expect(mockQueue).toHaveBeenCalledWith(
            'kitchen_delta',
            JSON.stringify({ orderId: 'order-123', deltaItems: delta })
        );
        expect(result).toEqual({ success: true });
    });

    it('returns success without queuing when deltaItems is empty', async () => {
        const mockQueue = vi.fn();
        (window as any).queuePrintJob = mockQueue;

        const result = await printKitchenDelta('order-123', []);
        expect(result).toEqual({ success: true });
        expect(mockQueue).not.toHaveBeenCalled();
    });

    it('shows toast.error and returns failure when PrintBridge not mounted', async () => {
        const delta = [{ name: 'Wine', quantity: 2, price: 700 }];
        const result = await printKitchenDelta('order-456', delta);

        expect(result.success).toBe(false);
        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining('Print bridge not ready')
        );
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
mkdir -p __tests__/print && npx vitest run __tests__/print/print-utils.test.ts 2>&1 | tail -20
```

Expected: FAIL — `printKitchenDelta` does not exist; `printOrderDocket` uses USB path.

- [ ] **Step 3: Rewrite `lib/print.utils.ts`**

```typescript
// lib/print.utils.ts
import { toast } from 'sonner';

function getQueueFn(): ((jobType: string, content: string) => Promise<void>) | null {
    if (typeof window === 'undefined') return null;
    const fn = (window as any).queuePrintJob;
    return typeof fn === 'function' ? fn : null;
}

const BRIDGE_NOT_READY_MSG =
    'Print bridge not ready — reload the page or contact the admin.';

/**
 * Full captain / kitchen docket for an order (all lines).
 * Always queues via PrintBridge — never opens USB directly.
 */
export async function printOrderDocket(
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
    await queue('captain_docket', `orderId:${orderId}`);
    return { success: true };
}

/**
 * Delta slip: only newly added items (output of computeKitchenDeltaForOrder, enriched with price).
 * Always queues via PrintBridge.
 */
export async function printKitchenDelta(
    orderId: string,
    deltaItems: { name: string; quantity: number; price: number }[]
): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined') {
        return { success: false, error: 'Print is only available in the browser' };
    }
    if (deltaItems.length === 0) return { success: true };

    const queue = getQueueFn();
    if (!queue) {
        toast.error(BRIDGE_NOT_READY_MSG);
        return { success: false, error: 'PrintBridge not mounted' };
    }
    await queue('kitchen_delta', JSON.stringify({ orderId, deltaItems }));
    return { success: true };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/print/print-utils.test.ts 2>&1 | tail -15
```

Expected: 5/5 PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: no new failures.

- [ ] **Step 6: Commit**

```bash
git add lib/print.utils.ts __tests__/print/print-utils.test.ts
git commit -m "feat: rewrite print.utils — queue-always, remove USB branch, add printKitchenDelta"
```

---

## Task 3: Fix `components/pos/PrintBridge.tsx`

Four fixes in one component:
1. Role gate — only `org:admin` processes jobs
2. Fix `kitchen_docket` branch (fetches bytes but never prints)
3. Add `kitchen_delta` branch
4. Move `window.queuePrintJob` assignment to `useEffect`

**Files:**
- Modify: `components/pos/PrintBridge.tsx`

No automated test (requires Clerk + Appwrite runtime). Manual verification steps included.

- [ ] **Step 1: Add `useOrganization` import and role gate**

At the top of `components/pos/PrintBridge.tsx`, add the Clerk import:
```typescript
import { useOrganization } from "@clerk/nextjs";
```

Inside the `PrintBridge` component function, add at the top:
```typescript
const { membership } = useOrganization();
```

- [ ] **Step 2: Replace the `useEffect` that calls `setupPrintListener`**

Remove the existing `isSetup` state and its `useEffect`. Replace with two separate effects:

```typescript
// Always expose queuePrintJob globally (all devices — waiters and admin)
useEffect(() => {
    (window as any).queuePrintJob = queuePrintJob;
    return () => {
        delete (window as any).queuePrintJob;
    };
// queuePrintJob is defined inside the component; eslint-disable-next-line is intentional
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Only org:admin terminals subscribe to print jobs
useEffect(() => {
    if (!membership) return; // Clerk org context not loaded yet
    if (membership.role !== 'org:admin') return; // Waiter — mount silently, never process

    let unsubscribe: (() => void) | undefined;
    setupPrintListener().then((cleanup) => {
        unsubscribe = cleanup;
    });

    return () => unsubscribe?.();
}, [membership]);
```

Remove `const [isSetup, setIsSetup] = useState(false);` and the old setup `useEffect`.

- [ ] **Step 3: Fix `setupPrintListener` env var error to use `toast.error`**

```typescript
if (!PRINT_JOBS_COLLECTION_ID || !DATABASE_ID) {
    toast.error(
        'Print bridge misconfigured — NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID or NEXT_PUBLIC_DATABASE_ID missing. Printing disabled.'
    );
    return;
}
```

- [ ] **Step 4: Fix `executePrintJob` — fix broken `kitchen_docket` case, keep it, and add new `kitchen_delta` case**

The existing `kitchen_docket` case fetches bytes from the API but never sends them to the printer. Fix it **and keep it** (legacy jobs in the queue still carry this jobType). Add `kitchen_delta` as a new case.

Update the `switch` statement in `executePrintJob`:

```typescript
case "docket":
case "captain_docket": {
    const docketOrderId =
        job.content.match(/orderId:([\w-]+)/)?.[1] || job.content.trim();
    const docketRes = await printer.printKitchenDocket(docketOrderId);
    if (!docketRes.success) {
        throw new Error(docketRes.error || 'Captain docket print failed');
    }
    break;
}

case "kitchen_docket": {
    // Legacy jobType — kept for backwards compat with any queued jobs.
    // Bug fix: previous code fetched bytes but never called printRawCommands.
    const orderId = job.content.match(/orderId:([\w-]+)/)?.[1]
        ?? job.content.match(/table:(\d+)/)?.[1]
        ?? job.content.trim();
    const res = await fetch('/api/print/thermal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orderId: orderId || undefined,
            jobType: 'kitchen_docket',
            printerType: printerConfig.type,
            terminalName: printerConfig.terminalName,
            lineWidth: printerConfig.lineWidth || 32,
        }),
    });
    const data = await res.json();
    if (data.commands) {
        await printer.printRawCommands(data.commands as number[]);
    } else {
        throw new Error(data.error || 'Kitchen docket print failed');
    }
    break;
}

case "kitchen_delta": {
    const parsed = JSON.parse(job.content) as {
        orderId: string;
        deltaItems: { name: string; quantity: number; price: number }[];
    };
    const res = await fetch('/api/print/thermal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orderId: parsed.orderId,
            jobType: 'kitchen_delta',
            deltaItems: parsed.deltaItems,
            printerType: printerConfig.type,
            terminalName: printerConfig.terminalName,
            lineWidth: printerConfig.lineWidth || 32,
        }),
    });
    const data = await res.json();
    if (data.commands) {
        await printer.printRawCommands(data.commands as number[]);
    } else {
        throw new Error(data.error || 'Kitchen delta print failed');
    }
    break;
}
```

Also update the `PrintJob` interface to include `kitchen_delta`:
```typescript
jobType: "receipt" | "docket" | "captain_docket" | "kitchen_docket" | "kitchen_delta";
```

- [ ] **Step 5: Remove `window.queuePrintJob` assignment from render body**

Delete these lines from the bottom of the component function (just above `return null;`):
```typescript
// Expose queuePrintJob globally for external use
if (typeof window !== "undefined") {
    (window as any).queuePrintJob = queuePrintJob;
}
```

(They've been replaced by the `useEffect` in Step 2.)

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "PrintBridge|error TS" | head -20
```

Expected: no errors on PrintBridge.tsx.

- [ ] **Step 7: Commit**

```bash
git add components/pos/PrintBridge.tsx
git commit -m "fix: PrintBridge — role gate, kitchen_delta case, fix kitchen_docket bytes bug, useEffect window.queuePrintJob"
```

---

## Task 4: Create `components/pos/DocketPreviewModal.tsx`

**Files:**
- Create: `components/pos/DocketPreviewModal.tsx`
- Create: `__tests__/pos/docket-preview-modal.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/pos/docket-preview-modal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocketPreviewModal } from '@/components/pos/DocketPreviewModal';

const baseOrder = {
    orderNumber: 'KITCHEN-8244',
    tableNumber: 71,
    waiterName: 'Ham Chulo',
    totalAmount: 1300,
    items: [
        { $id: 'a1', name: 'Savanna', price: 350, quantity: 1 },
        { $id: 'a2', name: 'Pilsner', price: 300, quantity: 2 },
    ],
    createdAt: '2026-04-05T13:57:58.000Z',
};

describe('DocketPreviewModal', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <DocketPreviewModal
                isOpen={false}
                onClose={vi.fn()}
                onEdit={vi.fn()}
                order={baseOrder}
                type="new"
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('shows all items and CAPTAIN ORDER header for type=new', () => {
        render(
            <DocketPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                onEdit={vi.fn()}
                order={baseOrder}
                type="new"
            />
        );
        expect(screen.getByText('CAPTAIN ORDER')).toBeInTheDocument();
        expect(screen.getByText('Savanna')).toBeInTheDocument();
        expect(screen.getByText('Pilsner')).toBeInTheDocument();
        expect(screen.getByText(/1,300/)).toBeInTheDocument();
        expect(screen.queryByText(/ADDITION/)).toBeNull();
    });

    it('shows only deltaItems and addition banner for type=addition', () => {
        const delta = [{ name: 'Jameson 50ml', quantity: 1, price: 550 }];
        render(
            <DocketPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                onEdit={vi.fn()}
                order={baseOrder}
                deltaItems={delta}
                type="addition"
            />
        );
        expect(screen.getByText(/ADDITION/)).toBeInTheDocument();
        expect(screen.getByText('Jameson 50ml')).toBeInTheDocument();
        // Original order items should NOT appear
        expect(screen.queryByText('Savanna')).toBeNull();
    });

    it('calls onEdit when Edit Order button clicked', () => {
        const onEdit = vi.fn();
        render(
            <DocketPreviewModal
                isOpen={true}
                onClose={vi.fn()}
                onEdit={onEdit}
                order={baseOrder}
                type="new"
            />
        );
        fireEvent.click(screen.getByText(/Edit/));
        expect(onEdit).toHaveBeenCalled();
    });

    it('calls onClose when Done button clicked', () => {
        const onClose = vi.fn();
        render(
            <DocketPreviewModal
                isOpen={true}
                onClose={onClose}
                onEdit={vi.fn()}
                order={baseOrder}
                type="new"
            />
        );
        fireEvent.click(screen.getByText('Done'));
        expect(onClose).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/pos/docket-preview-modal.test.tsx 2>&1 | tail -20
```

Expected: FAIL — component does not exist.

- [ ] **Step 3: Create `components/pos/DocketPreviewModal.tsx`**

```typescript
"use client";

import { CartItem } from "@/types/pos.types";
import { formatCurrency } from "@/lib/utils";

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
    /** Enriched delta items (price from cart). Only used when type='addition'. */
    deltaItems?: { name: string; quantity: number; price: number }[];
    type: "new" | "addition";
}

export function DocketPreviewModal({
    isOpen,
    onClose,
    onEdit,
    order,
    deltaItems,
    type,
}: DocketPreviewModalProps) {
    if (!isOpen) return null;

    const isAddition = type === "addition";
    const displayItems = isAddition
        ? (deltaItems ?? []).map((d) => ({ name: d.name, quantity: d.quantity, price: d.price }))
        : order.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price }));

    const lineTotal = displayItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const now = order.createdAt ? new Date(order.createdAt) : new Date();
    const dateStr = now.toLocaleDateString("en-KE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xs flex flex-col items-center gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Paper receipt */}
                <div className="relative w-full bg-white rounded text-black font-mono text-[11px] px-3.5 py-4 shadow-2xl">
                    {/* Torn-paper top edge */}
                    <div
                        className="absolute -top-1.5 left-0 right-0 h-1.5"
                        style={{
                            background:
                                "repeating-linear-gradient(90deg,#fff 0px,#fff 8px,transparent 8px,transparent 12px)",
                        }}
                    />
                    {/* Header */}
                    <p className="text-center font-black text-sm tracking-wide">AM | PM</p>
                    <p className="text-center font-bold text-xs">CAPTAIN ORDER</p>
                    <p className="text-center text-[10px] text-gray-500">Terminal: Main Counter</p>
                    <hr className="border-dashed border-gray-400 my-1.5" />

                    {/* Addition banner */}
                    {isAddition && (
                        <div className="bg-black text-yellow-400 font-black text-[10px] text-center tracking-widest py-0.5 rounded mb-1.5">
                            ⚡ ADDITION — NOT A FULL ORDER ⚡
                        </div>
                    )}

                    {/* Metadata */}
                    <p className="text-[10px]">Order #: {order.orderNumber ?? "—"}</p>
                    <p className="text-[10px]">Date: {dateStr}</p>
                    <p className="text-[10px]">Time: {timeStr}</p>
                    <p className="text-[10px]">Server: {order.waiterName ?? "—"}</p>
                    <p className="text-[10px]">
                        Type: dine_in&nbsp;&nbsp;|&nbsp;&nbsp;Table: #{order.tableNumber ?? "—"}
                    </p>
                    <hr className="border-dashed border-gray-400 my-1.5" />

                    {/* Column header */}
                    <div className="flex justify-between text-[10px] font-bold">
                        <span>Qty&nbsp;&nbsp;Item</span>
                        <span>Price</span>
                    </div>
                    <hr className="border-dashed border-gray-400 my-1" />

                    {/* Items */}
                    {displayItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[11px] py-0.5">
                            <span>
                                <span className="mr-1">{item.quantity}x</span>
                                <span>{item.name}</span>
                            </span>
                            <span>{(item.price * item.quantity).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</span>
                        </div>
                    ))}

                    <hr className="border-dashed border-gray-400 my-1.5" />

                    {/* Total row */}
                    <div className="flex justify-between text-[13px] font-black">
                        <span>{isAddition ? "ADDITION:" : "TOTAL:"}</span>
                        <span>
                            {lineTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    {/* Torn-paper bottom edge */}
                    <div
                        className="absolute -bottom-1.5 left-0 right-0 h-1.5"
                        style={{
                            background:
                                "repeating-linear-gradient(90deg,#fff 0px,#fff 8px,transparent 8px,transparent 12px)",
                        }}
                    />
                </div>

                {/* Status pill */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] rounded-full px-3 py-1 font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        ✓ Sent to printer
                    </span>
                    <span className="text-[10px] text-gray-600">Admin terminal printing…</span>
                </div>

                {/* Buttons */}
                <div className="flex gap-2.5 w-full">
                    <button
                        type="button"
                        onClick={onEdit}
                        className="flex-1 bg-neutral-800 border border-neutral-600 rounded-lg py-2.5 text-xs font-semibold text-neutral-200"
                    >
                        ✏️ {isAddition ? "Edit Again" : "Edit Order"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 bg-emerald-500 rounded-lg py-2.5 text-xs font-bold text-white"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run __tests__/pos/docket-preview-modal.test.tsx 2>&1 | tail -15
```

Expected: 5/5 PASS.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "DocketPreviewModal" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/pos/DocketPreviewModal.tsx __tests__/pos/docket-preview-modal.test.tsx
git commit -m "feat: add DocketPreviewModal — digital thermal receipt preview with addition state"
```

---

## Task 5: Wire `DocketPreviewModal` in `POSInterface.tsx`

**Files:**
- Modify: `components/pos/POSInterface.tsx`

- [ ] **Step 1: Add import and state**

At the top of `POSInterface.tsx`, add:
```typescript
import { DocketPreviewModal } from "./DocketPreviewModal";
import { printKitchenDelta } from "@/lib/print.utils";
```

Add state after the existing modal states:
```typescript
const [isDocketModalOpen, setIsDocketModalOpen] = useState(false);
const [docketModalType, setDocketModalType] = useState<"new" | "addition">("new");
const [docketModalOrder, setDocketModalOrder] = useState<any | null>(null);
const [docketModalDelta, setDocketModalDelta] = useState<{ name: string; quantity: number; price: number }[]>([]);
```

- [ ] **Step 2: Replace the `OrderConfirmationModal` (post-Add-to-Tab) with `DocketPreviewModal`**

In `handleAddToTab`, replace:
```typescript
clearCart();
void printOrderDocket(newOrder.$id);
setRecentOrder(normalizedOrder);
setIsRecentOrderModalOpen(true);
```

With:
```typescript
clearCart();
void printOrderDocket(newOrder.$id);
setDocketModalOrder(normalizedOrder);
setDocketModalType("new");
setDocketModalDelta([]);
setIsDocketModalOpen(true);
```

Remove the old `recentOrder` and `isRecentOrderModalOpen` state declarations and the `OrderConfirmationModal` JSX block that uses them.

Also remove `setIsRecentOrderModalOpen(false)` from `handleEditOrder` (~line 253 in the current file) — it becomes a reference to a deleted state and will cause a TypeScript error.

Remove the now-unused `import { OrderConfirmationModal } from "./OrderConfirmationModal";` import line.

- [ ] **Step 3: Fix `handleSaveOrderChanges` — enrich delta, remove print gate, move clearCart after updateOrder**

Replace the entire `handleSaveOrderChanges` function body:

```typescript
const handleSaveOrderChanges = async () => {
    if (!editingOrder) return;

    try {
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const subtotal = total / (1 + 0.16);
        const taxAmount = subtotal * 0.16;

        const cartLines = cart.map((c) => ({
            $id: c.$id,
            quantity: c.quantity,
            name: c.name,
        }));

        const { deltaItems, newSnapshotLines } = await computeKitchenDeltaForOrder(
            editingOrder.$id,
            cartLines
        );

        // Enrich delta with price from cart BEFORE clearing — cart is still available
        const enrichedDelta = deltaItems.map((d) => {
            const cartItem = cart.find((c) => c.name === d.name);
            return { ...d, price: cartItem?.price ?? 0 };
        });

        // Queue delta print (fire-and-forget — order is saved regardless)
        if (enrichedDelta.length > 0) {
            void printKitchenDelta(editingOrder.$id, enrichedDelta);
        }

        await updateOrder(editingOrder.$id, {
            items: cart,
            subtotal: Math.round(subtotal * 100) / 100,
            taxAmount: Math.round(taxAmount * 100) / 100,
            totalAmount: total,
            kitchenSnapshotLines: newSnapshotLines,
        } as any);

        // clearCart AFTER updateOrder so enrichedDelta price lookup above is valid
        clearCart();
        setEditingOrder(null);

        // Show docket modal for additions
        if (enrichedDelta.length > 0) {
            setDocketModalOrder(editingOrder);
            setDocketModalType("addition");
            setDocketModalDelta(enrichedDelta);
            setIsDocketModalOpen(true);
        } else {
            toast.success("Order updated successfully.");
        }
    } catch (error) {
        console.error("Failed to save order changes:", error);
        toast.error("Unable to save order updates.");
    }
};
```

- [ ] **Step 4: Add `DocketPreviewModal` to the JSX**

Near the end of the returned JSX (before the closing `</div>`), add:

```typescript
{/* Docket Preview Modal — shown after Add to Tab or Update Order */}
<DocketPreviewModal
    isOpen={isDocketModalOpen}
    onClose={() => {
        setIsDocketModalOpen(false);
        setDocketModalOrder(null);
    }}
    onEdit={() => {
        setIsDocketModalOpen(false);
        if (docketModalOrder) {
            handleEditOrder(docketModalOrder);
        }
    }}
    order={docketModalOrder ?? { totalAmount: 0, items: [] }}
    deltaItems={docketModalDelta}
    type={docketModalType}
/>
```

- [ ] **Step 5: Pass new props to `MobileCart` (prep for Task 6)**

Find the `<MobileCart>` usage in the JSX and add the three new optional props:
```typescript
onOpenOrders={() => setIsOpenOrdersOpen(true)}
onSettle={() => setIsSettleTabModalOpen(true)}
onClosedOrders={() => setIsClosedOrdersOpen(true)}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "POSInterface" | head -20
```

Expected: no errors.

- [ ] **Step 7: Run full suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: same pass count as before.

- [ ] **Step 8: Commit**

```bash
git add components/pos/POSInterface.tsx
git commit -m "feat: wire DocketPreviewModal — post-Add-to-Tab and post-Update-Order flows"
```

---

## Task 6: Portrait Tablet Bottom Tab Bar (`MobileCart.tsx`)

**Files:**
- Modify: `components/pos/MobileCart.tsx`

- [ ] **Step 1: Add new optional props to interface**

```typescript
interface MobileCartProps {
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onAddToTab: () => void;
    editingOrderId?: string | null;
    editingCustomerName?: string | null;
    onSaveOrderChanges?: () => void;
    onCancelEdit?: () => void;
    // Tablet bottom tab bar actions (portrait ≥768px)
    onOpenOrders?: () => void;
    onSettle?: () => void;
    onClosedOrders?: () => void;
}
```

- [ ] **Step 2: Add `activeTab` state and cart panel state for portrait tablet**

```typescript
const [activeTab, setActiveTab] = useState<"menu" | "cart" | "orders" | "settle" | "closed">("menu");
const [isCartPanelOpen, setIsCartPanelOpen] = useState(false);
```

Keep the existing `isOpen` state for the phone FAB drawer.

- [ ] **Step 3: Add portrait-tablet bottom tab bar and slide-up cart panel**

The component should render differently based on breakpoint, using CSS classes:

Add after the existing phone drawer, at the bottom of the fragment:

```typescript
{/* Portrait tablet (≥768px portrait) — bottom tab bar */}
<div
    className="hidden portrait:md:flex fixed bottom-0 left-0 right-0 z-40 bg-neutral-900/95 backdrop-blur-sm border-t border-white/10"
    style={{ height: '60px', paddingBottom: 'env(safe-area-inset-bottom)' }}
>
    {[
        { id: "menu" as const, icon: "🍽️", label: "Menu" },
        { id: "cart" as const, icon: "🛒", label: "Cart", badge: itemCount },
        { id: "orders" as const, icon: "📋", label: "Orders" },
        { id: "settle" as const, icon: "💳", label: "Settle" },
        { id: "closed" as const, icon: "📁", label: "Closed" },
    ].map((tab) => (
        <button
            key={tab.id}
            type="button"
            onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === "cart") {
                    setIsCartPanelOpen(true);
                } else if (tab.id === "orders") {
                    onOpenOrders?.();
                } else if (tab.id === "settle") {
                    onSettle?.();
                } else if (tab.id === "closed") {
                    onClosedOrders?.();
                }
            }}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                activeTab === tab.id
                    ? "text-emerald-400"
                    : "text-neutral-400 hover:text-neutral-200"
            }`}
        >
            {activeTab === tab.id && (
                <span className="absolute top-1 inset-x-2 h-0.5 bg-emerald-400 rounded-full" />
            )}
            <span className="text-base relative">
                {tab.icon}
                {tab.badge != null && tab.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {tab.badge > 9 ? "9+" : tab.badge}
                    </span>
                )}
            </span>
            <span className="text-[10px] leading-none">{tab.label}</span>
        </button>
    ))}
</div>

{/* Portrait tablet cart panel — slides up from bottom */}
{isCartPanelOpen && (
    <div className="hidden portrait:md:flex fixed inset-x-0 bottom-0 z-50 flex-col bg-neutral-900 border-t border-white/10 rounded-t-2xl"
        style={{ height: '80vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10">
            <h2 className="text-lg font-bold text-white">Current Order</h2>
            <button
                type="button"
                onClick={() => setIsCartPanelOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
                <X className="w-5 h-5 text-white" />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-36">
            {cartArray.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-neutral-500 space-y-4">
                    <CreditCard className="w-8 h-8 opacity-50" />
                    <p>No items in order</p>
                </div>
            ) : (
                cartArray.map((item, index) => (
                    <div
                        key={`${item.$id}-tp-${index}`}
                        className="flex gap-3 bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]"
                    >
                        <div className="flex flex-col items-center justify-between bg-black/25 rounded-lg w-10 py-2">
                            <button type="button" onClick={() => onUpdateQuantity(item.$id, 1)}
                                disabled={item.stock !== undefined && item.quantity >= item.stock}
                                className="p-2 hover:text-emerald-400 transition-colors disabled:opacity-30">
                                <Plus size={16} />
                            </button>
                            <span className="text-base font-bold">{item.quantity}</span>
                            <button type="button" onClick={() => onUpdateQuantity(item.$id, -1)}
                                className="p-2 hover:text-rose-400 transition-colors">
                                <Minus size={16} />
                            </button>
                        </div>
                        <div className="flex-1 min-w-0 py-1">
                            <div className="flex justify-between items-start">
                                <h4 className="font-medium text-neutral-200 truncate pr-2">{item.name}</h4>
                                <span className="font-bold text-emerald-400 whitespace-nowrap tabular-nums">
                                    {formatCurrency(item.price * item.quantity)}
                                </span>
                            </div>
                            <p className="text-sm text-neutral-500 mt-1">{formatCurrency(item.price)} each</p>
                        </div>
                    </div>
                ))
            )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-sm border-t border-white/10 p-4 space-y-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
            <div className="flex justify-between items-end">
                <span className="text-neutral-300">Total</span>
                <span className="text-2xl font-bold text-white tabular-nums">{formatCurrency(total)}</span>
            </div>
            {editingOrderId ? (
                <div className="grid grid-cols-2 gap-3">
                    <button type="button"
                        onClick={() => { onSaveOrderChanges?.(); setIsCartPanelOpen(false); }}
                        disabled={cart.length === 0}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
                        <Check className="w-5 h-5" /> Update Order
                    </button>
                    <button type="button"
                        onClick={() => { onCancelEdit?.(); setIsCartPanelOpen(false); }}
                        className="w-full bg-neutral-800 text-white font-semibold py-3 rounded-lg border border-white/10 flex items-center justify-center gap-2">
                        <X className="w-5 h-5" /> Cancel
                    </button>
                </div>
            ) : (
                <button type="button"
                    onClick={() => { onAddToTab(); setIsCartPanelOpen(false); }}
                    disabled={cart.length === 0}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-700 text-white text-lg font-bold py-3 rounded-lg">
                    Add To Tab
                </button>
            )}
        </div>
    </div>
)}
```

**Note on CSS utility `portrait:md:`:** Tailwind doesn't have a built-in `portrait:` variant out of the box. Use `hidden portrait:md:flex` if the Tailwind config has a `portrait` screen variant. Otherwise apply the CSS class approach:

Add to `app/pos/product-card.css` (done in Task 7):
```css
@media (min-width: 768px) and (orientation: portrait) {
  .tablet-portrait-only { display: flex !important; }
}
```

Then in `MobileCart.tsx` replace **both** `hidden portrait:md:flex` occurrences (the bottom tab bar div **and** the cart panel div) with `hidden tablet-portrait-only`. There are exactly two such divs — both need the substitution.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "MobileCart" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/pos/MobileCart.tsx
git commit -m "feat: portrait tablet bottom tab bar — Menu/Cart/Orders/Settle/Closed"
```

---

## Task 7: Landscape Tablet Compact Sidebar + CSS Grid (`CartSidebar.tsx` + `product-card.css`)

**Files:**
- Modify: `components/pos/CartSidebar.tsx`
- Modify: `app/pos/product-card.css`

- [ ] **Step 1: Make `CartSidebar` width responsive**

In `CartSidebar.tsx`, change the outer `div` className from:
```typescript
className="flex h-full flex-col bg-[#0a0a0a] border-l border-white/10 w-[400px]"
```
To:
```typescript
className="flex h-full flex-col bg-[#0a0a0a] border-l border-white/10 w-[150px] lg:w-[400px]"
```

- [ ] **Step 2: Hide image thumbnails in compact mode (< lg)**

The image `<img>` and the placeholder emoji `<div>` currently render at `w-10 h-10`. Wrap them with `hidden lg:block`:

```typescript
{item.imageUrl ? (
    <img
        src={item.imageUrl}
        alt={item.name}
        className="hidden lg:block w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5"
    />
) : (
    <div className="hidden lg:flex w-10 h-10 rounded-lg bg-white/5 items-center justify-center shrink-0 mt-0.5 text-base">
        🍽️
    </div>
)}
```

- [ ] **Step 3: Tighten padding in compact mode**

The item card `div` has `p-3`. Change to `p-2 lg:p-3` to give more room on 150px width.

The cart header area has `px-6 py-5`. Change to `px-3 py-3 lg:px-6 lg:py-5`.

The footer has `p-6 space-y-4`. Change to `p-3 space-y-3 lg:p-6 lg:space-y-4`.

- [ ] **Step 4: Truncate item names in compact mode**

The item name `<h4>` currently truncates with `truncate text-sm`. Add `max-w-[80px] lg:max-w-none` to prevent overflow at 150px width.

- [ ] **Step 5: Add orientation-aware grid columns to `app/pos/product-card.css`**

```css
/* Portrait tablet — 3 columns, full content width */
@media (min-width: 768px) and (orientation: portrait) {
  .product-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  /* Push content above the bottom tab bar */
  .pos-main-content {
    padding-bottom: 72px;
  }
  .tablet-portrait-only {
    display: flex !important;
  }
}

/* Landscape tablet — 3 columns (sidebar takes 150px) */
@media (min-width: 768px) and (orientation: landscape) and (max-width: 1023px) {
  .product-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

If `.product-grid` is not the class used on the grid container in POSInterface, grep for the grid className and update accordingly:
```bash
grep -n "grid-cols\|product-grid" components/pos/POSInterface.tsx | head -10
```

- [ ] **Step 6: TypeScript check and build**

```bash
npx tsc --noEmit 2>&1 | grep -E "CartSidebar|error TS" | head -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/pos/CartSidebar.tsx app/pos/product-card.css
git commit -m "feat: tablet landscape compact sidebar (150px) + orientation-aware CSS grid"
```

---

## Task 8: Rewrite ESC/POS Generators in `app/api/print/thermal/route.ts`

Three generators updated to match approved physical formats.

**Files:**
- Modify: `app/api/print/thermal/route.ts`

- [ ] **Step 1: Rewrite `generateESCPOSKitchenDocket` to captain order format**

Change the function signature to accept a single order (not an array) and remove the `tableNumber` parameter:

```typescript
function generateESCPOSKitchenDocket(order: Order, config: any): number[]
```

Update the route handler to call it with a single order:
```typescript
} else if (jobType === 'kitchen_docket' || jobType === 'captain_docket') {
    const singleOrder = orders[0];
    if (!singleOrder) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    escposCommands = generateESCPOSKitchenDocket(singleOrder, config);
}
```

Rewrite the function body:

```typescript
function generateESCPOSKitchenDocket(order: Order, config: any): number[] {
    const commands: number[] = [];
    const lineWidth = config.lineWidth || 32;
    const ESC = 0x1B;
    const GS = 0x1D;

    const encode = (str: string) => Array.from(new TextEncoder().encode(str));
    const center = (str: string, len: number) => {
        const space = Math.max(0, Math.floor((len - str.length) / 2));
        return ' '.repeat(space) + str;
    };
    const rpad = (str: string, len: number) => str.slice(0, len).padEnd(len, ' ');
    const lpad = (str: string, len: number) => str.slice(0, len).padStart(len, ' ');
    const separator = '-'.repeat(lineWidth) + '\n';

    const now = new Date(order.orderTime || Date.now());
    const dateStr = now.toLocaleDateString('en-KE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Init
    commands.push(ESC, 0x40);
    commands.push(ESC, 0x61, 0x01); // center

    // Header
    commands.push(ESC, 0x21, 0x30); // double-height bold
    commands.push(...encode('AM | PM\n'));
    commands.push(ESC, 0x21, 0x10); // bold normal height
    commands.push(...encode('CAPTAIN ORDER\n'));
    commands.push(ESC, 0x21, 0x00); // normal
    if (config.terminalName) {
        commands.push(...encode(`Terminal: ${config.terminalName}\n`));
    }

    commands.push(...encode(separator));
    commands.push(ESC, 0x61, 0x00); // left

    // Order metadata
    commands.push(...encode(`Order #: ${order.orderNumber}\n`));
    commands.push(...encode(`Date: ${dateStr}\n`));
    commands.push(...encode(`Time: ${timeStr}\n`));
    commands.push(...encode(`Server: ${order.waiterName}\n`));
    commands.push(...encode(`Type: ${order.type || 'dine_in'}  |  Table: #${order.tableNumber ?? '—'}\n`));
    commands.push(...encode(separator));

    // Items header
    const qtyW = 4; const priceW = 9;
    const nameW = lineWidth - qtyW - priceW;
    commands.push(ESC, 0x21, 0x08); // underline
    commands.push(...encode(rpad('Qty', qtyW) + rpad('Item', nameW) + lpad('Price', priceW) + '\n'));
    commands.push(ESC, 0x21, 0x00);
    commands.push(...encode(separator));

    const items = safeParseOrderItems(order);
    items.forEach((item: any) => {
        const qty = `${Math.max(1, Number(item?.quantity) || 1)}x`;
        const name = rpad(String(item?.name || 'Item'), nameW);
        const price = (Number(item?.price || 0) * Math.max(1, Number(item?.quantity) || 1))
            .toLocaleString('en-KE', { minimumFractionDigits: 2 });
        commands.push(...encode(rpad(qty, qtyW) + name + lpad(price, priceW) + '\n'));
    });

    commands.push(...encode(separator));

    // Total
    const totalAmt = typeof order.totalAmount === 'number' ? order.totalAmount : 0;
    commands.push(ESC, 0x21, 0x10); // bold
    const totalLabel = rpad('TOTAL:', lineWidth - 12);
    const totalVal = totalAmt.toLocaleString('en-KE', { minimumFractionDigits: 2 }).padStart(12, ' ');
    commands.push(...encode(totalLabel + totalVal + '\n'));
    commands.push(ESC, 0x21, 0x00);

    commands.push(...encode('\n\n\n'));
    commands.push(GS, 0x56, 0x00); // cut
    return commands;
}
```

- [ ] **Step 2: Rewrite `generateESCPOSKitchenDelta` to include ADDITION banner**

```typescript
function generateESCPOSKitchenDelta(order: Order, deltaItems: { name: string; quantity: number }[], config: any): number[] {
    const commands: number[] = [];
    const lineWidth = config.lineWidth || 32;
    const ESC = 0x1B;
    const GS = 0x1D;

    const encode = (str: string) => Array.from(new TextEncoder().encode(str));
    const rpad = (str: string, len: number) => str.slice(0, len).padEnd(len, ' ');
    const separator = '-'.repeat(lineWidth) + '\n';
    const timeStr = new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    commands.push(ESC, 0x40);
    commands.push(ESC, 0x61, 0x01); // center

    // Header
    commands.push(ESC, 0x21, 0x30);
    commands.push(...encode('AM | PM\n'));
    commands.push(ESC, 0x21, 0x10);
    commands.push(...encode('CAPTAIN ORDER\n'));
    commands.push(ESC, 0x21, 0x00);
    if (config.terminalName) {
        commands.push(...encode(`Terminal: ${config.terminalName}\n`));
    }

    commands.push(...encode(separator));

    // ADDITION banner — inverted print
    commands.push(ESC, 0x61, 0x01); // center
    commands.push(ESC, 0x21, 0x10); // bold
    commands.push(0x1D, 0x42, 0x01); // GS B 1 — reverse video on
    commands.push(...encode(' *** ADDITION - NOT A FULL ORDER *** \n'));
    commands.push(0x1D, 0x42, 0x00); // GS B 0 — reverse video off
    commands.push(ESC, 0x21, 0x00);

    commands.push(ESC, 0x61, 0x00); // left
    commands.push(...encode(`Order #: ${order.orderNumber}\n`));
    commands.push(...encode(`Time: ${timeStr}\n`));
    commands.push(...encode(`Server: ${order.waiterName}\n`));
    commands.push(...encode(`Table: #${order.tableNumber ?? '—'}\n`));
    commands.push(...encode(separator));

    commands.push(ESC, 0x21, 0x10);
    commands.push(...encode('NEW ITEMS ONLY\n'));
    commands.push(ESC, 0x21, 0x00);

    deltaItems.forEach((row) => {
        const qty = `${row.quantity}x`;
        const name = row.name.substring(0, Math.max(4, lineWidth - qty.length - 2));
        commands.push(...encode(`${qty} ${name}\n`));
    });

    const additionTotal = (deltaItems as { name: string; quantity: number; price?: number }[])
        .reduce((s, d) => s + (d.price ?? 0) * d.quantity, 0);
    if (additionTotal > 0) {
        commands.push(...encode(separator));
        const totalLine = rpad('ADDITION:', lineWidth - 12) +
            additionTotal.toLocaleString('en-KE', { minimumFractionDigits: 2 }).padStart(12, ' ');
        commands.push(ESC, 0x21, 0x10);
        commands.push(...encode(totalLine + '\n'));
        commands.push(ESC, 0x21, 0x00);
    }

    commands.push(...encode('\n\n\n'));
    commands.push(GS, 0x56, 0x00);
    return commands;
}
```

- [ ] **Step 3: Rewrite `generateESCPOSReceipt` to match the physical receipt photo**

The new format: two-column header (address left / brand center / contact right), QTY/ITEM DESCRIPTION/TOTAL columns, Subtotal + VAT breakdown, double-height bold GRAND TOTAL, QR code with orderId.

```typescript
function generateESCPOSReceipt(order: Order, config: any): number[] {
    const commands: number[] = [];
    const lineWidth = config.lineWidth || 48; // 80mm at high density = 48 chars
    const ESC = 0x1B;
    const GS = 0x1D;

    const encode = (str: string) => Array.from(new TextEncoder().encode(str));
    const center = (str: string, len: number) => {
        const space = Math.max(0, Math.floor((len - str.length) / 2));
        return ' '.repeat(space) + str;
    };
    const rpad = (str: string, len: number) => str.slice(0, len).padEnd(len, ' ');
    const lpad = (str: string, len: number) => str.slice(-len).padStart(len, ' ');
    const separator = '-'.repeat(lineWidth) + '\n';

    const now = new Date(order.orderTime || Date.now());
    const dateStr = now.toLocaleDateString('en-KE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Init
    commands.push(ESC, 0x40);

    // Two-column header: address left | brand center | contact right
    // Use tab stops to simulate: left-aligned in thirds
    const colW = Math.floor(lineWidth / 3);
    const headerRows = [
        ['Northern Bypass, Thome', 'AM | PM', 'Tel: +254 757 650 125'],
        ['After Windsor, Nairobi', 'LOUNGE', 'info@ampm.co.ke'],
        ['', '', config.terminalName ? `Terminal: ${config.terminalName}` : ''],
    ];
    commands.push(ESC, 0x61, 0x00); // left
    headerRows.forEach(([left, mid, right]) => {
        if (!left && !mid && !right) return;
        const l = rpad(left, colW);
        const m = center(mid, colW);
        const r = lpad(right, colW);
        commands.push(...encode(l + m + r + '\n'));
    });
    // Brand name in center, double-height, on its own line if not already done above
    // (the above already shows AM|PM in center col — this is the standard 80mm layout)

    commands.push(...encode(separator));
    commands.push(ESC, 0x61, 0x00); // left

    // Order details
    commands.push(...encode(`ORD #: ${order.orderNumber} | Date: ${dateStr} | Time: ${timeStr}\n`));
    commands.push(...encode(`Server: ${order.waiterName} | Table: ${order.tableNumber ?? '—'} | Guests: ${order.guestCount ?? 1}\n`));
    commands.push(...encode(separator));

    // Column header: QTY / ITEM DESCRIPTION / TOTAL (KSh)
    const qtyW = 5; const totalColW = 12;
    const descW = lineWidth - qtyW - totalColW;
    commands.push(ESC, 0x21, 0x08); // underline
    commands.push(...encode(rpad('QTY', qtyW) + rpad('ITEM DESCRIPTION', descW) + lpad('TOTAL (KSh)', totalColW) + '\n'));
    commands.push(ESC, 0x21, 0x00);
    commands.push(...encode(separator));

    const items = safeParseOrderItems(order);
    items.forEach((item: any) => {
        const qty = `${Math.max(1, Number(item?.quantity) || 1)}x`;
        const rawName = String(item?.name || 'Item');
        const price = Number(item?.price || 0);
        const qty_ = Number(item?.quantity) || 1;
        const lineTotal = price * qty_;
        const totalStr = lineTotal.toLocaleString('en-KE', { minimumFractionDigits: 0 });

        // Long names wrap to next line
        if (rawName.length > descW - 1) {
            commands.push(...encode(rpad(qty, qtyW) + rpad(rawName.slice(0, descW - 1), descW) + lpad(totalStr, totalColW) + '\n'));
            let remaining = rawName.slice(descW - 1);
            while (remaining.length > 0) {
                commands.push(...encode(rpad('', qtyW) + rpad(remaining.slice(0, descW), descW) + '\n'));
                remaining = remaining.slice(descW);
            }
        } else {
            commands.push(...encode(rpad(qty, qtyW) + rpad(rawName, descW) + lpad(totalStr, totalColW) + '\n'));
        }
    });

    commands.push(...encode(separator));

    // Subtotal + VAT
    const totalAmt = typeof order.totalAmount === 'number' ? order.totalAmount : 0;
    const vatRate = 0.16;
    const subtotalExVat = totalAmt / (1 + vatRate);
    const vatAmt = totalAmt - subtotalExVat;

    const subtotalStr = subtotalExVat.toLocaleString('en-KE', { minimumFractionDigits: 2 });
    const vatStr = vatAmt.toLocaleString('en-KE', { minimumFractionDigits: 2 });

    commands.push(...encode(rpad('Subtotal:', lineWidth - 12) + lpad(subtotalStr, 12) + '\n'));
    commands.push(...encode(rpad('VAT (16%):', lineWidth - 12) + lpad(vatStr, 12) + '\n'));
    commands.push(...encode(separator));

    // GRAND TOTAL — double-height bold
    commands.push(ESC, 0x61, 0x00); // left
    commands.push(ESC, 0x21, 0x30); // double-height bold
    const grandLabel = 'GRAND TOTAL: KSh';
    const grandAmt = totalAmt.toLocaleString('en-KE', { minimumFractionDigits: 2 });
    commands.push(...encode(`${grandLabel} ${grandAmt}\n`));
    commands.push(ESC, 0x21, 0x00);

    // PAID line
    commands.push(ESC, 0x61, 0x01); // center
    commands.push(ESC, 0x21, 0x10); // bold
    commands.push(...encode('PAID - THANK YOU\n'));
    commands.push(ESC, 0x21, 0x00);

    // QR code — encodes orderId
    commands.push(...encode('\n'));
    const qrData = order.$id || order.orderNumber;
    const qrLen = qrData.length;
    commands.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model
    commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x08);        // size
    commands.push(GS, 0x28, 0x6B, (qrLen + 3) & 0xFF, 0x00, 0x31, 0x50, 0x30, ...encode(qrData));
    commands.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);        // print

    // Footer
    commands.push(...encode('\n'));
    commands.push(ESC, 0x61, 0x01);
    commands.push(...encode('Thank you for choosing AM | PM.\n'));
    commands.push(...encode('We hope to see you again soon.\n'));

    commands.push(...encode('\n\n\n'));
    commands.push(GS, 0x56, 0x00); // cut
    return commands;
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "thermal/route\|error TS" | head -20
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: same pass count as before (the ESC/POS functions are not tested with the route integration but shouldn't break any existing test).

- [ ] **Step 6: Commit**

```bash
git add app/api/print/thermal/route.ts
git commit -m "feat: rewrite ESC/POS generators — captain docket, addition banner, physical receipt format"
```

---

## Final Verification

- [ ] **TypeScript build passes**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

Expected: 0.

- [ ] **Full test suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: ≥ 66 passing (61 baseline + 5 new from print-utils + 5 from docket modal + 1 extra kitchen snapshot).

- [ ] **Manual smoke test — print routing**

1. Open POS on a waiter account (Clerk role: `org:member`). Add items, tap Add to Tab.
2. `DocketPreviewModal` should open immediately with the full docket.
3. Status pill should show `✓ Sent to printer`.
4. On admin terminal, PrintBridge should receive the `captain_docket` job and print via USB.

- [ ] **Manual smoke test — update order delta**

1. From Open Orders, load an order into edit mode.
2. Add one new item, tap Update Order.
3. `DocketPreviewModal` should open showing only the new item with ADDITION banner.
4. Admin terminal should print the delta slip with `*** ADDITION - NOT A FULL ORDER ***`.

- [ ] **Manual smoke test — >5 items**

1. Add 6+ items to cart, tap Add to Tab.
2. Order should create without error. No "digest" server component error.

- [ ] **Manual smoke test — tablet portrait**

1. Open POS in Chrome DevTools at 820×1180 portrait (iPad Air).
2. Bottom tab bar should appear with 5 tabs.
3. Tapping Cart should slide up the order panel.
4. Tapping Orders/Settle/Closed should open the corresponding modals.

- [ ] **Manual smoke test — tablet landscape**

1. Open at 1180×820 landscape.
2. Sidebar should be 150px compact — no images, names truncated.
3. Product grid should be 3 columns.
