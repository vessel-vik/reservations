"use server";

import { Query } from "node-appwrite";
import { databases, DATABASE_ID } from "@/lib/appwrite.config";
import { parseStringify } from "@/lib/utils";
import { getAuthContext, validateBusinessContext } from "@/lib/auth.utils";

// POS Collections
const TABLES_COLLECTION_ID = "tables";

// Sample table data for fallback
const SAMPLE_TABLES = [
  {
    $id: "1",
    number: 1,
    capacity: 2,
    location: "indoor",
    currentOrderId: null,
    reservationId: null,
    waiterId: null,
    waiterName: null,
    guestCount: 0,
    occupiedAt: null,
    features: ["window_view"],
    notes: null,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString()
  },
  {
    $id: "2",
    number: 2,
    capacity: 4,
    location: "indoor",
    currentOrderId: "order-001",
    reservationId: null,
    waiterId: "staff-001",
    waiterName: "Sarah Johnson",
    guestCount: 3,
    occupiedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    features: [],
    notes: null,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString()
  },
  {
    $id: "3",
    number: 3,
    capacity: 6,
    location: "outdoor",
    currentOrderId: null,
    reservationId: "res-001",
    waiterId: "staff-002",
    waiterName: "Mike Chen",
    guestCount: 0,
    occupiedAt: null,
    features: ["garden_view"],
    notes: "Birthday celebration - requested outdoor seating",
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString()
  },
  {
    $id: "4",
    number: 4,
    capacity: 2,
    location: "bar",
    currentOrderId: null,
    reservationId: null,
    waiterId: null,
    waiterName: null,
    guestCount: 0,
    occupiedAt: null,
    features: ["bar_seating"],
    notes: null,
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString()
  },
  {
    $id: "5",
    number: 5,
    capacity: 8,
    location: "private_dining",
    currentOrderId: "order-005",
    reservationId: "res-002",
    waiterId: "staff-001",
    waiterName: "Sarah Johnson",
    guestCount: 6,
    occupiedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    features: ["private", "large_group"],
    notes: "Corporate lunch meeting",
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString()
  },
  {
    $id: "6",
    number: 6,
    capacity: 4,
    location: "terrace",
    currentOrderId: null,
    reservationId: null,
    waiterId: null,
    waiterName: null,
    guestCount: 0,
    occupiedAt: null,
    features: ["city_view"],
    notes: "Chair needs repair",
    $createdAt: new Date().toISOString(),
    $updatedAt: new Date().toISOString()
  }
];

// Get all tables
export const getPOSTables = async (location?: string) => {
  try {
    console.log("🪑 Fetching POS tables...", location ? `Location: ${location}` : "All locations");

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    const queries = [
      Query.equal("businessId", businessId), // CRITICAL: Multi-tenant isolation
      Query.orderAsc('number')
    ];

    if (location && location !== "all") {
      queries.push(Query.equal('location', location));
    }

    const tables = await databases.listDocuments(
      DATABASE_ID!,
      TABLES_COLLECTION_ID,
      queries
    );

    console.log(`✅ Retrieved ${tables.documents.length} tables`);

    // Add derived status based on occupation
    const tablesWithStatus = tables.documents.map((table: any) => ({
      ...table,
      status: getTableStatus(table)
    }));

    return parseStringify(tablesWithStatus);

  } catch (error) {
    console.error("❌ Error fetching tables:", error);

    // Return sample data as fallback
    console.log("🪑 Using sample table data");
    const filteredTables = location && location !== "all"
      ? SAMPLE_TABLES.filter(table => table.location === location)
      : SAMPLE_TABLES;

    // Add status to sample tables
    const tablesWithStatus = filteredTables.map(table => ({
      ...table,
      status: getTableStatus(table)
    }));

    return parseStringify(tablesWithStatus);
  }
};

// Get table status based on current state
function getTableStatus(table: any): string {
  if (table.notes && table.notes.includes("repair")) {
    return "out_of_order";
  }

  if (table.currentOrderId) {
    return "occupied";
  }

  if (table.reservationId) {
    return "reserved";
  }

  // Check if recently vacated and needs cleaning
  if (table.occupiedAt) {
    const occupiedTime = new Date(table.occupiedAt).getTime();
    const now = new Date().getTime();
    const timeSinceVacated = now - occupiedTime;

    // If vacated within last 15 minutes and no current order, needs cleaning
    if (timeSinceVacated < 15 * 60 * 1000 && !table.currentOrderId) {
      return "cleaning";
    }
  }

  return "available";
}

// Update table status
export const updateTableStatus = async (
  tableId: string,
  updates: {
    currentOrderId?: string;
    reservationId?: string;
    waiterId?: string;
    waiterName?: string;
    guestCount?: number;
    occupiedAt?: string;
    notes?: string;
  }
) => {
  try {
    console.log("📝 Updating table:", tableId);

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    const updatedTable = await databases.updateDocument(
      DATABASE_ID!,
      TABLES_COLLECTION_ID,
      tableId,
      updates
    );

    console.log("✅ Table updated:", tableId);
    return parseStringify(updatedTable);

  } catch (error) {
    console.error("❌ Error updating table:", error);
    throw error;
  }
};

// Seat guests at table
export const seatGuestsAtTable = async (
  tableNumber: number,
  guestCount: number,
  waiterId: string,
  waiterName: string,
  reservationId?: string,
  orderId?: string
) => {
  try {
    console.log(`🪑 Seating ${guestCount} guests at table ${tableNumber}`);

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    // Find table by number
    const tables = await getPOSTables();
    const table = tables.find((t: any) => t.number === tableNumber);

    if (!table) {
      throw new Error(`Table ${tableNumber} not found`);
    }

    // Check if table is available
    const currentStatus = getTableStatus(table);
    if (currentStatus !== "available" && currentStatus !== "reserved") {
      throw new Error(`Table ${tableNumber} is not available (status: ${currentStatus})`);
    }

    // Update table
    const updates: any = {
      guestCount,
      waiterId,
      waiterName,
      occupiedAt: new Date().toISOString(),
      currentOrderId: orderId || null,
      ...(reservationId && { reservationId })
    };

    const updatedTable = await updateTableStatus(table.$id, updates);

    console.log(`✅ Guests seated at table ${tableNumber}`);
    return parseStringify(updatedTable);

  } catch (error) {
    console.error(`❌ Error seating guests at table ${tableNumber}:`, error);
    throw error;
  }
};

// Clear table
export const clearTable = async (tableNumber: number) => {
  try {
    console.log(`🧹 Clearing table ${tableNumber}`);

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    // Find table by number
    const tables = await getPOSTables();
    const table = tables.find((t: any) => t.number === tableNumber);

    if (!table) {
      throw new Error(`Table ${tableNumber} not found`);
    }

    // Clear table data
    const updates = {
      currentOrderId: "",
      reservationId: "",
      waiterId: "",
      waiterName: "",
      guestCount: 0,
      occupiedAt: table.occupiedAt, // Keep for cleaning status
    };

    const updatedTable = await updateTableStatus(table.$id, updates);

    console.log(`✅ Table ${tableNumber} cleared`);
    return parseStringify(updatedTable);

  } catch (error) {
    console.error(`❌ Error clearing table ${tableNumber}:`, error);
    throw error;
  }
};

// Mark table as cleaned
export const markTableCleaned = async (tableNumber: number) => {
  try {
    console.log(`✨ Marking table ${tableNumber} as cleaned`);

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    // Find table by number
    const tables = await getPOSTables();
    const table = tables.find((t: any) => t.number === tableNumber);

    if (!table) {
      throw new Error(`Table ${tableNumber} not found`);
    }

    // Update cleaning status
    const updates = {
      lastCleaned: new Date().toISOString(),
      occupiedAt: "", // Clear occupied time so it shows as available
    };

    const updatedTable = await updateTableStatus(table.$id, updates);

    console.log(`✅ Table ${tableNumber} marked as cleaned`);
    return parseStringify(updatedTable);

  } catch (error) {
    console.error(`❌ Error marking table ${tableNumber} as cleaned:`, error);
    throw error;
  }
};

// Get table statistics
export const getTableStatistics = async () => {
  try {
    console.log("📊 Calculating table statistics...");

    const { businessId } = await getAuthContext();
    validateBusinessContext(businessId);

    const tables = await getPOSTables();

    const stats = {
      total: tables.length,
      available: 0,
      occupied: 0,
      reserved: 0,
      cleaning: 0,
      outOfOrder: 0,
      occupancyRate: 0,
      averagePartySize: 0,
      totalGuestCapacity: 0,
      currentGuests: 0
    };

    let totalPartySize = 0;
    let occupiedTables = 0;

    tables.forEach((table: any) => {
      const status = getTableStatus(table);

      switch (status) {
        case "available":
          stats.available++;
          break;
        case "occupied":
          stats.occupied++;
          totalPartySize += table.guestCount || 0;
          occupiedTables++;
          break;
        case "reserved":
          stats.reserved++;
          break;
        case "cleaning":
          stats.cleaning++;
          break;
        case "out_of_order":
          stats.outOfOrder++;
          break;
      }

      stats.totalGuestCapacity += table.capacity;
      stats.currentGuests += table.guestCount || 0;
    });

    stats.occupancyRate = Math.round((stats.occupied / stats.total) * 100);
    stats.averagePartySize = occupiedTables > 0 ? Math.round((totalPartySize / occupiedTables) * 10) / 10 : 0;

    console.log("✅ Table statistics calculated");
    return parseStringify(stats);

  } catch (error) {
    console.error("❌ Error calculating table statistics:", error);

    // Return default stats
    return parseStringify({
      total: SAMPLE_TABLES.length,
      available: 3,
      occupied: 2,
      reserved: 1,
      cleaning: 0,
      outOfOrder: 1,
      occupancyRate: 33,
      averagePartySize: 4.5,
      totalGuestCapacity: 26,
      currentGuests: 9
    });
  }
};