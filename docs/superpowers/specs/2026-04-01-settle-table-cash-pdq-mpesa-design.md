# Settle Table + Cash/PDQ/M-Pesa/Paystack Payment Integration
**Date:** April 1, 2026  
**Status:** Implemented  
**Version:** 1.0

---

## Executive Summary

This specification defines the complete settlement workflow for table-based dining operations, supporting four payment methods:

1. **Cash** - Manual amount entry with automatic change calculation
2. **PDQ** (Card Terminal) - Staff-confirmed card approvals
3. **M-Pesa** - Mobile money with customer phone verification
4. **Paystack** - Automated online gateway

The architecture ensures no revenue double-counting through consolidated order creation and prevents two terminals from settling the same table simultaneously.

---

## 1. Settlement Flow Overview

```
┌─────────────────────────────────────────────────────────┐
│  Customer calls for bill (multiple unpaid orders)       │
└────────────────┬────────────────────────────────────────┘
                 ↓
        ┌───────────────────┐
        │  Open Orders List │
        │  (Glassmorphism)  │
        └────────┬──────────┘
                 ↓
  ┌──────────────────────────┐
  │  Select Payment Method   │
  │  Cash/PDQ/M-Pesa/Paystack│
  └───────────┬──────────────┘
              ↓
    ┌─────────────────────┐
    │ Collect Payment Ref │
    │ (Or Gateway Process)│
    └──────────┬──────────┘
               ↓
┌──────────────────────────────────────┐
│ settleTableTabAndCreateOrder()       │
│ - Consolidate all unpaid orders      │
│ - Create table_tab_master order      │
│ - Mark child orders as "settled"     │
│ - Record payment method & reference  │
└──────────────┬───────────────────────┘
               ↓
        ┌────────────────┐
        │ Success Screen │
        │ Print Receipt  │
        └────────────────┘
```

---

## 2. Payment Methods & Reference Format

### 2.1 Cash Payment

```typescript
interface CashPayment {
    amountReceived: number;      // Amount customer gives
    change: number;              // Computed: amountReceived - totalAmount
    reference: string;           // CASH-{timestamp}
    timestamp: string;
}
```

**Validation:**
- Amount received ≥ total amount
- Auto-calculate change
- Show amount breakdown

**Modal (`components/pos/PayNowModal.tsx`):**
```tsx
<Input
    type="number"
    placeholder="Enter amount"
    value={formData.amountReceived}
    min={totalAmount}
    onChange={(e) => setFormData({ amountReceived: e.target.value })}
/>

<div className="p-3 bg-emerald-500/10">
    <p>Change: {formatCurrency(
        Math.max(0, amountReceived - totalAmount)
    )}</p>
</div>
```

### 2.2 PDQ (Card Terminal) Payment

```typescript
interface PDQPayment {
    cardApprovalCode: string;    // 6-char code from terminal
    reference: string;           // PDQ-{timestamp}
    terminalSerialNumber?: string;
    timestamp: string;
}
```

**Workflow:**
1. Staff processes card through physical PDQ terminal
2. Terminal displays approval code
3. Staff enters code into PayNowModal
4. System confirms and records payment

**Validation:**
- Approval code format (typically 6 alphanumeric)

### 2.3 M-Pesa Payment

```typescript
interface MpesaPayment {
    customerPhone: string;       // 254712345678 format
    reference: string;           // MPESA-{timestamp}
    timestamp: string;
    confirmationCode?: string;   // Later: STK prompt response
}
```

**Workflow:**
1. Staff enters customer phone
2. System sends STK push to customer's M-Pesa menu
3. Customer completes mini-app approval
4. Staff confirms receipt of payment
5. System records reference

**Phone Validation:**
```typescript
const validateKenyanPhone = (phone: string) => {
    return /^254\d{9}$/.test(phone.replace(/\D/g, ''));
};
```

### 2.4 Paystack Payment

```typescript
interface PaystackPayment {
    reference: string;           // Paystack auto-generated
    accessCode: string;
    authorizationUrl: string;
    status: "pending" | "success" | "failed";
}
```

**Integration Point:**
Paystack handles online payment; system captures reference in callback.

---

## 3. Core Settlement Function

**File:** `lib/actions/pos.actions.ts`

```typescript
export const settleTableTabAndCreateOrder = async ({
    tableNumber,
    date,
    paymentMethod,
    paymentReference,
    amountReceived,
    change,
    staffId,
    staffName,
}: SettlementPayload) => {
    try {
        // 1. Get all unpaid orders for this table on this date
        const unpaidOrders = await getUnpaidOrdersForTableOnDate(tableNumber, date);

        if (!unpaidOrders || unpaidOrders.length === 0) {
            throw new Error("No unpaid orders found for this table");
        }

        // 2. Calculate consolidated totals
        const subtotal = unpaidOrders.reduce((sum, o) => sum + (o.subtotal || 0), 0);
        const taxAmount = unpaidOrders.reduce((sum, o) => sum + (o.taxAmount || 0), 0);
        const totalAmount = unpaidOrders.reduce((sum, o) => sum + o.totalAmount, 0);

        // 3. Validate settlement amount (cash only)
        if (paymentMethod === "cash" && amountReceived && amountReceived < totalAmount) {
            throw new Error("Amount received is less than total");
        }

        // 4. Create consolidated "table_tab_master" order
        const masterOrderData = {
            orderNumber: `TAB-${tableNumber}-${Date.now()}`,
            type: "table_tab_master",
            status: "paid", // Master is immediately paid
            tableNumber,
            customerName: `Table ${tableNumber}`,
            paymentStatus: "paid",
            paymentMethod,
            paymentReference,
            subtotal: Math.round(subtotal * 100) / 100,
            taxAmount: Math.round(taxAmount * 100) / 100,
            totalAmount: Math.round(totalAmount * 100) / 100,
            // For cash, include change info
            ...(paymentMethod === "cash" && {
                amountReceived,
                change: Math.round(change * 100) / 100,
            }),
            items: JSON.stringify(unpaidOrders.flatMap(o => 
                (JSON.parse(o.items || "[]") as any[])
            )),
            childOrderIds: unpaidOrders.map(o => o.$id),
            settledAt: new Date().toISOString(),
            settledBy: staffName,
            staffId,
            orderTime: new Date().toISOString(),
        };

        const masterOrder = await databases.createDocument(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            undefined,
            masterOrderData
        );

        // 5. Mark all child orders as "settled" (prevents double-counting)
        const updatePromises = unpaidOrders.map(order =>
            databases.updateDocument(
                DATABASE_ID,
                ORDERS_COLLECTION_ID,
                order.$id,
                {
                    paymentStatus: "settled", // Distinct from "paid"
                    parentOrderId: masterOrder.$id,
                    settledAt: new Date().toISOString(),
                }
            )
        );

        await Promise.allSettled(updatePromises);

        // 6. Update inventory (decrement stock for all items)
        const allItems = unpaidOrders.flatMap(o => 
            JSON.parse(o.items || "[]") as CartItem[]
        );

        await decrementItemStocks(
            allItems.map(item => ({
                itemId: item.$id,
                quantity: item.quantity || 1
            }))
        );

        return {
            success: true,
            masterOrder: parseStringify(masterOrder),
            itemsSettled: allItems.length,
            amountPaid: totalAmount,
            change: change || 0,
        };
    } catch (error) {
        console.error("Settlement error:", error);
        throw error;
    }
};
```

---

## 4. OpenOrdersModal Component

**File:** `components/pos/OpenOrdersModal.tsx`

Displays all unpaid orders for a table with glassmorphism UI:

```typescript
interface OpenOrdersModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectOrder?: (orders: Order[]) => void;
    tableNumber?: number;
}
```

**Features:**
- Fetch unpaid orders for selected table
- Itemized preview of each order
- Total calculation
- Selection for viewing details

**Glassmorphism Styling:**
```tsx
className="border border-white/5 bg-white/5 hover:bg-white/10 
           backdrop-blur-sm rounded-lg"
```

---

## 5. PayNowModal Component

**File:** `components/pos/PayNowModal.tsx`

Four-method payment interface:

```tsx
const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

// Display method selector grid
<div className="grid grid-cols-2 gap-3">
    <button className="..." onClick={() => setSelectedMethod("cash")}>
        <Banknote className="w-6 h-6 text-emerald-400" />
        <span>Cash</span>
    </button>
    <button className="..." onClick={() => setSelectedMethod("pdq")}>
        <CreditCard className="w-6 h-6 text-blue-400" />
        <span>PDQ</span>
    </button>
    <button className="..." onClick={() => setSelectedMethod("mpesa")}>
        <Smartphone className="w-6 h-6 text-green-400" />
        <span>M-Pesa</span>
    </button>
    <button className="..." onClick={() => setSelectedMethod("paystack")}>
        <CreditCard className="w-6 h-6 text-purple-400" />
        <span>Paystack</span>
    </button>
</div>
```

**Conditional forms based on method:**
- **Cash:** Amount input + change calculation
- **PDQ:** Approval code input
- **M-Pesa:** Phone number input + confirmation
- **Paystack:** Redirect to gateway

---

## 6. Concurrency & Table Safety

### 6.1 Check-and-Set Pattern

To prevent two terminals from settling the same table:

```typescript
export const settleTableWithConcurrencyCheck = async (
    tableNumber: number,
    date: string,
    ...args
) => {
    // Check if already settling
    const inProgressSettlement = await checkPendingSettlement(
        tableNumber,
        date
    );

    if (inProgressSettlement) {
        throw new Error(
            `Table ${tableNumber} is already being settled by another terminal`
        );
    }

    // Proceed with settlement
    return settleTableTabAndCreateOrder({ tableNumber, date, ...args });
};
```

### 6.2 Settlement Locking

Use a temporary "settling" status to prevent race conditions:

```typescript
// Set status to "settling" before processing
await updateTableStatus(tableNumber, "settling");

try {
    // Do settlement work
    await settleTableTabAndCreateOrder(...);
    
    // On success, set to "settled"
    await updateTableStatus(tableNumber, "settled");
} catch (error) {
    // On error, reset to "open"
    await updateTableStatus(tableNumber, "open_for_settlement");
    throw error;
}
```

---

## 7. Reference Formatting

| Method   | Format             | Example                |
| -------- | ------------------ | ---------------------- |
| Cash     | `CASH-{timestamp}` | `CASH-1712079000123`   |
| PDQ      | `PDQ-{timestamp}`  | `PDQ-1712079000456`    |
| M-Pesa   | `MPESA-{timestamp}`| `MPESA-1712079000789`  |
| Paystack | Paystack-provided  | `5238173626` (auto)    |

```typescript
const generateReference = (method: PaymentMethod) => {
    switch (method) {
        case "cash":
            return `CASH-${Date.now()}`;
        case "pdq":
            return `PDQ-${Date.now()}`;
        case "mpesa":
            return `MPESA-${Date.now()}`;
        default:
            return null; // Paystack generates own
    }
};
```

---

## 8. Data Integrity & Revenue Tracking

### 8.1 Order Status Categories

```
┌─────────────────┐
│  ORDER STATES   │
└─────────────────┘
    ↓
┌────────────────────────┐
│  placed (ordered)      │ ← POS initial state
│  confirmed (kitchen)   │ ← Kitchen marks ready
│  ready (waiting)       │ ← Ready to serve
│  settled (paid)        │ ← Part of a consolidated tab
│  paid (standalone)     │ ← Paid directly (not tab)
│  cancelled             │ ← Never settled
└────────────────────────┘
```

### 8.2 Revenue Reporting

To prevent double-counting:

```typescript
// Report only master orders
const totalRevenue = orders
    .filter(o => o.type === "table_tab_master" || o.status === "paid")
    .reduce((sum, o) => sum + o.totalAmount, 0);
```

---

## 9. Integration with PrintBridge

After successful settlement, print receipt:

```typescript
// In PayNowModal or settlement completion
const handleSettlementSuccess = async (masterOrder) => {
    // Queue print job
    window.queuePrintJob(
        "receipt", // job type
        formatReceipt(masterOrder), // content
        "default" // terminal
    );
};
```

---

## 10. Edge Cases & Error Handling

### 10.1 Partial Payment

If customer cannot pay full amount:

```typescript
// Option 1: Split tender (partially accept, request additional payment)
if (amountReceived > 0 && amountReceived < totalAmount) {
    const remaining = totalAmount - amountReceived;
    toast.warning(`Remaining balance: ${formatCurrency(remaining)}`);
    
    // Create payment with remaining balance
    // Don't mark child orders as "settled" yet
}

// Option 2: Reject and retry
throw new Error("Amount is insufficient");
```

### 10.2 Network Failure During Settlement

Implement idempotent settlement:

```typescript
// Use Appwrite transaction-like behavior
// CheckPoint 1: Verify unpaid orders exist
// CheckPoint 2: Create master order
// CheckPoint 3: Mark child orders settled
// If any step fails, entire operation rolls back

// For idempotency: check if master order already exists
const existingMaster = await findMasterOrderByTableAndDate(tableNumber, date);
if (existingMaster) {
    return existingMaster; // Already settled
}
```

---

## 11. Collection Schema Updates

### Orders Collection (New Fields)

```json
{
    // Existing
    "orderNumber": "string",
    "type": "enum: order | dine_in | table_tab | table_tab_master",
    "status": "enum: placed | confirmed | ready | settled | paid | cancelled",
    "paymentStatus": "enum: unpaid | settled | paid | refunded",
    "tableNumber": "number",
    "totalAmount": "number",

    // Settlement additions
    "paymentMethod": "enum: cash | pdq | mpesa | paystack",
    "paymentReference": "string (CASH-123, PDQ-456, etc.)",
    "parentOrderId": "reference (if part of table_tab_master)",
    "childOrderIds": "array of references (if table_tab_master)",

    // Cash specific
    "amountReceived": "number",
    "change": "number",

    // Audit
    "settledAt": "datetime",
    "settledBy": "string (staff name)",
    "staffId": "reference"
}
```

---

## 12. Implementation Checklist

- [ ] OpenOrdersModal component
- [ ] PayNowModal with 4 payment methods
- [ ] settleTableTabAndCreateOrder action
- [ ] Revenue reporting excludes duplicates
- [ ] Concurrency checks prevent race conditions
- [ ] Cash change calculation
- [ ] PDQ approval code validation
- [ ] M-Pesa phone format validation
- [ ] Paystack callback integration
- [ ] PrintBridge receipt generation
- [ ] Multi-tenant businessId filtering
- [ ] Error handling & recovery
- [ ] Performance tested with 100+ unpaid orders

---

## 13. Testing Scenarios

### Scenario 1: Cash Payment with Change
1. Customer orders items = KSh 500
2. Customer pays KSh 1000
3. System calculates change = KSh 500
4. ✅ Master order created, child orders marked "settled"

### Scenario 2: Concurrent Settlement (Race Condition)
1. Terminal A initiates settlement for Table 5
2. Terminal B tries to settle Table 5 simultaneously
3. ❌ System blocks Terminal B with "Already settling" error
4. ✅ Only Terminal A's settlement succeeds

### Scenario 3: M-Pesa Payment
1. Staff enters customer phone: 254712345678
2. System sends M-Pesa STK push
3. Customer approves via phone
4. Staff confirms receipt
5. ✅ Reference recorded as MPESA-{timestamp}

### Scenario 4: Network Failure During Settlement
1. settleTableTabAndCreateOrder() called
2. Master order created ✓
3. Network fails during "mark child orders settled"
4. Retry settlement with same data
5. ✅ Idempotency check prevents duplicate master order
