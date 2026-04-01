"use server";

import { databases, DATABASE_ID, MENU_ITEMS_COLLECTION_ID, ORDERS_COLLECTION_ID, CATEGORIES_COLLECTION_ID } from "@/lib/appwrite.config";
import { ID, Query } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { Order } from "@/types/pos.types";

export const getCategories = async () => {
    try {
        if (!DATABASE_ID || !CATEGORIES_COLLECTION_ID) {
            return [];
        }

        const result = await databases.listDocuments(
            DATABASE_ID,
            CATEGORIES_COLLECTION_ID,
            [
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

        const result = await databases.listDocuments(
            DATABASE_ID,
            MENU_ITEMS_COLLECTION_ID,
            [
                Query.equal("isActive", true),
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

export const createOrder = async (order: Omit<Order, "$id" | "$createdAt" | "$updatedAt">) => {
    try {
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

        const orderData = {
            ...baseOrder,
            items: JSON.stringify(order.items), // Store items as stringified JSON
            // Note: paymentMethod and paymentReference removed - not in schema
            // These can be stored in orderNumber or specialInstructions if needed
        };

        const newOrder = await databases.createDocument(
            DATABASE_ID!,
            ORDERS_COLLECTION_ID!,
            ID.unique(),
            orderData
        );

        // Optimize popularity updates with batch processing
        // Use Promise.allSettled to prevent one failure from affecting others
        try {
            const items = order.items as any[];
            
            // Batch fetch all items first (O(n) instead of O(n) sequential)
            const itemIds = items.map(item => item.$id);
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
                const orderedItem = items[index];
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

        return parseStringify(newOrder);
    } catch (error) {
        console.error("Error creating order:", error);
        throw new Error("Failed to create order");
    }
};

export const getOrders = async () => {
    try {
        const result = await databases.listDocuments(
            DATABASE_ID!,
            ORDERS_COLLECTION_ID!,
            [
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

        const queries: any[] = [
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

            return databases.updateDocument(
                DATABASE_ID!,
                ORDERS_COLLECTION_ID!,
                order.$id,
                {
                    paymentStatus: "paid",
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
                // Link to the consolidated order for audit trail
                settlementParentOrderId: consolidatedOrder.$id,
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
            (updateData as any).items = JSON.stringify(data.items);
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

export const getRecentOrders = async () => {
    try {
        if (!DATABASE_ID || !ORDERS_COLLECTION_ID) {
            return [];
        }

        const result = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
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
