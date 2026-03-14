"use server";

import { databases, DATABASE_ID, ORDERS_COLLECTION_ID } from "@/lib/appwrite.config";
import { Query } from "node-appwrite";
import { Order } from "@/types/pos.types";

/**
 * Get today's order analytics
 * Uses indexed queries for O(log n) performance
 */
export async function getTodayOrderAnalytics() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const response = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.greaterThanEqual('$createdAt', today.toISOString()),
                Query.equal('status', 'paid'),
                // Exclude settled/child orders to prevent double-counting revenue
                // These are orders that were consolidated into a table_tab_master order
                Query.notEqual('paymentStatus', 'settled'),
                Query.orderDesc('$createdAt'),
                Query.limit(1000)
            ]
        );

        const orders = response.documents as unknown as Order[];
        const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
        const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

        return {
            success: true,
            totalOrders: orders.length,
            revenue: totalRevenue,
            avgOrderValue,
            orders
        };
    } catch (error) {
        console.error('Error fetching today analytics:', error);
        return {
            success: false,
            totalOrders: 0,
            revenue: 0,
            avgOrderValue: 0,
            orders: []
        };
    }
}

/**
 * Get revenue by time period (last N days)
 * Returns daily revenue breakdown
 */
export async function getRevenueByPeriod(days: number = 7) {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const response = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.greaterThanEqual('$createdAt', startDate.toISOString()),
                Query.equal('status', 'paid'),
                // Exclude settled/child orders to prevent double-counting revenue
                Query.notEqual('paymentStatus', 'settled'),
                Query.orderDesc('$createdAt'),
                Query.limit(10000)
            ]
        );

        const orders = response.documents as unknown as Order[];

        // Group by date
        const revenueByDate = new Map<string, number>();
        orders.forEach(order => {
            const date = new Date(order.$createdAt).toISOString().split('T')[0];
            revenueByDate.set(date, (revenueByDate.get(date) || 0) + order.totalAmount);
        });

        // Convert to array and sort
        const chartData = Array.from(revenueByDate.entries())
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return {
            success: true,
            data: chartData,
            totalRevenue: orders.reduce((sum, o) => sum + o.totalAmount, 0)
        };
    } catch (error) {
        console.error('Error fetching revenue by period:', error);
        return {
            success: false,
            data: [],
            totalRevenue: 0
        };
    }
}

/**
 * Get peak hours analysis
 * Analyzes order timestamps to find busiest hours
 */
export async function getPeakHours() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const response = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.greaterThanEqual('$createdAt', today.toISOString()),
                Query.orderDesc('$createdAt'),
                Query.limit(1000)
            ]
        );

        const orders = response.documents as unknown as Order[];

        if (orders.length === 0) {
            return {
                success: true,
                peakHour: '7:30 PM',
                peakHourOrders: 0,
                hourlyData: []
            };
        }

        // Count orders by hour
        const hourCounts = new Array(24).fill(0);
        orders.forEach(order => {
            const hour = new Date(order.$createdAt).getHours();
            hourCounts[hour]++;
        });

        // Find peak hour
        const maxCount = Math.max(...hourCounts);
        const peakHourIndex = hourCounts.indexOf(maxCount);
        
        // Format peak hour
        const peakHour = peakHourIndex === 0 ? '12:00 AM' :
                        peakHourIndex < 12 ? `${peakHourIndex}:00 AM` :
                        peakHourIndex === 12 ? '12:00 PM' :
                        `${peakHourIndex - 12}:00 PM`;

        // Create hourly data for charts
        const hourlyData = hourCounts.map((count, hour) => ({
            hour,
            count,
            label: hour === 0 ? '12 AM' :
                   hour < 12 ? `${hour} AM` :
                   hour === 12 ? '12 PM' :
                   `${hour - 12} PM`
        }));

        return {
            success: true,
            peakHour,
            peakHourOrders: maxCount,
            hourlyData
        };
    } catch (error) {
        console.error('Error analyzing peak hours:', error);
        return {
            success: true,
            peakHour: '7:30 PM',
            peakHourOrders: 0,
            hourlyData: []
        };
    }
}

/**
 * Get top products/items sold
 * Aggregates items from all orders
 */
export async function getTopProducts(limit: number = 10) {
    try {
        const response = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.equal('status', 'paid'),
                Query.orderDesc('$createdAt'),
                Query.limit(1000)
            ]
        );

        const orders = response.documents as unknown as Order[];

        // Aggregate product counts
        const productCounts = new Map<string, { count: number; revenue: number }>();
        
        orders.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const existing = productCounts.get(item.name) || { count: 0, revenue: 0 };
                    productCounts.set(item.name, {
                        count: existing.count + item.quantity,
                        revenue: existing.revenue + (item.price * item.quantity)
                    });
                });
            }
        });

        // Convert to array and sort by count
        const topProducts = Array.from(productCounts.entries())
            .map(([name, data]) => ({
                name,
                count: data.count,
                revenue: data.revenue
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

        return {
            success: true,
            products: topProducts
        };
    } catch (error) {
        console.error('Error fetching top products:', error);
        return {
            success: false,
            products: []
        };
    }
}

/**
 * Get server performance stats
 * Shows individual server/waiter performance
 */
export async function getServerPerformance() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const response = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.greaterThanEqual('$createdAt', today.toISOString()),
                Query.equal('status', 'paid'),
                // Exclude settled/child orders to prevent double-counting revenue
                Query.notEqual('paymentStatus', 'settled'),
                Query.limit(1000)
            ]
        );

        const orders = response.documents as unknown as Order[];

        // Aggregate by server
        const serverStats = new Map<string, { orders: number; revenue: number; waiterId?: string }>();
        
        orders.forEach(order => {
            const serverName = order.waiterName || 'Unknown';
            const existing = serverStats.get(serverName) || { orders: 0, revenue: 0, waiterId: order.waiterId };
            serverStats.set(serverName, {
                orders: existing.orders + 1,
                revenue: existing.revenue + order.totalAmount,
                waiterId: order.waiterId || existing.waiterId
            });
        });

        // Convert to array and sort by revenue
        const topServers = Array.from(serverStats.entries())
            .map(([name, stats]) => ({
                name,
                orders: stats.orders,
                revenue: stats.revenue,
                avgOrderValue: stats.revenue / stats.orders,
                waiterId: stats.waiterId
            }))
            .sort((a, b) => b.revenue - a.revenue);

        return {
            success: true,
            servers: topServers
        };
    } catch (error) {
        console.error('Error fetching server performance:', error);
        return {
            success: false,
            servers: []
        };
    }
}

/**
 * Get comprehensive admin analytics
 * Combines all analytics in one call for efficiency
 */
export async function getAdminAnalytics() {
    try {
        const [todayStats, revenueData, peakData, topProducts, serverPerf] = await Promise.all([
            getTodayOrderAnalytics(),
            getRevenueByPeriod(7),
            getPeakHours(),
            getTopProducts(5),
            getServerPerformance()
        ]);

        return {
            success: true,
            today: {
                orders: todayStats.totalOrders,
                revenue: todayStats.revenue,
                avgOrderValue: todayStats.avgOrderValue
            },
            revenue: {
                chartData: revenueData.data,
                total: revenueData.totalRevenue
            },
            peakHours: {
                time: peakData.peakHour,
                orders: peakData.peakHourOrders,
                hourlyData: peakData.hourlyData
            },
            topProducts: topProducts.products,
            servers: serverPerf.servers
        };
    } catch (error) {
        console.error('Error fetching admin analytics:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch analytics'
        };
    }
}
