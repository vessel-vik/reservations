"use server";

import { Client, Databases, Query } from "node-appwrite";
import { DATABASE_ID, ORDERS_COLLECTION_ID, APPOINTMENT_COLLECTION_ID } from "@/lib/appwrite.config";
import { Order } from "@/types/pos.types";
import { Reservation } from "@/types/appwrite.types";

// Initialize Appwrite client for server-side operations
const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_ENDPOINT!)
    .setProject(process.env.PROJECT_ID!)
    .setKey(process.env.API_KEY!);

const databases = new Databases(client);

/**
 * Get orders for a specific server/waiter
 * Uses indexed query for O(log n) performance
 */
export async function getServerOrders(userId: string, limit: number = 100) {
    try {
        const response = await databases.listDocuments(
            DATABASE_ID,
            ORDERS_COLLECTION_ID,
            [
                Query.equal('waiterId', userId),
                Query.orderDesc('$createdAt'),
                Query.limit(limit)
            ]
        );

        return {
            success: true,
            orders: response.documents as unknown as Order[],
            total: response.total
        };
    } catch (error) {
        console.error('Error fetching server orders:', error);
        return {
            success: false,
            orders: [],
            total: 0,
            error: error instanceof Error ? error.message : 'Failed to fetch orders'
        };
    }
}

/**
 * Get server statistics
 */
export async function getServerStats(userId: string) {
    try {
        const { orders } = await getServerOrders(userId, 1000);

        // Exclude:
        // 1. Consolidated table-tab master orders (settlementType === 'table_tab_master')
        //    - These are used purely for receipt rendering
        // 2. Child orders that were settled (paymentStatus === 'settled')
        //    - These have been consolidated into a master order, so their amount
        //      is already included in the master order's totalAmount
        // This prevents the double-counting bug where both the consolidated order
        // and the original orders get counted in revenue calculations.
        const effectiveOrders = orders.filter((order: any) => {
            // Exclude master settlement orders
            if (order.settlementType === 'table_tab_master') {
                return false;
            }
            // Exclude child orders that have been settled
            if (order.paymentStatus === 'settled') {
                return false;
            }
            return true;
        });

        // Calculate stats
        const totalOrders = effectiveOrders.length;
        const totalRevenue = effectiveOrders.reduce((sum, order) => sum + order.totalAmount, 0);
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        // Today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOrders = effectiveOrders.filter(order => {
            const orderDate = new Date(order.$createdAt!);
            return orderDate >= today;
        });
        const todayRevenue = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0);

        // Last 7 days revenue
        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 7);
        const revenueByDay = new Map<string, number>();

        effectiveOrders.forEach(order => {
            const orderDate = new Date(order.$createdAt!);
            if (orderDate >= last7Days) {
                const dateKey = orderDate.toISOString().split('T')[0];
                revenueByDay.set(dateKey, (revenueByDay.get(dateKey) || 0) + order.totalAmount);
            }
        });

        const chartData = Array.from(revenueByDay.entries())
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return {
            success: true,
            stats: {
                totalOrders,
                totalRevenue,
                averageOrderValue,
                todayOrders: todayOrders.length,
                todayRevenue,
                chartData
            }
        };
    } catch (error) {
        console.error('Error calculating server stats:', error);
        return {
            success: false,
            stats: null,
            error: error instanceof Error ? error.message : 'Failed to calculate stats'
        };
    }
}

/**
 * Get reservation statistics for dashboard
 */
export async function getReservationStats(userId?: string) {
    try {
        const query = userId ? [Query.equal('userId', userId)] : [];

        const response = await databases.listDocuments(
            DATABASE_ID,
            APPOINTMENT_COLLECTION_ID,
            [
                ...query,
                Query.orderDesc('$createdAt'),
                Query.limit(1000)
            ]
        );

        const reservations = response.documents as unknown as Reservation[];

        // Calculate comprehensive stats
        const totalReservations = reservations.length;
        const confirmedReservations = reservations.filter(r => r.status === 'confirmed').length;
        const pendingReservations = reservations.filter(r => r.status === 'pending').length;
        const cancelledReservations = reservations.filter(r => r.status === 'cancelled').length;

        // Today's reservations
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayReservations = reservations.filter(reservation => {
            const reservationDate = new Date(reservation.schedule);
            return reservationDate >= today && reservationDate < tomorrow;
        });

        // Upcoming reservations (next 7 days)
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);

        const upcomingReservations = reservations.filter(reservation => {
            const reservationDate = new Date(reservation.schedule);
            return reservationDate >= new Date() && reservationDate <= nextWeek && reservation.status === 'confirmed';
        });

        // Party size analytics
        const totalGuests = reservations
            .filter(r => r.status === 'confirmed')
            .reduce((sum, r) => sum + r.partySize, 0);

        const averagePartySize = confirmedReservations > 0 ? totalGuests / confirmedReservations : 0;

        // Revenue from reservations (if linked to orders)
        const reservationRevenue = reservations
            .filter(r => r.status === 'confirmed')
            .reduce((sum, r) => sum + (r.partySize * 25), 0); // Estimated $25 per person

        // Hourly distribution for today
        const hourlyDistribution = new Map<number, number>();
        todayReservations.forEach(reservation => {
            const hour = new Date(reservation.schedule).getHours();
            hourlyDistribution.set(hour, (hourlyDistribution.get(hour) || 0) + 1);
        });

        const hourlyData = Array.from(hourlyDistribution.entries())
            .map(([hour, count]) => ({ hour, reservations: count }))
            .sort((a, b) => a.hour - b.hour);

        // Status distribution
        const statusData = [
            { status: 'confirmed', count: confirmedReservations, percentage: totalReservations > 0 ? (confirmedReservations / totalReservations) * 100 : 0 },
            { status: 'pending', count: pendingReservations, percentage: totalReservations > 0 ? (pendingReservations / totalReservations) * 100 : 0 },
            { status: 'cancelled', count: cancelledReservations, percentage: totalReservations > 0 ? (cancelledReservations / totalReservations) * 100 : 0 }
        ];

        return {
            success: true,
            stats: {
                totalReservations,
                confirmedReservations,
                pendingReservations,
                cancelledReservations,
                todayReservations: todayReservations.length,
                upcomingReservations: upcomingReservations.length,
                totalGuests,
                averagePartySize: Math.round(averagePartySize * 10) / 10,
                estimatedRevenue: reservationRevenue,
                hourlyData,
                statusData,
                occupancyRate: totalReservations > 0 ? (confirmedReservations / totalReservations) * 100 : 0
            }
        };
    } catch (error) {
        console.error('Error fetching reservation stats:', error);
        return {
            success: false,
            stats: null,
            error: error instanceof Error ? error.message : 'Failed to fetch reservation stats'
        };
    }
}

/**
 * Get upcoming reservations with real-time data
 */
export async function getUpcomingReservations(limit: number = 20, userId?: string) {
    try {
        const query = [
            Query.greaterThanEqual('schedule', new Date().toISOString()),
            Query.equal('status', 'confirmed'),
            Query.orderAsc('schedule'),
            Query.limit(limit)
        ];

        if (userId) {
            query.push(Query.equal('userId', userId));
        }

        const response = await databases.listDocuments(
            DATABASE_ID,
            APPOINTMENT_COLLECTION_ID,
            query
        );

        const reservations = response.documents as unknown as Reservation[];

        // Enrich with additional data
        const enrichedReservations = reservations.map(reservation => ({
            ...reservation,
            timeUntil: Math.max(0, new Date(reservation.schedule).getTime() - Date.now()),
            isToday: new Date(reservation.schedule).toDateString() === new Date().toDateString(),
            formattedTime: new Date(reservation.schedule).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            }),
            formattedDate: new Date(reservation.schedule).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            })
        }));

        return {
            success: true,
            reservations: enrichedReservations,
            total: response.total
        };
    } catch (error) {
        console.error('Error fetching upcoming reservations:', error);
        return {
            success: false,
            reservations: [],
            total: 0,
            error: error instanceof Error ? error.message : 'Failed to fetch upcoming reservations'
        };
    }
}

/**
 * Get reservation analytics data for charts and trends
 */
export async function getReservationAnalytics(days: number = 30, userId?: string) {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const query = [
            Query.greaterThanEqual('$createdAt', startDate.toISOString()),
            Query.orderDesc('$createdAt'),
            Query.limit(1000)
        ];

        if (userId) {
            query.push(Query.equal('userId', userId));
        }

        const response = await databases.listDocuments(
            DATABASE_ID,
            APPOINTMENT_COLLECTION_ID,
            query
        );

        const reservations = response.documents as unknown as Reservation[];

        // Daily reservation trends
        const dailyData = new Map<string, { total: number, confirmed: number, cancelled: number }>();

        reservations.forEach(reservation => {
            const date = new Date(reservation.$createdAt!).toISOString().split('T')[0];
            const current = dailyData.get(date) || { total: 0, confirmed: 0, cancelled: 0 };

            current.total++;
            if (reservation.status === 'confirmed') current.confirmed++;
            if (reservation.status === 'cancelled') current.cancelled++;

            dailyData.set(date, current);
        });

        const reservationTrends = Array.from(dailyData.entries())
            .map(([date, data]) => ({
                date,
                total: data.total,
                confirmed: data.confirmed,
                cancelled: data.cancelled,
                confirmationRate: data.total > 0 ? (data.confirmed / data.total) * 100 : 0
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Party size distribution
        const partySizeDistribution = new Map<number, number>();
        reservations
            .filter(r => r.status === 'confirmed')
            .forEach(r => {
                partySizeDistribution.set(r.partySize, (partySizeDistribution.get(r.partySize) || 0) + 1);
            });

        const partySizeData = Array.from(partySizeDistribution.entries())
            .map(([size, count]) => ({ partySize: size, reservations: count }))
            .sort((a, b) => a.partySize - b.partySize);

        // Peak hours analysis
        const hourlyBookings = new Map<number, number>();
        reservations
            .filter(r => r.status === 'confirmed')
            .forEach(r => {
                const hour = new Date(r.schedule).getHours();
                hourlyBookings.set(hour, (hourlyBookings.get(hour) || 0) + 1);
            });

        const peakHours = Array.from(hourlyBookings.entries())
            .map(([hour, bookings]) => ({ hour, bookings }))
            .sort((a, b) => b.bookings - a.bookings);

        // Cancellation rate trend
        const weeklyCancellationRate = [];
        for (let i = 0; i < Math.ceil(days / 7); i++) {
            const weekStart = new Date(startDate);
            weekStart.setDate(weekStart.getDate() + (i * 7));

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);

            const weekReservations = reservations.filter(r => {
                const createdAt = new Date(r.$createdAt!);
                return createdAt >= weekStart && createdAt < weekEnd;
            });

            const total = weekReservations.length;
            const cancelled = weekReservations.filter(r => r.status === 'cancelled').length;
            const rate = total > 0 ? (cancelled / total) * 100 : 0;

            weeklyCancellationRate.push({
                week: `Week ${i + 1}`,
                cancellationRate: Math.round(rate * 10) / 10,
                totalReservations: total,
                cancelledReservations: cancelled
            });
        }

        return {
            success: true,
            analytics: {
                reservationTrends,
                partySizeData,
                peakHours: peakHours.slice(0, 5), // Top 5 peak hours
                weeklyCancellationRate,
                summary: {
                    totalReservations: reservations.length,
                    confirmedReservations: reservations.filter(r => r.status === 'confirmed').length,
                    averagePartySize: reservations
                        .filter(r => r.status === 'confirmed')
                        .reduce((sum, r, _, arr) => sum + r.partySize / arr.length, 0),
                    overallCancellationRate: reservations.length > 0 ?
                        (reservations.filter(r => r.status === 'cancelled').length / reservations.length) * 100 : 0
                }
            }
        };
    } catch (error) {
        console.error('Error fetching reservation analytics:', error);
        return {
            success: false,
            analytics: null,
            error: error instanceof Error ? error.message : 'Failed to fetch reservation analytics'
        };
    }
}

/**
 * Get real-time reservation updates (for polling-based real-time updates)
 */
export async function getReservationUpdates(since: Date, userId?: string) {
    try {
        const query = [
            Query.greaterThanEqual('$updatedAt', since.toISOString()),
            Query.orderDesc('$updatedAt'),
            Query.limit(50)
        ];

        if (userId) {
            query.push(Query.equal('userId', userId));
        }

        const response = await databases.listDocuments(
            DATABASE_ID,
            APPOINTMENT_COLLECTION_ID,
            query
        );

        const updatedReservations = response.documents as unknown as Reservation[];

        return {
            success: true,
            updates: updatedReservations.map(reservation => ({
                id: reservation.$id,
                status: reservation.status,
                schedule: reservation.schedule,
                partySize: reservation.partySize,
                updatedAt: reservation.$updatedAt,
                lastUpdated: new Date(reservation.$updatedAt!).getTime()
            })),
            totalUpdates: response.total
        };
    } catch (error) {
        console.error('Error fetching reservation updates:', error);
        return {
            success: false,
            updates: [],
            totalUpdates: 0,
            error: error instanceof Error ? error.message : 'Failed to fetch reservation updates'
        };
    }
}

/**
 * Get recent orders for a server
 */
export async function getRecentServerOrders(userId: string, limit?: number) {
    try {
        console.log(`🔍 Fetching orders for userId: ${userId}`);

        const allOrders: any[] = [];
        let offset = 0;
        const batchSize = 100; // Get orders in batches of 100

        // If a specific limit is requested, use it
        if (limit && limit > 0 && limit <= 100) {
            const response = await databases.listDocuments(
                DATABASE_ID,
                ORDERS_COLLECTION_ID,
                [
                    Query.equal('waiterId', userId),
                    Query.orderDesc('$createdAt'),
                    Query.limit(limit)
                ]
            );
            console.log(`✅ Found ${response.documents.length} orders with limit ${limit}`);
            return {
                success: true,
                orders: response.documents as unknown as Order[]
            };
        }

        // For getting all orders, use pagination
        let totalFetched = 0;
        while (true) {
            const response = await databases.listDocuments(
                DATABASE_ID,
                ORDERS_COLLECTION_ID,
                [
                    Query.equal('waiterId', userId),
                    Query.orderDesc('$createdAt'),
                    Query.limit(batchSize),
                    Query.offset(offset)
                ]
            );

            allOrders.push(...response.documents);
            totalFetched += response.documents.length;
            console.log(`📄 Batch ${Math.floor(offset/batchSize) + 1}: fetched ${response.documents.length} orders (total: ${totalFetched})`);

            // If we got fewer documents than the batch size, we've reached the end
            if (response.documents.length < batchSize) {
                break;
            }

            offset += batchSize;

            // Safety check to prevent infinite loops
            if (offset > 10000) {
                console.warn('Reached maximum offset limit, stopping pagination');
                break;
            }
        }

        console.log(`✅ Total orders found for user ${userId}: ${allOrders.length}`);
        return {
            success: true,
            orders: allOrders as unknown as Order[]
        };
    } catch (error) {
        console.error('Error fetching recent orders:', error);
        return {
            success: false,
            orders: [],
            error: error instanceof Error ? error.message : 'Failed to fetch recent orders'
        };
    }
}
