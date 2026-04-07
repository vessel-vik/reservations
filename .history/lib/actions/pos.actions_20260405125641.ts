"use server";

import { databases, DATABASE_ID, MENU_ITEMS_COLLECTION_ID, ORDERS_COLLECTION_ID, CATEGORIES_COLLECTION_ID } from "@/lib/appwrite.config";
import { ID, Query } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { Order } from "@/types/pos.types";
import { decrementItemStocks } from '@/lib/actions/menu.actions';
import { getAuthContext, validateBusinessContext } from '@/lib/auth.utils';

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
                Query.equal("isAvailable", true),
                Query.limit(100), // Get enough items
                Query.orderDesc("popularity")
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

const updateOrderDocumentSafe = async (orderId: string, updateData: Record<string, any>) => {
    try {
        return await databases.updateDocument(
            DATABASE_ID!,
            ORDERS_COLLECTION_ID!,
            orderId,
            updateData
        );
    } catch (error) {
        console.warn(`Safe update failed for order ${orderId}. Retrying without paymentMethods.`, error);
        if (Object.prototype.hasOwnProperty.call(updateData, "paymentMethods")) {
            const { paymentMethods, ...fallbackData } = updateData;
            return await databases.updateDocument(
                DATABASE_ID!,
                ORDERS_COLLECTION_ID!,
                orderId,
                fallbackData
            );
        }
        throw error;
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

        if (paymentMethods) {
            orderData.paymentMethods = paymentMethods;
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
                Query.limit(100)
            ]
        );

        return parseStringify(result.documents);
    } catch (error) {
        console.error("Error fetching orders:", error);
        return [];
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
            Query.orderDesc("$createdAt")
        ];

        if (onlyUnpaid) {
            // Use paymentStatus to identify unpaid orders; adjust as needed based on schema
            queries.push(Query.equal("paymentStatus", "unpaid"));
        }

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

export const settleSelectedOrders = async ({
    orderIds,
    paymentMethod = "cash",
    paymentReference,
}: {
    orderIds: string[];
    paymentMethod?: string;
    paymentReference?: string;
}) => {
    if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
        throw new Error("Database configuration is missing");
    }

    const { businessId } = await getAuthContext();
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

    const fetchedOrders = await Promise.all(
        orderIds.map(async (orderId) => {
            try {
                const order = await databases.getDocument(DATABASE_ID!, ORDERS_COLLECTION_ID!, orderId);
                return parseStringify(order) as any;
            } catch (error) {
                console.warn(`Order ${orderId} could not be fetched during settlement:`, error);
                return null;
            }
        })
    );

    const validOrders = fetchedOrders.filter((order): order is any => order !== null);
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
    const orderNumbers = unpaidOrders.map((order) => order.orderNumber || order.$id);
    const paymentRef = paymentReference || `manual-${paymentMethod}-${Date.now()}`;

    if (unpaidOrders.length === 1) {
        const order = unpaidOrders[0];
        const existingMethods: any[] = Array.isArray(order.paymentMethods) ? order.paymentMethods : [];
        const updatedMethods = [
            ...existingMethods,
            {
                method: paymentMethod,
                amount: order.totalAmount,
                reference: paymentRef,
                settledAt: new Date().toISOString(),
            },
        ];

        await updateOrderDocumentSafe(order.$id, {
            paymentStatus: "paid",
            status: "paid",
            paymentMethods: updatedMethods,
        });

        return {
            success: true as const,
            message: "Order settled successfully",
            updatedCount: 1,
            totalAmount,
            consolidatedOrderId: order.$id,
            paymentReference: paymentRef,
            paymentMethod,
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
        specialInstructions: `GROUP SETTLEMENT - Table ${firstOrder.tableNumber} | Orders: ${orderNumbers.join(", ")} | Ref: ${paymentRef}`,
        settlementType: "table_tab_master",
        settledOrderIds: unpaidOrders.map((o: any) => o.$id),
        paymentMethods: [
            {
                method: paymentMethod,
                amount: totalAmount,
                reference: paymentRef,
                settledAt: new Date().toISOString(),
            },
        ],
    };

    const consolidatedOrder = await createOrder(consolidatedOrderData);

    const updatePromises = unpaidOrders.map((order) => {
        const existingMethods: any[] = Array.isArray(order.paymentMethods) ? order.paymentMethods : [];
        const updatedMethods = [
            ...existingMethods,
            {
                method: paymentMethod,
                amount: order.totalAmount,
                reference: paymentRef,
                settledAt: new Date().toISOString(),
            },
        ];
        return databases.updateDocument(DATABASE_ID!, ORDERS_COLLECTION_ID!, order.$id, {
            paymentStatus: "settled",
            status: "paid",
            settlementParentOrderId: consolidatedOrder.$id,
            paymentMethods: updatedMethods,
        });
    });

    const results = await Promise.allSettled(updatePromises);
    const updatedCount = results.filter((r) => r.status === "fulfilled" && r.value !== null).length;

    return {
        success: true as const,
        message: "Selected orders settled successfully",
        updatedCount,
        totalAmount,
        consolidatedOrderId: consolidatedOrder.$id as string,
        paymentReference: paymentRef,
        paymentMethod,
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

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    // CHECK-THEN-SET PATTERN: Prevent race conditions during settlement
    // Verify no other settlement is in progress for this table
    const existingSettlementCheck = await databases.listDocuments(
        DATABASE_ID!,
        ORDERS_COLLECTION_ID!,
        [
            Query.equal("businessId", businessId), // Multi-tenant isolation
            Query.equal("tableNumber", tableNumber),
            Query.equal("paymentStatus", "settling"), // Check for in-progress settlements
            Query.greaterThanEqual("orderTime", new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Last 5 minutes
        ]
    );

    if (existingSettlementCheck.documents.length > 0) {
        throw new Error(`Table ${tableNumber} is currently being settled by another terminal. Please wait and try again.`);
    }

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

    // SET PHASE: Mark orders as "settling" to prevent concurrent settlements
    const settlingPromises = summary.orders.map((order: any) =>
        databases.updateDocument(
            DATABASE_ID!,
            ORDERS_COLLECTION_ID!,
            order.$id,
            {
                paymentStatus: "settling", // Temporary status to block concurrent access
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

    try {
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

            return databases.updateDocument(
                DATABASE_ID!,
                ORDERS_COLLECTION_ID!,
                order.$id,
                {
                    // Mark as "settled" instead of "paid" to exclude from revenue calculations
                    // This prevents the double-counting bug where both the consolidated order
                    // and the original orders get counted in analytics
                    paymentStatus: "settled",
                    status: "paid",
                    settlementParentOrderId: consolidatedOrder.$id,
                    paymentMethods: updatedMethods,
                }
            );
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
    } catch (error) {
        // CLEANUP: Reset orders from "settling" status on failure
        console.error("Settlement failed, cleaning up settling status:", error);
        const cleanupPromises = summary.orders.map((order: any) =>
            databases.updateDocument(
                DATABASE_ID!,
                ORDERS_COLLECTION_ID!,
                order.$id,
                {
                    paymentStatus: "unpaid", // Reset to original status
                    status: "active"
                }
            ).catch(cleanupErr => console.error(`Failed to cleanup order ${order.$id}:`, cleanupErr))
        );
        await Promise.allSettled(cleanupPromises);
        throw error;
    }
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

export const getOrder = async (orderId: string): Promise<Order | null> => {
    try {
        // Search by orderNumber property since that's what we might be using, 
        // OR search by document ID. The plan implied fetching by ID.
        // Let's assume orderId passed to this function is the Document ID for now to be safe,
        // or we can try to look up by orderNumber attribute if that's what the URL param is.
        // The ReceiptPage uses params.orderId. 
        
        const order = await databases.getDocument(
            DATABASE_ID!,
            ORDERS_COLLECTION_ID!,
            orderId
        );

        return {
            ...parseStringify(order),
            items: (order as any).items ? JSON.parse((order as any).items) : [],
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

        const updateData = { ...data };
        if (data.items) {
            (updateData as any).items = compressOrderItems(data.items);
        }

        const result = await databases.updateDocument(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            orderId,
            updateData
        );

        return parseStringify(result);
    } catch (error) {
        console.error("Error updating order:", error);
        throw new Error("Failed to update order");
    }
};

const TABLES_COLLECTION_ID = "tables";

export const deleteOrder = async (orderId: string) => {
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
