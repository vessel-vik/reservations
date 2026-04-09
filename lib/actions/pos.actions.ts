"use server";

import { databases, DATABASE_ID, MENU_ITEMS_COLLECTION_ID, ORDERS_COLLECTION_ID, CATEGORIES_COLLECTION_ID, DELETED_ORDERS_LOG_COLLECTION_ID } from "@/lib/appwrite.config";
import { ID, Query } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { Order, type CartItem, type OpenOrder, type OpenOrdersSummary } from "@/types/pos.types";
import { decrementItemStocks } from '@/lib/actions/menu.actions';
import { getAuthContext, validateBusinessContext, requireOrgAdmin } from '@/lib/auth.utils';
import { VoidOrderSchema, type VoidOrderCategory } from "@/lib/schemas/void-order";
import {
    computeKitchenDelta,
    computeKitchenPrintChanges,
    KITCHEN_SNAPSHOT_MIN_VERSION,
    linesFromCartItems,
    mergeKitchenSnapshotIntoSpecialInstructions,
    parseLastKitchenSnapshot,
    parseLastKitchenSnapshotMeta,
    type KitchenAnomalyItem,
    type KitchenLine,
} from "@/lib/kitchen-print-snapshot";
import { computeOrderAgeMinutes } from "@/lib/order-time";
import { printCategoryFromJobType, recordPrintAudit } from "@/lib/print-audit";

/** Appwrite listDocuments max is 5000 per request (Pro). */
const POS_ORDER_PAGE_MAX = Math.min(Number(process.env.POS_ORDERS_LIST_MAX || 4000), 5000);

export const getCategories = async () => {
    try {
        if (!DATABASE_ID || !CATEGORIES_COLLECTION_ID) {
            return [];
        }

        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const result = await databases.listDocuments(
            DATABASE_ID,
            CATEGORIES_COLLECTION_ID,
            [
                Query.equal("businessId", businessId), // CRITICAL: Multi-tenant isolation
                Query.equal("isActive", true),
                Query.orderAsc("index"),
                Query.limit(100) // Explicit limit to ensure all categories fetched
            ]
        );

        const documents = parseStringify(result?.documents);
        return Array.isArray(documents) ? documents : [];
    } catch (error: any) {
        const message = error?.message || String(error);
        if (message.includes("Project is paused")) {
            console.error("Appwrite project paused: please restore it via the Appwrite console.", error);
        } else {
            console.error("Error fetching categories:", error);
        }
        return [];
    }
};

export const getMenuItems = async () => {
    try {
        if (!DATABASE_ID || !MENU_ITEMS_COLLECTION_ID) {
            console.warn("Database or Collection ID missing");
            return [];
        }

        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const result = await databases.listDocuments(
            DATABASE_ID,
            MENU_ITEMS_COLLECTION_ID,
            [
                Query.equal("businessId", businessId), // CRITICAL: Multi-tenant isolation
                // Fetch both available and low-stock (stock>0) items; client filters out zero-stock
                // isAvailable=false with stock>0 means manually disabled — excluded by client
                Query.notEqual("isAvailable", false),
                Query.limit(150),
                Query.orderDesc("popularity"),
            ]
        );

        const documents = parseStringify(result?.documents);
        return Array.isArray(documents) ? documents : [];
    } catch (error: any) {
        const message = error?.message || String(error);
        if (message.includes("Project is paused")) {
            console.error("Appwrite project paused: please restore it via the Appwrite console.", error);
        } else {
            console.error("Error fetching menu items:", error);
        }
        return [];
    }
};

/**
 * Compress order items to minimize JSON size (Appwrite enforces 5000 char limit on string fields)
 * Only stores essential data: product ID, name, price (for history), and quantity
 */
const TAB_ASSIGN_MAX_UNPAID_LIST = 2000;
const TAB_ASSIGN_MAX_RETRIES = 12;

function printJobsCollectionId(): string | undefined {
    return process.env.PRINT_JOBS_COLLECTION_ID || process.env.NEXT_PUBLIC_PRINT_JOBS_COLLECTION_ID;
}

function paymentLedgerCollectionId(): string | undefined {
    return process.env.PAYMENT_LEDGER_COLLECTION_ID;
}

type PaymentLedgerWrite = {
    businessId: string;
    orderId: string;
    settlementGroupId?: string;
    method: string;
    amount: number;
    reference?: string;
    terminalId?: string;
    status: "confirmed" | "failed";
    source: "shadow" | "worker";
    settledAt: string;
};

async function writePaymentLedgerShadow(rows: PaymentLedgerWrite[]): Promise<void> {
    const coll = paymentLedgerCollectionId();
    if (!coll || !DATABASE_ID || !Array.isArray(rows) || rows.length === 0) return;

    for (const row of rows) {
        try {
            await databases.createDocument(DATABASE_ID, coll, ID.unique(), {
                businessId: row.businessId,
                orderId: row.orderId,
                settlementGroupId: row.settlementGroupId || "",
                method: String(row.method || "cash").toLowerCase().trim(),
                amount: roundMoney(Number(row.amount) || 0),
                reference: String(row.reference || "").slice(0, 220),
                terminalId: String(row.terminalId || "").slice(0, 120),
                source: row.source,
                status: row.status,
                settledAt: row.settledAt,
                createdAt: new Date().toISOString(),
            });
        } catch (err) {
            // Best-effort shadow write: settlement success must not fail on ledger insert.
            console.warn("writePaymentLedgerShadow failed:", err);
        }
    }
}

async function queuePrintJobInternal(
    businessId: string,
    orderId: string,
    jobType: "captain_docket" | "docket" = "captain_docket",
    actor?: { userId?: string; role?: string },
    waiter?: { waiterId?: string; waiterName?: string }
) {
    const coll = printJobsCollectionId();
    if (!coll || !DATABASE_ID) {
        return;
    }
    try {
        const nowIso = new Date().toISOString();
        const payload = {
            status: "pending",
            jobType,
            category: printCategoryFromJobType(jobType),
            content: `orderId:${orderId}`,
            orderId,
            dedupeKey: "",
            timestamp: nowIso,
            queuedAt: nowIso,
            printedAt: "",
            attemptCount: 0,
            waiterId: String(waiter?.waiterId || "").slice(0, 64),
            waiterNameSnapshot: String(waiter?.waiterName || "").slice(0, 255),
            requeueReason: "initial_docket",
            targetTerminal: "default",
            createdByUserId: String(actor?.userId || "").slice(0, 64),
            createdByRole: String(actor?.role || "").slice(0, 40),
            businessId,
        };
        let created: any;
        try {
            created = await databases.createDocument(DATABASE_ID, coll, ID.unique(), payload);
        } catch {
            // Backward compatibility for environments without the new optional attributes.
            created = await databases.createDocument(DATABASE_ID, coll, ID.unique(), {
                status: payload.status,
                jobType: payload.jobType,
                content: payload.content,
                timestamp: payload.timestamp,
                targetTerminal: payload.targetTerminal,
                businessId: payload.businessId,
            });
        }
        await recordPrintAudit({
            businessId,
            printJobId: created.$id,
            jobType,
            status: "queued",
            orderId,
            summary: `Queued ${jobType} for order ${orderId}`,
            content: `orderId:${orderId}`,
            actorUserId: actor?.userId,
            actorRole: actor?.role,
            waiterId: waiter?.waiterId,
            terminalId: "default",
            requeueReason: "initial_docket",
        });
    } catch (e) {
        console.error("queuePrintJobInternal failed:", e);
    }
}

async function maxUnpaidTabTableNumber(businessId: string): Promise<number> {
    const r = await databases.listDocuments(DATABASE_ID!, ORDERS_COLLECTION_ID!, [
        Query.equal("businessId", businessId),
        Query.equal("paymentStatus", "unpaid"),
        Query.limit(TAB_ASSIGN_MAX_UNPAID_LIST),
    ]);
    let max = 0;
    for (const d of r.documents as any[]) {
        if (d?.isDeleted) continue;
        const n = Number(d.tableNumber);
        if (!Number.isNaN(n) && n > max) max = n;
    }
    return max;
}

async function unpaidOrderCountAtTable(businessId: string, tableNumber: number): Promise<number> {
    const r = await databases.listDocuments(DATABASE_ID!, ORDERS_COLLECTION_ID!, [
        Query.equal("businessId", businessId),
        Query.equal("tableNumber", tableNumber),
        Query.equal("paymentStatus", "unpaid"),
        Query.limit(1),
    ]);
    return typeof r.total === "number" ? r.total : r.documents.length;
}

/**
 * Check-then-set style tab number: verify no unpaid tab exists on the table before use.
 * Auto mode uses max(unpaid tableNumber)+1 with retries if another terminal races.
 */
async function assignTabTableNumberWithCheck(
    businessId: string,
    explicitTable?: number
): Promise<number> {
    if (explicitTable != null && explicitTable > 0) {
        const c1 = await unpaidOrderCountAtTable(businessId, explicitTable);
        if (c1 > 0) {
            throw new Error(`Table ${explicitTable} already has an open tab.`);
        }
        const c2 = await unpaidOrderCountAtTable(businessId, explicitTable);
        if (c2 > 0) {
            throw new Error(`Table ${explicitTable} was just taken. Try another number.`);
        }
        return explicitTable;
    }

    let candidate = (await maxUnpaidTabTableNumber(businessId)) + 1;
    if (candidate < 1) candidate = 1;

    for (let attempt = 0; attempt < TAB_ASSIGN_MAX_RETRIES; attempt++) {
        const c = await unpaidOrderCountAtTable(businessId, candidate);
        if (c === 0) {
            const c2 = await unpaidOrderCountAtTable(businessId, candidate);
            if (c2 === 0) return candidate;
        }
        candidate += 1;
    }
    throw new Error("Could not assign a tab number. Try again.");
}

const compressOrderItems = (items: any[]): string => {
    if (!Array.isArray(items) || items.length === 0) return JSON.stringify([]);
    
    const compressed = items.map(item => ({
        $id: item.$id,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1
    }));
    
    return JSON.stringify(compressed);
};

/** Appwrite orders collection often has no paymentMethods / settlement* attributes — persist audit in specialInstructions. */
const buildSettlementAuditSuffix = (meta: {
    paymentMethods?: unknown;
    settlementParentOrderId?: unknown;
    settlementType?: unknown;
    settledOrderIds?: unknown;
}): string => {
    let extra = "";
    if (meta.paymentMethods != null) {
        extra += `\n[PAYMENT_AUDIT] ${JSON.stringify(meta.paymentMethods)}`;
    }
    if (meta.settlementParentOrderId != null) {
        extra += `\n[SETTLEMENT_PARENT] ${meta.settlementParentOrderId}`;
    }
    if (meta.settlementType != null) {
        extra += `\n[SETTLEMENT_TYPE] ${meta.settlementType}`;
    }
    if (meta.settledOrderIds != null) {
        extra += `\n[SETTLED_ORDER_IDS] ${JSON.stringify(meta.settledOrderIds)}`;
    }
    return extra;
};

const ORDER_UPDATE_FALLBACK_KEYS = [
    "paymentStatus",
    "status",
    "specialInstructions",
    "items",
    "totalAmount",
    "subtotal",
    "taxAmount",
    "discountAmount",
    "serviceCharge",
    "tipAmount",
    "customerName",
    "guestCount",
    "tableNumber",
    "waiterName",
    "waiterId",
    "orderNumber",
    "type",
    "priority",
] as const;

const updateOrderDocumentSafe = async (orderId: string, updateData: Record<string, any>) => {
    const {
        paymentMethods,
        settlementParentOrderId,
        settlementType,
        settledOrderIds,
        specialInstructions: incomingSpecial,
        ...core
    } = updateData;

    const hasSettlementMeta =
        paymentMethods != null ||
        settlementParentOrderId != null ||
        settlementType != null ||
        settledOrderIds != null;

    const payload: Record<string, any> = { ...core };

    if (hasSettlementMeta) {
        let base = "";
        try {
            const existing = await databases.getDocument(DATABASE_ID!, ORDERS_COLLECTION_ID!, orderId);
            base =
                incomingSpecial !== undefined
                    ? String(incomingSpecial)
                    : String((existing as any).specialInstructions || "");
        } catch {
            base = incomingSpecial !== undefined ? String(incomingSpecial) : "";
        }
        const audit = buildSettlementAuditSuffix({
            paymentMethods,
            settlementParentOrderId,
            settlementType,
            settledOrderIds,
        });
        payload.specialInstructions = `${base}${audit}`.slice(0, 950);
    } else if (incomingSpecial !== undefined) {
        payload.specialInstructions = incomingSpecial;
    }

    try {
        return await databases.updateDocument(DATABASE_ID!, ORDERS_COLLECTION_ID!, orderId, payload);
    } catch (error: unknown) {
        const msg = String((error as any)?.message || error || "");
        const structural =
            msg.includes("Unknown attribute") || (error as any)?.type === "document_invalid_structure";

        if (!structural) {
            throw error;
        }

        const fallback: Record<string, any> = {};
        for (const key of ORDER_UPDATE_FALLBACK_KEYS) {
            if (payload[key] !== undefined) {
                fallback[key] = payload[key];
            }
        }

        if (Object.keys(fallback).length === 0) {
            throw error;
        }

        return await databases.updateDocument(DATABASE_ID!, ORDERS_COLLECTION_ID!, orderId, fallback);
    }
};

export const createOrder = async (order: Omit<Order, "$id" | "$createdAt" | "$updatedAt">) => {
    try {
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        // Prepare order data - only include fields that exist in Appwrite schema.
        // The Appwrite collection already includes paymentMethods, but NOT the
        // helper settlement metadata we keep in the TS type.
        const {
            settlementType,
            settlementParentOrderId,
            settledOrderIds,
            paymentMethods,
            ...baseOrder
        } = order as any;

        const orderData: any = {
            ...baseOrder,
            businessId, // CRITICAL: Multi-tenant isolation
            items: compressOrderItems(order.items), // Store only essential item data to stay under 5000 char limit
        };

        const createAudit = buildSettlementAuditSuffix({
            paymentMethods,
            settlementParentOrderId,
            settlementType,
            settledOrderIds,
        });
        if (createAudit.trim()) {
            const prevSi = String(orderData.specialInstructions || "");
            orderData.specialInstructions = `${prevSi}${createAudit}`.slice(0, 950);
        }

        const kitchenLines = linesFromCartItems(Array.isArray(order.items) ? order.items : []);
        if (kitchenLines.length > 0) {
            orderData.specialInstructions = mergeKitchenSnapshotIntoSpecialInstructions(
                String(orderData.specialInstructions || ""),
                kitchenLines,
                KITCHEN_SNAPSHOT_MIN_VERSION
            );
        }

        const newOrder = await databases.createDocument(
            DATABASE_ID!,
            ORDERS_COLLECTION_ID!,
            ID.unique(),
            orderData
        );

        const normalizedOrder: any = parseStringify(newOrder);
        if (typeof normalizedOrder.items === "string") {
            try {
                normalizedOrder.items = JSON.parse(normalizedOrder.items);
            } catch (parseError) {
                console.warn("Failed to parse order items JSON on createOrder:", parseError);
            }
        }

        // Decrement stock for ordered items (best-effort — never fail the order)
        try {
          const itemsArray = Array.isArray(order.items) ? order.items : [];
          if (itemsArray.length > 0) {
            await decrementItemStocks(
              itemsArray.map(item => ({ itemId: item.$id, quantity: item.quantity || 1 }))
            );
          }
        } catch (stockErr) {
          console.error('Error decrementing stock after order:', stockErr);
        }

        // Optimize popularity updates with batch processing
        // Use Promise.allSettled to prevent one failure from affecting others
        try {
            const itemsArray = Array.isArray(order.items) ? order.items : [];
            if (itemsArray.length === 0) return parseStringify(newOrder);
            
            // Batch fetch all items first (O(n) instead of O(n) sequential)
            const itemIds = itemsArray.map(item => item.$id);
            const fetchPromises = itemIds.map(id => 
                databases.getDocument(DATABASE_ID!, MENU_ITEMS_COLLECTION_ID!, id)
                    .catch(err => {
                        console.error(`Failed to fetch item ${id}:`, err);
                        return null;
                    })
            );
            
            const fetchedDocs = await Promise.all(fetchPromises);
            
            // Batch update all items (parallel execution)
            const updatePromises = fetchedDocs.map((doc, index) => {
                if (!doc) return Promise.resolve();
                
                const currentPopularity = (doc as any).popularity || 0;
                const orderedItem = itemsArray[index];
                const newPopularity = currentPopularity + (orderedItem.quantity || 1);
                
                return databases.updateDocument(
                    DATABASE_ID!,
                    MENU_ITEMS_COLLECTION_ID!,
                    itemIds[index],
                    { popularity: newPopularity }
                ).catch(err => {
                    console.error(`Failed to update popularity for ${itemIds[index]}:`, err);
                });
            });
            
            await Promise.allSettled(updatePromises);
        } catch (popularityError) {
            // Log but don't fail the order
            console.error("Error updating popularity:", popularityError);
        }

        return normalizedOrder;
    } catch (error) {
        console.error("Error creating order:", error);
        throw new Error("Failed to create order");
    }
};

export type CreateTabOrderInput = {
    items: CartItem[];
    customerName?: string;
    /** If omitted, assigns the next free tab number from existing unpaid orders. */
    tableNumber?: number;
    waiterName: string;
    waiterId: string;
};

/**
 * One-click tab: tenant-scoped order, sequential tab/table number with check-then-set,
 * and a pending PRINT_JOBS row for PrintBridge / thermal docket.
 */
export async function createTabOrderFromCart(input: CreateTabOrderInput) {
    const { businessId, role, userId } = await getAuthContext();
    validateBusinessContext(businessId);

    const items = Array.isArray(input.items) ? input.items : [];
    if (items.length === 0) {
        throw new Error("No items in cart");
    }

    const tableNumber = await assignTabTableNumberWithCheck(businessId, input.tableNumber);

    const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    const vatRate = 0.16;
    const subtotal = total / (1 + vatRate);
    const taxAmount = subtotal * vatRate;
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `ORD-${timestamp}-${random}`;
    const name =
        input.customerName && input.customerName.trim() !== ""
            ? input.customerName.trim()
            : "Walk-in Customer";

    const orderData: Omit<Order, "$id" | "$createdAt" | "$updatedAt"> = {
        orderNumber,
        type: "dine_in",
        status: "placed",
        tableNumber,
        customerName: name,
        guestCount: 1,
        waiterName: input.waiterName || "POS System",
        waiterId: input.waiterId || "system",
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        serviceCharge: 0,
        discountAmount: 0,
        tipAmount: 0,
        totalAmount: total,
        paymentStatus: "unpaid",
        orderTime: new Date().toISOString(),
        priority: "normal",
        items,
        specialInstructions: `TAB - Table ${tableNumber}`,
    };

    const newOrder = await createOrder(orderData as any);
    await queuePrintJobInternal(businessId, newOrder.$id as string, "captain_docket", {
        userId,
        role,
    }, {
        waiterId: input.waiterId,
        waiterName: input.waiterName,
    });
    return newOrder;
}

export const getOrders = async () => {
    try {
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const result = await databases.listDocuments(
            DATABASE_ID!,
            ORDERS_COLLECTION_ID!,
            [
                Query.equal("businessId", businessId), // CRITICAL: Multi-tenant isolation
                Query.orderDesc("$createdAt"),
                Query.limit(POS_ORDER_PAGE_MAX)
            ]
        );

        return parseStringify(result.documents);
    } catch (error) {
        console.error("Error fetching orders:", error);
        return [];
    }
};

/** Unpaid orders only — use for POS API `status=open` (avoids missing rows vs a mixed recent list). */
export const getUnpaidOrdersForBusiness = async (limit = POS_ORDER_PAGE_MAX) => {
    try {
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const result = await databases.listDocuments(DATABASE_ID!, ORDERS_COLLECTION_ID!, [
            Query.equal("businessId", businessId),
            Query.equal("paymentStatus", "unpaid"),
            Query.orderDesc("$createdAt"),
            Query.limit(Math.min(limit, 5000)),
        ]);

        return parseStringify(result.documents);
    } catch (error) {
        console.error("Error fetching unpaid orders:", error);
        return [];
    }
};

/** Paid / settled for audit modals — avoids loading only the last N mixed documents. */
export const getClosedOrdersForAudit = async (limit = POS_ORDER_PAGE_MAX) => {
    try {
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const result = await databases.listDocuments(DATABASE_ID!, ORDERS_COLLECTION_ID!, [
            Query.equal("businessId", businessId),
            Query.equal("paymentStatus", ["paid", "settled"]),
            Query.orderDesc("$createdAt"),
            Query.limit(Math.min(limit, 5000)),
        ]);

        return parseStringify(result.documents);
    } catch (error) {
        console.error("Error fetching closed orders (OR):", error);
        try {
            const { businessId } = await getAuthContext();
            validateBusinessContext(businessId);
            const cap = Math.min(limit, 5000);
            const [paid, settled] = await Promise.all([
                databases.listDocuments(DATABASE_ID!, ORDERS_COLLECTION_ID!, [
                    Query.equal("businessId", businessId),
                    Query.equal("paymentStatus", "paid"),
                    Query.orderDesc("$createdAt"),
                    Query.limit(cap),
                ]),
                databases.listDocuments(DATABASE_ID!, ORDERS_COLLECTION_ID!, [
                    Query.equal("businessId", businessId),
                    Query.equal("paymentStatus", "settled"),
                    Query.orderDesc("$createdAt"),
                    Query.limit(cap),
                ]),
            ]);
            const merged = [...paid.documents, ...settled.documents];
            const seen = new Set<string>();
            const uniq = merged.filter((d: { $id: string }) => {
                if (seen.has(d.$id)) return false;
                seen.add(d.$id);
                return true;
            });
            uniq.sort(
                (a: { $createdAt: string }, b: { $createdAt: string }) =>
                    new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
            );
            return parseStringify(uniq.slice(0, cap));
        } catch (e2) {
            console.error("Error fetching closed orders (fallback):", e2);
            return [];
        }
    }
};

export const getOrdersByTable = async (tableNumber: number, onlyUnpaid = true) => {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            return [];
        }

        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const queries: any[] = [
            Query.equal("businessId", businessId), // CRITICAL: Multi-tenant isolation
            Query.equal("tableNumber", tableNumber),
            Query.orderDesc("$createdAt"),
        ];

        if (onlyUnpaid) {
            // Use paymentStatus to identify unpaid orders; adjust as needed based on schema
            queries.push(Query.equal("paymentStatus", "unpaid"));
        }

        queries.push(Query.limit(POS_ORDER_PAGE_MAX));

        const result = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            queries
        );

        return parseStringify(result.documents);
    } catch (error) {
        console.error("Error fetching orders by table:", error);
        return [];
    }
};

/**
 * Get all unpaid orders for a specific table on a given calendar day.
 * The date should be an ISO string in yyyy-mm-dd format (e.g. "2025-03-08").
 * This keeps the logic server-side so the UI can safely aggregate a guest's
 * daily tab without re-implementing date filtering in the client.
 */
export const getUnpaidOrdersForTableOnDate = async (
    tableNumber: number,
    date: string
) => {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            return [];
        }

        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const day = new Date(date);
        if (Number.isNaN(day.getTime())) {
            throw new Error(`Invalid date supplied to getUnpaidOrdersForTableOnDate: "${date}"`);
        }

        const startOfDay = new Date(day);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(day);
        endOfDay.setHours(23, 59, 59, 999);

        const result = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.equal("businessId", businessId), // CRITICAL: Multi-tenant isolation
                Query.equal("tableNumber", tableNumber),
                Query.equal("paymentStatus", "unpaid"),
                Query.greaterThanEqual("orderTime", startOfDay.toISOString()),
                Query.lessThanEqual("orderTime", endOfDay.toISOString()),
                Query.orderAsc("orderTime"),
            ]
        );

        return parseStringify(result.documents);
    } catch (error) {
        console.error("Error fetching unpaid orders for table on date:", error);
        return [];
    }
};

/**
 * Calculate the consolidated daily total for a guest's tab (all unpaid orders
 * for a table on a specific date). This is useful for showing the amount that
 * needs to be charged when closing out the bill.
 */
export const getTableDailyTabSummary = async (
    tableNumber: number,
    date: string
) => {
    const orders: any[] = await getUnpaidOrdersForTableOnDate(tableNumber, date);

    const totalAmount = orders.reduce((sum, order) => {
        const value = typeof order.totalAmount === "number" ? order.totalAmount : 0;
        return sum + value;
    }, 0);

    const subtotal = orders.reduce((sum, order) => {
        const value = typeof order.subtotal === "number" ? order.subtotal : 0;
        return sum + value;
    }, 0);

    return {
        tableNumber,
        date,
        orderCount: orders.length,
        subtotal,
        totalAmount,
        orders,
    };
};

/**
 * Mark all unpaid orders for a table on a given date as paid in a single
 * operation. Prefer using `settleTableTabAndCreateOrder` for new code so that
 * a consolidated receipt order is also created for printing.
 */
export const settleTableTabForDate = async ({
    tableNumber,
    date,
    paymentReference,
    paymentMethod = "paystack",
}: {
    tableNumber: number;
    date: string;
    paymentReference: string;
    paymentMethod?: string;
}) => {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            throw new Error("Database configuration is missing");
        }

        const summary = await getTableDailyTabSummary(tableNumber, date);

        if (!summary.orders.length) {
            return {
                success: false as const,
                message: "No unpaid orders found for this table and date",
                updatedCount: 0,
                totalAmount: 0,
            };
        }

        // Update each order's paymentStatus (and optionally paymentMethods) in parallel.
        const updatePromises = summary.orders.map((order: any) => {
            // Guard against already-paid orders in case of race conditions.
            if (order.paymentStatus && order.paymentStatus !== "unpaid") {
                return Promise.resolve(null);
            }

            const existingMethods: any[] = Array.isArray(order.paymentMethods)
                ? order.paymentMethods
                : [];

            const updatedMethods = [
                ...existingMethods,
                {
                    method: paymentMethod,
                    amount: order.totalAmount,
                    reference: paymentReference,
                    settledAt: new Date().toISOString(),
                },
            ];

            return updateOrderDocumentSafe(order.$id, {
                paymentStatus: "paid",
                paymentMethods: updatedMethods,
            });
        });

        const results = await Promise.allSettled(updatePromises);

        const updatedCount = results.filter(
            (r) => r.status === "fulfilled" && r.value !== null
        ).length;

        return {
            success: true as const,
            message: "Table tab settled successfully",
            updatedCount,
            totalAmount: summary.totalAmount,
            tableNumber: summary.tableNumber,
            date: summary.date,
            paymentReference,
            paymentMethod,
        };
    } catch (error) {
        console.error("Error settling table tab for date:", error);
        return {
            success: false as const,
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to settle table tab",
            updatedCount: 0,
            totalAmount: 0,
        };
    }
};

/** One line of a split settlement (cash / PDQ / M-Pesa Paybill). Sum must equal order total. */
export type PaymentSplitInput = {
    method: string;
    amount: number;
    reference?: string;
    terminalId?: string;
};

type SettlementAuthContextOverride = {
    businessId: string;
    userId?: string;
    role?: string;
};

const SPLIT_SUM_EPSILON = 0.05;

function roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Normalize optional split rows or fall back to a single method + reference.
 * Throws if split amounts do not match `totalAmount`.
 */
function buildSettledSplits(
    totalAmount: number,
    paymentMethod: string,
    paymentReference: string | undefined,
    paymentSplits: PaymentSplitInput[] | undefined,
    terminalId?: string
): {
    splits: Array<{ method: string; amount: number; reference: string; settledAt: string; terminalId?: string }>;
    combinedRef: string;
} {
    const settledAt = new Date().toISOString();
    const target = roundMoney(totalAmount);
    if (paymentSplits && paymentSplits.length > 0) {
        const sum = paymentSplits.reduce((s, x) => s + roundMoney(Number(x.amount) || 0), 0);
        if (Math.abs(roundMoney(sum) - target) > SPLIT_SUM_EPSILON) {
            throw new Error(
                `Payment split (KSh ${roundMoney(sum).toFixed(2)}) must equal total (KSh ${target.toFixed(2)}).`
            );
        }
        const splits = paymentSplits.map((x, idx) => {
            const m = String(x.method || "cash").toLowerCase().trim();
            const ref =
                x.reference?.trim() ||
                (m === "cash"
                    ? `CASH-${idx + 1}-${Date.now()}`
                    : `${m.toUpperCase()}-${idx + 1}-${Date.now()}`);
            return {
                method: m,
                amount: roundMoney(Number(x.amount) || 0),
                reference: ref,
                settledAt,
                terminalId: x.terminalId || terminalId,
            };
        });
        return { splits, combinedRef: splits.map((s) => s.reference).join("|") };
    }
    const ref = paymentReference || `manual-${paymentMethod}-${Date.now()}`;
    return {
        splits: [
            {
                method: String(paymentMethod || "cash").toLowerCase().trim(),
                amount: target,
                reference: ref,
                settledAt,
                terminalId,
            },
        ],
        combinedRef: ref,
    };
}

/** Allocate consolidated split lines to each child order by share of grand total (for admin / audit). */
function allocateSplitsToChildOrders(
    splits: Array<{ method: string; amount: number; reference: string; settledAt: string; terminalId?: string }>,
    unpaidOrders: { $id: string; totalAmount: number }[],
    grandTotal: number
): Map<string, Array<{ method: string; amount: number; reference: string; settledAt: string; terminalId?: string }>> {
    const map = new Map<
        string,
        Array<{ method: string; amount: number; reference: string; settledAt: string }>
    >();
    if (grandTotal <= 0) {
        for (const o of unpaidOrders) map.set(o.$id, []);
        return map;
    }
    for (const order of unpaidOrders) {
        const f = (order.totalAmount || 0) / grandTotal;
        const lines = splits.map((sp) => ({
            method: sp.method,
            reference: sp.reference,
            settledAt: sp.settledAt,
            terminalId: sp.terminalId,
            amount: roundMoney(sp.amount * f),
        }));
        const lineSum = lines.reduce((s, l) => s + l.amount, 0);
        const target = roundMoney(order.totalAmount || 0);
        const drift = roundMoney(target - lineSum);
        if (lines.length && Math.abs(drift) >= 0.005) {
            const last = lines[lines.length - 1]!;
            lines[lines.length - 1] = {
                ...last,
                amount: roundMoney(last.amount + drift),
            };
        }
        map.set(order.$id, lines);
    }
    return map;
}

export const settleSelectedOrders = async ({
    orderIds,
    paymentMethod = "cash",
    paymentReference,
    paymentSplits,
    terminalId,
    authContextOverride,
}: {
    orderIds: string[];
    paymentMethod?: string;
    paymentReference?: string;
    paymentSplits?: PaymentSplitInput[];
    terminalId?: string;
    authContextOverride?: SettlementAuthContextOverride;
}) => {
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
        throw new Error("Database configuration is missing");
    }

    const authContext = authContextOverride || (await getAuthContext());
    const businessId = String(authContext.businessId || "").trim();
    const userId = String(authContext.userId || "system");
    const role = String(authContext.role || "system");
    validateBusinessContext(businessId);

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return {
            success: false as const,
            message: "No orders selected for settlement",
            updatedCount: 0,
            totalAmount: 0,
            consolidatedOrderId: null,
        };
    }

    // Hard cap: prevent abuse and Appwrite rate-limit exhaustion
    const BATCH_SIZE = 10;
    const cappedIds = orderIds.slice(0, 200);

    // Chunked sequential fetch — avoids flooding Appwrite with 50+ concurrent requests
    const fetchedOrders: any[] = [];
    for (let i = 0; i < cappedIds.length; i += BATCH_SIZE) {
        const chunk = cappedIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            chunk.map(async (orderId) => {
                try {
                    const order = await databases.getDocument(DATABASE_ID!, ORDERS_COLLECTION_ID!, orderId);
                    return parseStringify(order) as any;
                } catch (error) {
                    console.warn(`Order ${orderId} not found during settlement:`, error);
                    return null;
                }
            })
        );
        fetchedOrders.push(...results);
    }

    // Ownership check: all fetched orders must belong to this business
    const validOrders = fetchedOrders.filter(
        (order): order is any => order !== null && order.businessId === businessId
    );
    const missingCount = orderIds.length - validOrders.length;

    if (!validOrders.length) {
        return {
            success: false as const,
            message: "None of the selected orders could be found. Refresh and try again.",
            updatedCount: 0,
            totalAmount: 0,
            consolidatedOrderId: null,
        };
    }

    if (missingCount > 0) {
        console.warn(`${missingCount} selected order(s) were not found during settlement.`);
    }

    const unpaidOrders = validOrders.filter(
        (order) => order.paymentStatus === "unpaid" || order.status === "placed"
    );

    if (unpaidOrders.length === 0) {
        return {
            success: false as const,
            message: "Selected orders are already settled or paid",
            updatedCount: 0,
            totalAmount: 0,
            consolidatedOrderId: null,
        };
    }

    const totalAmount = unpaidOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

    if (unpaidOrders.length === 1) {
        const order = unpaidOrders[0];
        const orderTotal = roundMoney(order.totalAmount || 0);
        let splits: ReturnType<typeof buildSettledSplits>["splits"];
        let combinedRef: string;
        try {
            ({ splits, combinedRef } = buildSettledSplits(
                orderTotal,
                paymentMethod,
                paymentReference,
                paymentSplits,
                terminalId
            ));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Invalid payment split";
            return {
                success: false as const,
                message,
                updatedCount: 0,
                totalAmount: orderTotal,
                consolidatedOrderId: null,
            };
        }
        const existingMethods: any[] = Array.isArray(order.paymentMethods) ? order.paymentMethods : [];
        const updatedMethods = [...existingMethods, ...splits];

        await updateOrderDocumentSafe(order.$id, {
            paymentStatus: "paid",
            status: "paid",
            paymentMethods: updatedMethods,
        });
        await writePaymentLedgerShadow(
            splits.map((s) => ({
                businessId,
                orderId: String(order.$id),
                settlementGroupId: String(order.$id),
                method: s.method,
                amount: s.amount,
                reference: s.reference,
                terminalId: s.terminalId,
                source: "shadow" as const,
                status: "confirmed" as const,
                settledAt: s.settledAt,
            }))
        );

        return {
            success: true as const,
            message: "Order settled successfully",
            updatedCount: 1,
            totalAmount,
            consolidatedOrderId: order.$id,
            paymentReference: combinedRef,
            paymentMethod: splits.length === 1 ? splits[0]!.method : "mixed",
            paymentMethods: splits,
        };
    }

    const allItems: any[] = [];

    unpaidOrders.forEach((order) => {
        try {
            const parsedItems = order.items
                ? typeof order.items === "string"
                    ? JSON.parse(order.items)
                    : order.items
                : [];
            if (Array.isArray(parsedItems)) {
                parsedItems.forEach((item) => allItems.push(item));
            }
        } catch (err) {
            console.error("Failed to parse items for order", order.$id, err);
        }
    });

    const subtotal = allItems.reduce((sum, item: any) => {
        const price = typeof item.price === "number" ? item.price : 0;
        const qty = typeof item.quantity === "number" ? item.quantity : 1;
        return sum + price * qty;
    }, 0);

    const timestamp = Date.now().toString().slice(-10);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const consolidatedOrderNumber = `ORD-${timestamp}-${random}`;

    const firstOrder: any = unpaidOrders[0];

    let splits: ReturnType<typeof buildSettledSplits>["splits"];
    let combinedRef: string;
    try {
        ({ splits, combinedRef } = buildSettledSplits(
            roundMoney(totalAmount),
            paymentMethod,
            paymentReference,
            paymentSplits,
            terminalId
        ));
    } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid payment split";
        return {
            success: false as const,
            message,
            updatedCount: 0,
            totalAmount: roundMoney(totalAmount),
            consolidatedOrderId: null,
        };
    }
    const perChildSplits = allocateSplitsToChildOrders(splits, unpaidOrders, roundMoney(totalAmount));

    const consolidatedOrderData: Omit<Order, "$id" | "$createdAt" | "$updatedAt"> = {
        orderNumber: consolidatedOrderNumber,
        type: firstOrder.type || "dine_in",
        status: "paid",
        tableNumber: firstOrder.tableNumber,
        customerName: firstOrder.customerName || "Grouped Payment",
        guestCount: firstOrder.guestCount || unpaidOrders.length,
        waiterName: firstOrder.waiterName || "POS System",
        waiterId: firstOrder.waiterId,
        subtotal,
        taxAmount: 0,
        serviceCharge: 0,
        discountAmount: 0,
        tipAmount: 0,
        totalAmount,
        paymentStatus: "paid",
        orderTime: new Date().toISOString(),
        priority: "normal",
        items: allItems,
        specialInstructions: `GROUP SETTLEMENT - Table ${firstOrder.tableNumber} - ${unpaidOrders.length} orders`,
        settlementType: "table_tab_master",
        settledOrderIds: unpaidOrders.map((o: any) => o.$id),
        paymentMethods: splits,
    };

    const consolidatedOrder = await createOrder(consolidatedOrderData);

    // Chunked updates — same batch size to stay within Appwrite rate limits
    const results: PromiseSettledResult<any>[] = [];
    for (let i = 0; i < unpaidOrders.length; i += BATCH_SIZE) {
        const chunk = unpaidOrders.slice(i, i + BATCH_SIZE);
        const chunkResults = await Promise.allSettled(
            chunk.map((order) => {
                const existingMethods: any[] = Array.isArray(order.paymentMethods) ? order.paymentMethods : [];
                const childLines = perChildSplits.get(order.$id) || [];
                return updateOrderDocumentSafe(order.$id, {
                    paymentStatus: "settled",
                    status: "paid",
                    settlementParentOrderId: consolidatedOrder.$id,
                    paymentMethods: [...existingMethods, ...childLines],
                });
            })
        );
        results.push(...chunkResults);
    }
    const updatedCount = results.filter((r) => r.status === "fulfilled" && r.value !== null).length;

    const ledgerRows: PaymentLedgerWrite[] = [];
    for (const order of unpaidOrders) {
        const childLines = perChildSplits.get(order.$id) || [];
        for (const line of childLines) {
            ledgerRows.push({
                businessId,
                orderId: String(order.$id),
                settlementGroupId: String(consolidatedOrder.$id),
                method: line.method,
                amount: line.amount,
                reference: line.reference,
                terminalId: line.terminalId,
                source: "shadow",
                status: "confirmed",
                settledAt: line.settledAt,
            });
        }
    }
    await writePaymentLedgerShadow(ledgerRows);

    return {
        success: true as const,
        message: "Selected orders settled successfully",
        updatedCount,
        totalAmount,
        consolidatedOrderId: consolidatedOrder.$id as string,
        paymentReference: combinedRef,
        paymentMethod: splits.length === 1 ? splits[0]!.method : "mixed",
        paymentMethods: splits,
    };
};

/**
 * Settle a table tab and create a single consolidated Order document that can
 * be rendered by the existing /pos/receipt/[orderId] page. This keeps the
 * user-facing receipt flow identical to the standard Process Payment flow.
 */
export const settleTableTabAndCreateOrder = async ({
    tableNumber,
    date,
    paymentReference,
    paymentMethod = "paystack",
}: {
    tableNumber: number;
    date: string;
    paymentReference: string;
    paymentMethod?: string;
}) => {
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
        throw new Error("Database configuration is missing");
    }

    const { businessId, userId, role } = await getAuthContext();
    validateBusinessContext(businessId);

    // Get the latest snapshot of unpaid orders for this table+date
    const summary = await getTableDailyTabSummary(tableNumber, date);

    if (!summary.orders.length) {
        return {
            success: false as const,
            message: "No unpaid orders found for this table and date",
            consolidatedOrderId: null,
            updatedCount: 0,
            totalAmount: 0,
        };
    }

    // Parse and flatten items from all orders to build a consolidated receipt.
        const allItems: any[] = [];
        const orderNumbers: string[] = [];

        summary.orders.forEach((order: any) => {
            orderNumbers.push(order.orderNumber || order.$id);
            try {
                const parsedItems = order.items
                    ? typeof order.items === "string"
                        ? JSON.parse(order.items)
                        : order.items
                    : [];
                if (Array.isArray(parsedItems)) {
                    parsedItems.forEach((item) => allItems.push(item));
                }
            } catch (err) {
                console.error("Failed to parse items for order", order.$id, err);
            }
        });

        const subtotal = allItems.reduce((sum, item: any) => {
            const price = typeof item.price === "number" ? item.price : 0;
            const qty = typeof item.quantity === "number" ? item.quantity : 1;
            return sum + price * qty;
        }, 0);

        const totalAmount = summary.totalAmount || subtotal;

        // Use the first order as the source of contextual fields
        const firstOrder: any = summary.orders[0];

        // Generate a short consolidated order number
        const timestamp = Date.now().toString().slice(-10);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const consolidatedOrderNumber = `ORD-${timestamp}-${random}`;

        const consolidatedOrderData: Omit<Order, "$id" | "$createdAt" | "$updatedAt"> = {
            orderNumber: consolidatedOrderNumber,
            type: firstOrder.type || "dine_in",
            status: "paid",
            tableNumber,
            customerName: firstOrder.customerName || "Walk-in Customer",
            guestCount: firstOrder.guestCount || summary.orders.length,
            waiterName: firstOrder.waiterName || "POS System",
            waiterId: firstOrder.waiterId,
            subtotal,
            taxAmount: 0,
            serviceCharge: 0,
            discountAmount: 0,
            tipAmount: 0,
            totalAmount,
            paymentStatus: "paid",
            orderTime: new Date().toISOString(),
            priority: "normal",
            items: allItems,
            paymentMethods: [
                {
                    method: paymentMethod,
                    amount: totalAmount,
                    reference: paymentReference,
                    settledAt: new Date().toISOString(),
                },
            ],
            specialInstructions: `TAB SETTLEMENT - Table ${tableNumber} (${date}) | Orders: ${orderNumbers.join(
                ", "
            )} | Ref: ${paymentReference}`,
            // Settlement metadata - marks this as a consolidated settlement order
            settlementType: "table_tab_master",
            settledOrderIds: summary.orders.map((o: any) => o.$id),
        };

        const consolidatedOrder = await createOrder(consolidatedOrderData);

        // Now mark each original order as "settled" (not "paid") to avoid double-counting revenue.
        // The consolidated order captures the full payment, so individual orders should be
        // marked as "settled" to exclude them from revenue calculations.
        const updatePromises = summary.orders.map((order: any) => {
            if (order.paymentStatus && order.paymentStatus !== "unpaid") {
                return Promise.resolve(null);
            }

            const existingMethods: any[] = Array.isArray(order.paymentMethods) ? order.paymentMethods : [];
            const updatedMethods = [
                ...existingMethods,
                {
                    method: paymentMethod,
                    amount: order.totalAmount,
                    reference: paymentReference,
                    settledAt: new Date().toISOString(),
                },
            ];

            return updateOrderDocumentSafe(order.$id, {
                // Mark as "settled" instead of "paid" to exclude from revenue calculations
                // This prevents the double-counting bug where both the consolidated order
                // and the original orders get counted in analytics
                paymentStatus: "settled",
                status: "paid",
                settlementParentOrderId: consolidatedOrder.$id,
                paymentMethods: updatedMethods,
            });
        });

        const results = await Promise.allSettled(updatePromises);
        const updatedCount = results.filter(
            (r) => r.status === "fulfilled" && r.value !== null
        ).length;

        return {
            success: true as const,
            message: "Table tab settled and consolidated order created",
            consolidatedOrderId: consolidatedOrder.$id as string,
            updatedCount,
            totalAmount,
            tableNumber,
            date,
            paymentReference,
            paymentMethod,
        };
};

/**
 * Return all open (unpaid, non-deleted) orders for the business, sorted oldest-first.
 * Optionally scoped to a single waiter with opts.waiterId.
 */
export const getOpenOrdersSummary = async (
    opts?: { waiterId?: string }
): Promise<OpenOrdersSummary> => {
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
        throw new Error("Database configuration is missing");
    }

    const { businessId, userId, role } = await getAuthContext();
    validateBusinessContext(businessId);

    const queries = [
        Query.equal("businessId", businessId),
        Query.equal("paymentStatus", "unpaid"),
        Query.orderAsc("orderTime"),
        Query.limit(POS_ORDER_PAGE_MAX),
    ];
    if (role === "org:member") {
        queries.push(Query.equal("waiterId", userId));
    } else if (opts?.waiterId) {
        queries.push(Query.equal("waiterId", opts.waiterId));
    }

    const response = await databases.listDocuments(DATABASE_ID!, ORDERS_COLLECTION_ID!, queries);

    const now = Date.now();
    const orders: OpenOrder[] = response.documents.map((doc: any) => {
        const ageMinutes = computeOrderAgeMinutes(doc, now);
        let items = doc.items;
        if (typeof items === "string") {
            try { items = JSON.parse(items); } catch { items = []; }
        }
        return { ...doc, items: Array.isArray(items) ? items : [], ageMinutes } as OpenOrder;
    });

    const totalAmount = orders.reduce((s, o) => s + (o.totalAmount ?? 0), 0);
    const subtotal = orders.reduce((s, o) => s + (o.subtotal ?? 0), 0);

    return { orders, totalAmount, subtotal, orderCount: orders.length };
};

/**
 * Fetch the set of PAID orders that were settled together for a given table,
 * calendar date, and Paystack reference. This is used to render a final
 * receipt-style view after a successful "Charge Full Tab" payment.
 */
export const getTableTabReceiptForPayment = async ({
    tableNumber,
    date,
    paymentReference,
}: {
    tableNumber: number;
    date: string;
    paymentReference: string;
}) => {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            throw new Error("Database configuration is missing");
        }

        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const day = new Date(date);
        if (Number.isNaN(day.getTime())) {
            throw new Error(`Invalid date supplied to getTableTabReceiptForPayment: "${date}"`);
        }

        const startOfDay = new Date(day);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(day);
        endOfDay.setHours(23, 59, 59, 999);

        // Fetch all PAID orders for the table on that day.
        const result = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.equal("businessId", businessId), // CRITICAL: Multi-tenant isolation
                Query.equal("tableNumber", tableNumber),
                Query.equal("paymentStatus", "paid"),
                Query.greaterThanEqual("orderTime", startOfDay.toISOString()),
                Query.lessThanEqual("orderTime", endOfDay.toISOString()),
                Query.orderAsc("orderTime"),
            ]
        );

        const documents = result.documents as any[];

        // Narrow down to the specific settlement using the payment reference
        const matched = documents.filter((order: any) => {
            const methods = Array.isArray(order.paymentMethods) ? order.paymentMethods : [];
            return methods.some((m: any) => m?.reference === paymentReference);
        });

        // If we somehow don't find any matching orders, fall back to all paid orders
        const ordersSource = matched.length > 0 ? matched : documents;

        const orders = ordersSource.map((order: any) => ({
            ...parseStringify(order),
            items: order.items ? JSON.parse(order.items) : [],
        }));

        const totalAmount = orders.reduce((sum: number, order: any) => {
            const value = typeof order.totalAmount === "number" ? order.totalAmount : 0;
            return sum + value;
        }, 0);

        const subtotal = orders.reduce((sum: number, order: any) => {
            const value = typeof order.subtotal === "number" ? order.subtotal : 0;
            return sum + value;
        }, 0);

        return {
            tableNumber,
            date,
            orderCount: orders.length,
            subtotal,
            totalAmount,
            paymentReference,
            orders,
        };
    } catch (error) {
        console.error("Error fetching table tab receipt for payment:", error);
        return {
            tableNumber,
            date,
            orderCount: 0,
            subtotal: 0,
            totalAmount: 0,
            paymentReference,
            orders: [] as any[],
        };
    }
};

/**
 * Server-side delta for kitchen printing (compares cart to [KITCHEN_PRINTED] snapshot in specialInstructions).
 */
export const computeKitchenDeltaForOrder = async (
    orderId: string,
    proposedItems: { $id: string; quantity: number; name: string }[]
) => {
    const order = await getOrder(orderId);
    if (!order) {
        return {
            deltaItems: [] as { name: string; quantity: number }[],
            newSnapshotLines: [] as KitchenLine[],
        };
    }
    const snap = parseLastKitchenSnapshot(String(order.specialInstructions || ""));
    const { deltaItems, newSnapshot } = computeKitchenDelta(snap, proposedItems);
    return { deltaItems, newSnapshotLines: newSnapshot };
};

/**
 * Detailed print diff for update-order flow:
 * - kitchen deltas (quantity up / new lines) for Update Orders tab
 * - anomalies (quantity down / removed lines) for Anomaly tab
 */
export const computeKitchenPrintChangesForOrder = async (
    orderId: string,
    proposedItems: { $id: string; quantity: number; name: string }[]
) => {
    const order = await getOrder(orderId);
    if (!order) {
        return {
            deltaItems: [] as { name: string; quantity: number }[],
            anomalyItems: [] as KitchenAnomalyItem[],
            newSnapshotLines: [] as KitchenLine[],
        };
    }
    const snapMeta = parseLastKitchenSnapshotMeta(String(order.specialInstructions || ""));
    const { deltaItems, anomalyItems, newSnapshot } = computeKitchenPrintChanges(
        snapMeta.lines,
        proposedItems
    );
    const baseSnapshotVersion = snapMeta.snapshotVersion || KITCHEN_SNAPSHOT_MIN_VERSION;
    return {
        deltaItems,
        anomalyItems,
        newSnapshotLines: newSnapshot,
        baseSnapshotVersion,
        nextSnapshotVersion: baseSnapshotVersion + 1,
    };
};

export const getOrder = async (orderId: string): Promise<Order | null> => {
    try {
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);
        const order = await databases.getDocument(
            DATABASE_ID!,
            ORDERS_COLLECTION_ID!,
            orderId
        );
        if (String((order as any).businessId || "") !== businessId) {
            return null;
        }

        return {
            ...parseStringify(order),
            items: (() => {
                try {
                    return (order as any).items ? JSON.parse((order as any).items) : [];
                } catch {
                    return [];
                }
            })(),
        } as Order;
    } catch (error) {
        console.error("Error fetching order:", error);
        return null;
    }
};

export const updateOrder = async (orderId: string, data: Partial<Order>) => {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            throw new Error("Database configuration is missing");
        }
        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const updateData: Record<string, unknown> = { ...data };
        if (data.items) {
            (updateData as any).items = compressOrderItems(data.items as any[]);
        }

        const kitchenSnapshotLines = (updateData as any).kitchenSnapshotLines as KitchenLine[] | undefined;
        const kitchenSnapshotVersion = (updateData as any).kitchenSnapshotVersion as number | undefined;
        const kitchenBaseSnapshotVersion = (updateData as any).kitchenBaseSnapshotVersion as number | undefined;
        delete (updateData as any).kitchenSnapshotLines;
        delete (updateData as any).kitchenSnapshotVersion;
        delete (updateData as any).kitchenBaseSnapshotVersion;

        // Never send TypeScript-only / unsettled helper fields Appwrite does not know.
        delete updateData.paymentMethods;
        delete updateData.settlementType;
        delete updateData.settlementParentOrderId;
        delete updateData.settledOrderIds;

        Object.keys(updateData).forEach((key) => {
            if (updateData[key] === undefined) {
                delete updateData[key];
            }
        });

        if (kitchenSnapshotLines !== undefined) {
            const existing = await databases.getDocument(DATABASE_ID, ORDERS_COLLECTION_ID, orderId);
            if (String((existing as any).businessId || "") !== businessId) {
                throw new Error("Order not found or access denied");
            }
            if (kitchenBaseSnapshotVersion !== undefined) {
                const currentSnapshot = parseLastKitchenSnapshotMeta(String((existing as any).specialInstructions || ""));
                if (currentSnapshot.snapshotVersion !== kitchenBaseSnapshotVersion) {
                    throw new Error(
                        "Order changed on another terminal. Please reopen the order and apply changes again."
                    );
                }
            }
            const prevSi = String((existing as any).specialInstructions || "");
            (updateData as any).specialInstructions = mergeKitchenSnapshotIntoSpecialInstructions(
                prevSi,
                kitchenSnapshotLines,
                kitchenSnapshotVersion ?? KITCHEN_SNAPSHOT_MIN_VERSION
            );
        } else {
            const existing = await databases.getDocument(DATABASE_ID, ORDERS_COLLECTION_ID, orderId);
            if (String((existing as any).businessId || "") !== businessId) {
                throw new Error("Order not found or access denied");
            }
        }

        const result = await updateOrderDocumentSafe(orderId, updateData as any);

        return parseStringify(result);
    } catch (error) {
        console.error("Error updating order:", error);
        throw new Error(
            error instanceof Error ? error.message : "Failed to update order"
        );
    }
};

const TABLES_COLLECTION_ID = "tables";

export const softDeleteOrder = async (
    orderId: string,
    deletionReason: string = "Order deleted by staff",
    voidCategory?: VoidOrderCategory
) => {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID || !DELETED_ORDERS_LOG_COLLECTION_ID) {
            throw new Error("Database configuration is missing");
        }

        await requireOrgAdmin();

        const { businessId, userId } = await getAuthContext();
        validateBusinessContext(businessId);

        // Get the order before marking as deleted
        const existingOrder = await databases.getDocument(DATABASE_ID, ORDERS_COLLECTION_ID, orderId);
        const parsedOrder: any = parseStringify(existingOrder);

        // Verify the order belongs to the current business
        if (parsedOrder.businessId !== businessId) {
            throw new Error("Order not found or access denied");
        }

        const now = new Date().toISOString();

        const cat = voidCategory ?? "OTHER";
        const taggedReason = `[${cat}] ${deletionReason}`;

        // Mark order as soft deleted (category embedded for Appwrite schemas without a dedicated attribute)
        await databases.updateDocument(DATABASE_ID, ORDERS_COLLECTION_ID, orderId, {
            isDeleted: true,
            deletedAt: now,
            deletedBy: userId,
            deletionReason: taggedReason,
        });

        // Create audit log entry
        await databases.createDocument(DATABASE_ID, DELETED_ORDERS_LOG_COLLECTION_ID, 'unique()', {
            orderId: orderId,
            orderNumber: parsedOrder.orderNumber,
            deletedBy: userId,
            deletedAt: now,
            deletionReason: taggedReason,
            businessId: businessId,
            orderSnapshot: parsedOrder, // Complete order snapshot
        });

        // Clear table association if order was active
        if (parsedOrder.tableNumber) {
            const tableResult = await databases.listDocuments(DATABASE_ID, TABLES_COLLECTION_ID, [
                Query.equal("businessId", businessId),
                Query.equal("number", parsedOrder.tableNumber),
            ]);

            if (tableResult.documents.length > 0) {
                const table = tableResult.documents[0] as any;
                if (table.currentOrderId === orderId) {
                    await databases.updateDocument(DATABASE_ID, TABLES_COLLECTION_ID, table.$id, {
                        currentOrderId: null,
                        guestCount: 0,
                        waiterId: null,
                        waiterName: null,
                        occupiedAt: null,
                    });
                }
            }
        }

        return true;
    } catch (error) {
        console.error("Error soft deleting order:", error);
        throw new Error("Failed to delete order");
    }
};

/** Validates payload with {@link VoidOrderSchema}, requires org:admin, soft-deletes the order. */
export async function voidOrderValidated(input: unknown) {
    const parsed = VoidOrderSchema.safeParse(input);
    if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new Error(first?.message ?? "Invalid void order request");
    }
    await softDeleteOrder(parsed.data.orderId, parsed.data.reason, parsed.data.voidCategory);
    return { success: true as const };
}

// Legacy hard delete function - kept for backward compatibility but should not be used
export const deleteOrder = async (orderId: string) => {
    console.warn("deleteOrder called - this performs hard delete. Use softDeleteOrder instead for audit trail.");
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            throw new Error("Database configuration is missing");
        }

        const existingOrder = await databases.getDocument(DATABASE_ID, ORDERS_COLLECTION_ID, orderId);
        const parsedOrder: any = parseStringify(existingOrder);

        await databases.deleteDocument(DATABASE_ID, ORDERS_COLLECTION_ID, orderId);

        if (parsedOrder.tableNumber) {
            const tableResult = await databases.listDocuments(DATABASE_ID, TABLES_COLLECTION_ID, [
                Query.equal("businessId", parsedOrder.businessId),
                Query.equal("number", parsedOrder.tableNumber),
            ]);

            if (tableResult.documents.length > 0) {
                const table = tableResult.documents[0] as any;
                if (table.currentOrderId === orderId) {
                    await databases.updateDocument(DATABASE_ID, TABLES_COLLECTION_ID, table.$id, {
                        currentOrderId: null,
                        guestCount: 0,
                        waiterId: null,
                        waiterName: null,
                        occupiedAt: null,
                    });
                }
            }
        }

        return true;
    } catch (error) {
        console.error("Error deleting order:", error);
        throw new Error("Failed to delete order");
    }
};

export const getRecentOrders = async () => {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            return [];
        }

        const { businessId } = await getAuthContext();
        validateBusinessContext(businessId);

        const result = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.equal("businessId", businessId), // CRITICAL: Multi-tenant isolation
                Query.orderDesc("$createdAt"),
                Query.limit(10)
            ]
        );

        return parseStringify(result.documents);
    } catch (error) {
        console.error("Error fetching recent orders:", error);
        return [];
    }
};
