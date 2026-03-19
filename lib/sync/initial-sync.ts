/**
 * Initial Data Seeding - Pre-populate local database on first run
 */

import { localDb, generateChecksum, getCurrentTimestamp, type LocalMenuItem, type LocalCategory, type LocalTable, type LocalStaff } from '../local-db';

// ============================================================================
// Types
// ============================================================================

export interface SeedResult {
  success: boolean;
  guests: number;
  reservations: number;
  menuItems: number;
  categories: number;
  tables: number;
  staff: number;
  errors: string[];
}

interface AppwriteClient {
  databases: {
    listDocuments: (databaseId: string, collectionId: string, queries?: string[]) => Promise<{ documents: unknown[] }>;
  };
}

// ============================================================================
// Check if First Run
// ============================================================================

const INITIAL_SYNC_KEY = 'scan_n_serve_initial_sync_complete';

/**
 * Check if this is the first run (needs initial sync)
 */
export function isFirstRun(): boolean {
  if (typeof localStorage === 'undefined') {
    return true;
  }
  
  return !localStorage.getItem(INITIAL_SYNC_KEY);
}

/**
 * Mark initial sync as complete
 */
export function markInitialSyncComplete(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(INITIAL_SYNC_KEY, 'true');
    localStorage.setItem(INITIAL_SYNC_KEY, new Date().toISOString());
  }
}

/**
 * Get last initial sync date
 */
export function getLastInitialSyncDate(): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  
  return localStorage.getItem(INITIAL_SYNC_KEY);
}

// ============================================================================
// Cloud Sync (Pull from Appwrite)
// ============================================================================

/**
 * Perform initial data seeding from cloud
 */
export async function performInitialSync(
  appwrite: AppwriteClient,
  databaseId: string
): Promise<SeedResult> {
  const result: SeedResult = {
    success: true,
    guests: 0,
    reservations: 0,
    menuItems: 0,
    categories: 0,
    tables: 0,
    staff: 0,
    errors: []
  };

  const collectionMap: Record<string, string> = {
    guests: process.env.NEXT_PUBLIC_PATIENT_COLLECTION_ID || 'guests',
    reservations: process.env.NEXT_PUBLIC_APPOINTMENT_COLLECTION_ID || 'reservations',
    menuItems: 'menu_items',
    categories: 'categories',
    tables: 'tables',
    staff: 'staff'
  };

  // Sync each collection
  for (const [localName, cloudName] of Object.entries(collectionMap)) {
    try {
      const response = await appwrite.databases.listDocuments(
        databaseId,
        cloudName
      );

      const count = await syncCollectionFromCloud(localName, response.documents);
      
      switch (localName) {
        case 'guests': result.guests = count; break;
        case 'reservations': result.reservations = count; break;
        case 'menuItems': result.menuItems = count; break;
        case 'categories': result.categories = count; break;
        case 'tables': result.tables = count; break;
        case 'staff': result.staff = count; break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to sync ${localName}: ${errorMessage}`);
      result.success = false;
    }
  }

  if (result.success) {
    markInitialSyncComplete();
  }

  return result;
}

/**
 * Sync a specific collection from cloud
 */
async function syncCollectionFromCloud(
  collection: string,
  cloudData: unknown[]
): Promise<number> {
  let synced = 0;

  for (const doc of cloudData as Record<string, unknown>[]) {
    const item = {
      ...doc,
      id: doc.$id as string,
      syncStatus: 'synced' as const,
      checksum: generateChecksum(doc),
      createdAt: (doc.createdAt as string) || getCurrentTimestamp(),
      updatedAt: (doc.updatedAt as string) || getCurrentTimestamp()
    };

    const table = getTableForCollection(collection);
    if (table) {
      await table.put(item);
      synced++;
    }
  }

  return synced;
}

function getTableForCollection(collection: string) {
  const tableMap: Record<string, typeof localDb.guests | typeof localDb.reservations | typeof localDb.menuItems | typeof localDb.categories | typeof localDb.tables | typeof localDb.staff> = {
    guests: localDb.guests,
    reservations: localDb.reservations,
    menuItems: localDb.menuItems,
    categories: localDb.categories,
    tables: localDb.tables,
    staff: localDb.staff
  };
  return tableMap[collection];
}

// ============================================================================
// Default Data (Fallback for first run without cloud)
// ============================================================================

/**
 * Seed default data for first offline run
 */
export async function seedDefaultData(): Promise<SeedResult> {
  const result: SeedResult = {
    success: true,
    guests: 0,
    reservations: 0,
    menuItems: 0,
    categories: 0,
    tables: 0,
    staff: 0,
    errors: []
  };

  try {
    // Seed categories
    const categories = await seedDefaultCategories();
    result.categories = categories;

    // Seed menu items
    const menuItems = await seedDefaultMenuItems();
    result.menuItems = menuItems;

    // Seed tables
    const tables = await seedDefaultTables();
    result.tables = tables;

    // Seed demo staff
    const staff = await seedDefaultStaff();
    result.staff = staff;

    markInitialSyncComplete();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Failed to seed default data: ${errorMessage}`);
    result.success = false;
  }

  return result;
}

/**
 * Seed default categories
 */
async function seedDefaultCategories(): Promise<number> {
  const categories: LocalCategory[] = [
    {
      id: 'cat-appetizers',
      name: 'Appetizers',
      description: 'Start your meal with these delicious bites',
      displayOrder: 1,
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'cat-mains',
      name: 'Main Courses',
      description: 'Hearty main dishes',
      displayOrder: 2,
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'cat-desserts',
      name: 'Desserts',
      description: 'Sweet treats to end your meal',
      displayOrder: 3,
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'cat-beverages',
      name: 'Beverages',
      description: 'Drinks and refreshments',
      displayOrder: 4,
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    }
  ];

  for (const cat of categories) {
    cat.checksum = generateChecksum(cat as unknown as Record<string, unknown>);
    await localDb.categories.put(cat);
  }

  return categories.length;
}

/**
 * Seed default menu items
 */
async function seedDefaultMenuItems(): Promise<number> {
  const menuItems: LocalMenuItem[] = [
    {
      id: 'menu-1',
      name: 'Crispy Spring Rolls',
      description: 'Golden fried vegetable spring rolls with sweet chili sauce',
      price: 1500,
      category: 'Appetizers',
      isAvailable: true,
      preparationTime: 10,
      ingredients: ['Cabbage', 'Carrots', 'Glass noodles', 'Spring roll wrapper'],
      allergens: ['Wheat', 'Soy'],
      dietaryFlags: { isVegetarian: true, isVegan: true, isGlutenFree: false },
      popularity: 85,
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'menu-2',
      name: 'Grilled Chicken',
      description: 'Tender grilled chicken with herbs and spices',
      price: 3500,
      category: 'Main Courses',
      isAvailable: true,
      preparationTime: 25,
      ingredients: ['Chicken breast', 'Herbs', 'Spices', 'Lemon'],
      allergens: [],
      dietaryFlags: { isVegetarian: false, isVegan: false, isGlutenFree: true },
      popularity: 92,
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'menu-3',
      name: 'Chocolate Lava Cake',
      description: 'Warm chocolate cake with molten center',
      price: 2000,
      category: 'Desserts',
      isAvailable: true,
      preparationTime: 15,
      ingredients: ['Dark chocolate', 'Butter', 'Eggs', 'Flour'],
      allergens: ['Wheat', 'Eggs', 'Dairy'],
      dietaryFlags: { isVegetarian: true, isVegan: false, isGlutenFree: false },
      popularity: 95,
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'menu-4',
      name: 'Fresh Orange Juice',
      description: 'Freshly squeezed orange juice',
      price: 800,
      category: 'Beverages',
      isAvailable: true,
      preparationTime: 5,
      ingredients: ['Fresh oranges'],
      allergens: [],
      dietaryFlags: { isVegetarian: true, isVegan: true, isGlutenFree: true },
      popularity: 75,
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    }
  ];

  for (const item of menuItems) {
    item.checksum = generateChecksum(item as unknown as Record<string, unknown>);
    await localDb.menuItems.put(item);
  }

  return menuItems.length;
}

/**
 * Seed default tables
 */
async function seedDefaultTables(): Promise<number> {
  const tables: LocalTable[] = [
    {
      id: 'table-1',
      number: 1,
      capacity: 4,
      location: 'indoor',
      status: 'available',
      position: { x: 1, y: 1 },
      features: ['Window'],
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'table-2',
      number: 2,
      capacity: 4,
      location: 'indoor',
      status: 'available',
      position: { x: 1, y: 2 },
      features: [],
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'table-3',
      number: 3,
      capacity: 6,
      location: 'indoor',
      status: 'available',
      position: { x: 2, y: 1 },
      features: ['Booth'],
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'table-4',
      number: 4,
      capacity: 8,
      location: 'private_dining',
      status: 'available',
      position: { x: 3, y: 1 },
      features: ['Private', 'Large group'],
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'table-5',
      number: 5,
      capacity: 2,
      location: 'outdoor',
      status: 'available',
      position: { x: 4, y: 1 },
      features: ['Outdoor', 'Romantic'],
      isActive: true,
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    }
  ];

  for (const table of tables) {
    table.checksum = generateChecksum(table as unknown as Record<string, unknown>);
    await localDb.tables.put(table);
  }

  return tables.length;
}

/**
 * Seed default staff
 */
async function seedDefaultStaff(): Promise<number> {
  const staff: LocalStaff[] = [
    {
      id: 'staff-1',
      name: 'Demo Manager',
      email: 'manager@demo.com',
      phone: '+2348000000001',
      role: 'manager',
      permissions: ['*'],
      accessLevel: 5,
      isActive: true,
      employeeId: 'EMP001',
      department: 'management',
      shifts: [],
      totalOrders: 0,
      totalRevenue: 0,
      averageRating: 5,
      startDate: getCurrentTimestamp(),
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    },
    {
      id: 'staff-2',
      name: 'Demo Waiter',
      email: 'waiter@demo.com',
      phone: '+2348000000002',
      role: 'waiter',
      permissions: ['orders.create', 'orders.read', 'tables.read'],
      accessLevel: 2,
      isActive: true,
      employeeId: 'EMP002',
      department: 'front_of_house',
      shifts: [],
      totalOrders: 0,
      totalRevenue: 0,
      averageRating: 5,
      startDate: getCurrentTimestamp(),
      createdAt: getCurrentTimestamp(),
      updatedAt: getCurrentTimestamp(),
      syncStatus: 'synced',
      checksum: ''
    }
  ];

  for (const member of staff) {
    member.checksum = generateChecksum(member as unknown as Record<string, unknown>);
    await localDb.staff.put(member);
  }

  return staff.length;
}

// ============================================================================
// Database Export/Import
// ============================================================================

/**
 * Export local database to JSON
 */
export async function exportLocalData(): Promise<string> {
  const data = {
    guests: await localDb.guests.toArray(),
    reservations: await localDb.reservations.toArray(),
    menuItems: await localDb.menuItems.toArray(),
    categories: await localDb.categories.toArray(),
    tables: await localDb.tables.toArray(),
    orders: await localDb.orders.toArray(),
    payments: await localDb.payments.toArray(),
    staff: await localDb.staff.toArray(),
    exportedAt: getCurrentTimestamp()
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Import data from JSON
 */
export async function importLocalData(jsonData: string): Promise<SeedResult> {
  const result: SeedResult = {
    success: true,
    guests: 0,
    reservations: 0,
    menuItems: 0,
    categories: 0,
    tables: 0,
    staff: 0,
    errors: []
  };

  try {
    const data = JSON.parse(jsonData);

    if (data.guests) {
      for (const item of data.guests) {
        await localDb.guests.put(item);
        result.guests++;
      }
    }

    if (data.reservations) {
      for (const item of data.reservations) {
        await localDb.reservations.put(item);
        result.reservations++;
      }
    }

    if (data.menuItems) {
      for (const item of data.menuItems) {
        await localDb.menuItems.put(item);
        result.menuItems++;
      }
    }

    if (data.categories) {
      for (const item of data.categories) {
        await localDb.categories.put(item);
        result.categories++;
      }
    }

    if (data.tables) {
      for (const item of data.tables) {
        await localDb.tables.put(item);
        result.tables++;
      }
    }

    if (data.staff) {
      for (const item of data.staff) {
        await localDb.staff.put(item);
        result.staff++;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Import failed: ${errorMessage}`);
    result.success = false;
  }

  return result;
}
