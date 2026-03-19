/**
 * Menu & Tables Offline - View and manage menu items and tables offline
 */

import { localDb, generateOfflineId, generateChecksum, getCurrentTimestamp, type LocalMenuItem, type LocalCategory, type LocalTable } from '../local-db';
import { queueMutation } from '../sync/sync-engine';
import { isOnline } from '../sync/network-monitor';

// ============================================================================
// Types
// ============================================================================

export interface CreateMenuItemInput {
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable?: boolean;
  preparationTime?: number;
  ingredients?: string[];
  allergens?: string[];
  dietaryFlags?: {
    isVegetarian: boolean;
    isVegan: boolean;
    isGlutenFree: boolean;
  };
  costPrice?: number;
}

export interface UpdateMenuItemInput {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  imageUrl?: string;
  isAvailable?: boolean;
  preparationTime?: number;
  ingredients?: string[];
  allergens?: string[];
  dietaryFlags?: {
    isVegetarian: boolean;
    isVegan: boolean;
    isGlutenFree: boolean;
  };
}

export interface CreateTableInput {
  number: number;
  capacity: number;
  location?: LocalTable['location'];
  position?: { x: number; y: number };
  features?: string[];
  notes?: string;
}

export interface UpdateTableInput {
  id: string;
  number?: number;
  capacity?: number;
  location?: LocalTable['location'];
  status?: LocalTable['status'];
  currentOrderId?: string;
  reservationId?: string;
  waiterId?: string;
  waiterName?: string;
  guestCount?: number;
  features?: string[];
  notes?: string;
  isActive?: boolean;
}

// ============================================================================
// Menu Items Operations
// ============================================================================

/**
 * Create a new menu item (works offline)
 */
export async function createMenuItemOffline(
  input: CreateMenuItemInput
): Promise<LocalMenuItem> {
  const id = generateOfflineId('MENU');
  const now = getCurrentTimestamp();
  
  const menuItem: LocalMenuItem = {
    id,
    name: input.name,
    description: input.description,
    price: input.price,
    category: input.category,
    imageUrl: input.imageUrl,
    isAvailable: input.isAvailable ?? true,
    preparationTime: input.preparationTime ?? 25,
    ingredients: input.ingredients || [],
    allergens: input.allergens || [],
    dietaryFlags: input.dietaryFlags || {
      isVegetarian: false,
      isVegan: false,
      isGlutenFree: false
    },
    variants: [],
    customizations: [],
    inventoryItems: [],
    popularity: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    syncStatus: isOnline() ? 'synced' : 'pending',
    checksum: ''
  };
  
  menuItem.checksum = generateChecksum(menuItem as unknown as Record<string, unknown>);
  
  await localDb.menuItems.put(menuItem);
  
  if (!isOnline()) {
    await queueMutation('menuItems', 'create', id, menuItem as unknown as Record<string, unknown>);
  }
  
  console.log(`📝 Created menu item ${id} (${isOnline() ? 'online' : 'offline'})`);
  
  return menuItem;
}

/**
 * Get all menu items
 */
export async function getMenuItems(
  includeInactive: boolean = false
): Promise<LocalMenuItem[]> {
  if (includeInactive) {
    return localDb.menuItems.toArray();
  }
  
  return localDb.menuItems
    .filter(item => item.isActive)
    .toArray();
}

/**
 * Get menu item by ID
 */
export async function getMenuItemById(id: string): Promise<LocalMenuItem | undefined> {
  return localDb.menuItems.get(id);
}

/**
 * Get menu items by category
 */
export async function getMenuItemsByCategory(
  category: string
): Promise<LocalMenuItem[]> {
  return localDb.menuItems
    .filter(item => item.category === category && item.isActive)
    .toArray();
}

/**
 * Get available menu items only
 */
export async function getAvailableMenuItems(): Promise<LocalMenuItem[]> {
  return localDb.menuItems
    .filter(item => item.isActive && item.isAvailable)
    .toArray();
}

/**
 * Update a menu item
 */
export async function updateMenuItemOffline(
  input: UpdateMenuItemInput
): Promise<LocalMenuItem | undefined> {
  const existing = await localDb.menuItems.get(input.id);
  
  if (!existing) {
    console.error(`Menu item ${input.id} not found`);
    return undefined;
  }
  
  const updated: LocalMenuItem = {
    ...existing,
    ...(input.name && { name: input.name }),
    ...(input.description && { description: input.description }),
    ...(input.price && { price: input.price }),
    ...(input.category && { category: input.category }),
    ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
    ...(input.isAvailable !== undefined && { isAvailable: input.isAvailable }),
    ...(input.preparationTime && { preparationTime: input.preparationTime }),
    ...(input.ingredients && { ingredients: input.ingredients }),
    ...(input.allergens && { allergens: input.allergens }),
    ...(input.dietaryFlags && { dietaryFlags: input.dietaryFlags }),
    updatedAt: getCurrentTimestamp(),
    syncStatus: isOnline() ? 'synced' : 'pending'
  };
  
  updated.checksum = generateChecksum(updated as unknown as Record<string, unknown>);
  
  await localDb.menuItems.put(updated);
  
  if (!isOnline()) {
    await queueMutation('menuItems', 'update', input.id, updated as unknown as Record<string, unknown>);
  }
  
  return updated;
}

/**
 * Toggle menu item availability
 */
export async function toggleMenuItemAvailability(
  id: string
): Promise<LocalMenuItem | undefined> {
  const item = await localDb.menuItems.get(id);
  
  if (!item) {
    return undefined;
  }
  
  return updateMenuItemOffline({
    id,
    isAvailable: !item.isAvailable
  });
}

// ============================================================================
// Categories Operations
// ============================================================================

/**
 * Get all categories
 */
export async function getCategories(): Promise<LocalCategory[]> {
  return localDb.categories
    .filter(cat => cat.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .toArray();
}

/**
 * Create a category
 */
export async function createCategoryOffline(
  name: string,
  description?: string,
  displayOrder?: number
): Promise<LocalCategory> {
  const id = generateOfflineId('CAT');
  const now = getCurrentTimestamp();
  
  const category: LocalCategory = {
    id,
    name,
    description,
    displayOrder: displayOrder ?? 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    syncStatus: isOnline() ? 'synced' : 'pending',
    checksum: ''
  };
  
  category.checksum = generateChecksum(category as unknown as Record<string, unknown>);
  
  await localDb.categories.put(category);
  
  if (!isOnline()) {
    await queueMutation('categories', 'create', id, category as unknown as Record<string, unknown>);
  }
  
  return category;
}

// ============================================================================
// Tables Operations
// ============================================================================

/**
 * Create a new table (works offline)
 */
export async function createTableOffline(
  input: CreateTableInput
): Promise<LocalTable> {
  const id = generateOfflineId('TBL');
  const now = getCurrentTimestamp();
  
  const table: LocalTable = {
    id,
    number: input.number,
    capacity: input.capacity,
    location: input.location || 'indoor',
    status: 'available',
    position: input.position || { x: 0, y: 0 },
    features: input.features || [],
    notes: input.notes,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    syncStatus: isOnline() ? 'synced' : 'pending',
    checksum: ''
  };
  
  table.checksum = generateChecksum(table as unknown as Record<string, unknown>);
  
  await localDb.tables.put(table);
  
  if (!isOnline()) {
    await queueMutation('tables', 'create', id, table as unknown as Record<string, unknown>);
  }
  
  console.log(`📝 Created table ${input.number} (${isOnline() ? 'online' : 'offline'})`);
  
  return table;
}

/**
 * Get all tables
 */
export async function getTables(
  includeInactive: boolean = false
): Promise<LocalTable[]> {
  if (includeInactive) {
    return localDb.tables.toArray();
  }
  
  return localDb.tables
    .filter(table => table.isActive)
    .toArray();
}

/**
 * Get table by ID
 */
export async function getTableById(id: string): Promise<LocalTable | undefined> {
  return localDb.tables.get(id);
}

/**
 * Get table by number
 */
export async function getTableByNumber(number: number): Promise<LocalTable | undefined> {
  return localDb.tables
    .filter(table => table.number === number)
    .first();
}

/**
 * Get available tables
 */
export async function getAvailableTables(): Promise<LocalTable[]> {
  return localDb.tables
    .filter(table => table.isActive && table.status === 'available')
    .toArray();
}

/**
 * Get tables by location
 */
export async function getTablesByLocation(
  location: LocalTable['location']
): Promise<LocalTable[]> {
  return localDb.tables
    .filter(table => table.location === location && table.isActive)
    .toArray();
}

/**
 * Update a table
 */
export async function updateTableOffline(
  input: UpdateTableInput
): Promise<LocalTable | undefined> {
  const existing = await localDb.tables.get(input.id);
  
  if (!existing) {
    console.error(`Table ${input.id} not found`);
    return undefined;
  }
  
  const updated: LocalTable = {
    ...existing,
    ...(input.number && { number: input.number }),
    ...(input.capacity && { capacity: input.capacity }),
    ...(input.location && { location: input.location }),
    ...(input.status && { status: input.status }),
    ...(input.currentOrderId !== undefined && { currentOrderId: input.currentOrderId }),
    ...(input.reservationId !== undefined && { reservationId: input.reservationId }),
    ...(input.waiterId !== undefined && { waiterId: input.waiterId }),
    ...(input.waiterName !== undefined && { waiterName: input.waiterName }),
    ...(input.guestCount !== undefined && { guestCount: input.guestCount }),
    ...(input.features && { features: input.features }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    updatedAt: getCurrentTimestamp(),
    syncStatus: isOnline() ? 'synced' : 'pending'
  };
  
  updated.checksum = generateChecksum(updated as unknown as Record<string, unknown>);
  
  await localDb.tables.put(updated);
  
  if (!isOnline()) {
    await queueMutation('tables', 'update', input.id, updated as unknown as Record<string, unknown>);
  }
  
  return updated;
}

/**
 * Occupy a table
 */
export async function occupyTable(
  id: string,
  orderId: string,
  reservationId?: string,
  guestCount?: number,
  waiterId?: string,
  waiterName?: string
): Promise<LocalTable | undefined> {
  return updateTableOffline({
    id,
    status: 'occupied',
    currentOrderId: orderId,
    reservationId,
    guestCount,
    waiterId,
    waiterName,
    occupiedAt: getCurrentTimestamp()
  });
}

/**
 * Release a table
 */
export async function releaseTable(
  id: string
): Promise<LocalTable | undefined> {
  return updateTableOffline({
    id,
    status: 'available',
    currentOrderId: undefined,
    reservationId: undefined,
    guestCount: undefined,
    occupiedAt: undefined
  });
}

/**
 * Mark table as cleaning
 */
export async function markTableForCleaning(id: string): Promise<LocalTable | undefined> {
  return updateTableOffline({
    id,
    status: 'cleaning',
    lastCleaned: getCurrentTimestamp()
  });
}

// ============================================================================
// Sync Helpers
// ============================================================================

/**
 * Sync menu items from cloud
 */
export async function syncMenuFromCloud(
  cloudItems: LocalMenuItem[]
): Promise<number> {
  let synced = 0;
  
  for (const cloudItem of cloudItems) {
    const local = await localDb.menuItems.get(cloudItem.id);
    
    if (!local) {
      await localDb.menuItems.put({
        ...cloudItem,
        syncStatus: 'synced'
      });
      synced++;
    } else if (local.syncStatus === 'synced') {
      if (local.checksum !== cloudItem.checksum) {
        await localDb.menuItems.put({
          ...cloudItem,
          syncStatus: 'synced'
        });
        synced++;
      }
    }
  }
  
  return synced;
}

/**
 * Sync tables from cloud
 */
export async function syncTablesFromCloud(
  cloudTables: LocalTable[]
): Promise<number> {
  let synced = 0;
  
  for (const cloudTable of cloudTables) {
    const local = await localDb.tables.get(cloudTable.id);
    
    if (!local) {
      await localDb.tables.put({
        ...cloudTable,
        syncStatus: 'synced'
      });
      synced++;
    } else if (local.syncStatus === 'synced') {
      if (local.checksum !== cloudTable.checksum) {
        await localDb.tables.put({
          ...cloudTable,
          syncStatus: 'synced'
        });
        synced++;
      }
    }
  }
  
  return synced;
}
