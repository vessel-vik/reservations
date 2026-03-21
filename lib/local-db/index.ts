/**
 * Local Database Schema using Dexie.js (IndexedDB wrapper)
 * Mirrors Appwrite collections for offline-first functionality
 */

import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Type Definitions
// ============================================================================

export interface LocalGuest {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: string;
  address: string;
  occupation: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  preferredTable: string;
  dietaryRestrictions: string;
  specialRequests: string;
  allergies?: string;
  favoriteItems?: string;
  diningHistory?: string;
  pastVisits?: string;
  identificationType?: string;
  identificationNumber?: string;
  privacyConsent: boolean;
  marketingConsent: boolean;
  newsletterConsent: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface LocalReservation {
  id: string;
  guestId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  schedule: string;
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
  tablePreference: string;
  occasion: string;
  note: string;
  partySize: number;
  userId: string;
  cancellationReason?: string;
  specialRequests?: string;
  welcomeDrink?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface LocalMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  preparationTime: number;
  ingredients: string[];
  allergens: string[];
  dietaryFlags: {
    isVegetarian: boolean;
    isVegan: boolean;
    isGlutenFree: boolean;
  };
  variants?: Array<{ name: string; price: number }>;
  customizations?: Array<{ name: string; price: number }>;
  costPrice?: number;
  inventoryItems: string[];
  popularity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface LocalCategory {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface LocalTable {
  id: string;
  number: number;
  capacity: number;
  location: 'indoor' | 'outdoor' | 'bar' | 'private_dining' | 'terrace';
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'out_of_order';
  currentOrderId?: string;
  reservationId?: string;
  waiterId?: string;
  waiterName?: string;
  guestCount?: number;
  occupiedAt?: string;
  lastCleaned?: string;
  estimatedAvailableAt?: string;
  position: { x: number; y: number };
  features: string[];
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface LocalOrder {
  id: string;
  orderNumber: string;
  type: 'dine_in' | 'takeaway' | 'delivery';
  status: 'draft' | 'placed' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
  tableNumber?: number;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  guestCount: number;
  reservationId?: string;
  waiterId?: string;
  waiterName: string;
  cashierId?: string;
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  tipAmount: number;
  totalAmount: number;
  orderTime: string;
  estimatedReadyTime?: string;
  actualReadyTime?: string;
  servedTime?: string;
  completedTime?: string;
  specialInstructions?: string;
  kitchenNotes?: string;
  priority: 'normal' | 'high' | 'urgent';
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  paymentMethods: Array<{ method: string; amount: number; reference?: string }>;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface LocalOrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  variant?: { name: string; price: number };
  customizations: Array<{ name: string; price: number }>;
  specialInstructions?: string;
  kitchenStatus: 'waiting' | 'preparing' | 'ready' | 'served';
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface LocalStaff {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'manager' | 'waiter' | 'chef' | 'bartender' | 'cashier' | 'host';
  passwordHash?: string;
  pin?: string;
  permissions: string[];
  accessLevel: number;
  isActive: boolean;
  employeeId: string;
  department: 'front_of_house' | 'kitchen' | 'management';
  shifts: Array<{ day: string; start: string; end: string }>;
  hourlyRate?: number;
  totalOrders: number;
  totalRevenue: number;
  averageRating: number;
  startDate: string;
  birthday?: string;
  emergencyContact?: { name: string; phone: string; relationship: string };
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface LocalPayment {
  id: string;
  orderId?: string;
  reservationId?: string;
  amount: number;
  currency: string;
  method: 'cash' | 'card' | 'mobile_money' | 'bank_transfer' | 'paystack';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'pending_offline';
  paystackReference?: string;
  transactionId: string;
  receiptNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  processedBy: string;
  staffName: string;
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  tipAmount: number;
  discountAmount: number;
  processedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
  notes?: string;
  createdAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  checksum?: string;
}

export interface SyncQueueItem {
  id: string;
  collection: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  data: Record<string, unknown>;
  timestamp: string;
  retries: number;
  lastError?: string;
  checksum: string;
}

export interface SyncMetadata {
  id: string;
  collection: string;
  lastSyncTimestamp: string;
  lastSyncChecksum?: string;
  recordCount: number;
}

// ============================================================================
// Database Class
// ============================================================================

let localDbInstance: LocalDatabase | null = null;

export class LocalDatabase extends Dexie {
  guests!: Table<LocalGuest, string>;
  reservations!: Table<LocalReservation, string>;
  menuItems!: Table<LocalMenuItem, string>;
  categories!: Table<LocalCategory, string>;
  tables!: Table<LocalTable, string>;
  orders!: Table<LocalOrder, string>;
  orderItems!: Table<LocalOrderItem, string>;
  staff!: Table<LocalStaff, string>;
  payments!: Table<LocalPayment, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super('ScanNServeLocalDB');

    this.version(1).stores({
      guests: 'id, userId, email, phone, syncStatus, createdAt',
      reservations: 'id, guestId, guestEmail, schedule, status, syncStatus, createdAt',
      menuItems: 'id, name, category, isAvailable, isActive, syncStatus, createdAt',
      categories: 'id, name, displayOrder, isActive, syncStatus',
      tables: 'id, number, status, location, syncStatus',
      orders: 'id, orderNumber, tableNumber, status, customerId, syncStatus, createdAt',
      orderItems: 'id, orderId, menuItemId, kitchenStatus, syncStatus',
      staff: 'id, email, role, isActive, syncStatus',
      payments: 'id, orderId, reservationId, status, syncStatus, createdAt',
      syncQueue: 'id, collection, recordId, timestamp, retries',
      syncMetadata: 'id, collection, lastSyncTimestamp'
    });
  }
}

// ============================================================================
// Singleton Instance - Lazy loaded
// ============================================================================

export const localDb = {
  _db: null as LocalDatabase | null,
  
  get isOpen(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this._db) return false;
    try {
      return this._db.isOpen();
    } catch {
      return false;
    }
  },
  
  get guests() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.guests;
  },
  get reservations() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.reservations;
  },
  get menuItems() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.menuItems;
  },
  get categories() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.categories;
  },
  get tables() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    try {
      const db = this._db as any;
      // Use table() method which is safer than .tables getter
      const table = db.table ? db.table('tables') : null;
      return table || { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    } catch {
      return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    }
  },
  get orders() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.orders;
  },
  get orderItems() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.orderItems;
  },
  get staff() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.staff;
  },
  get payments() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.payments;
  },
  get syncQueue() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.syncQueue;
  },
  get syncMetadata() {
    if (typeof window === 'undefined') return { put: async () => 0, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {} };
    if (!this._db) this._db = new LocalDatabase();
    return this._db.syncMetadata;
  },
  
  async open(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!this._db) this._db = new LocalDatabase();
    await this._db.open();
  }
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate an offline ID with prefix
 */
export function generateOfflineId(prefix: string = 'OFFLINE'): string {
  return `${prefix}-${uuidv4()}`;
}

/**
 * Generate a checksum for data integrity
 */
export function generateChecksum(data: Record<string, unknown>): string {
  const str = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Initialize the local database
 */
export async function initializeLocalDB(): Promise<boolean> {
  try {
    // Check if already open
    if (localDb.isOpen) {
      console.log('📦 Local database already open');
      return true;
    }
    
    // Open the database - this initializes _db via lazy loading
    await localDb.open();
    
    // Verify it's open by checking a table
    const db = localDb._db;
    if (db && db.menuItems) {
      await (db.menuItems as any).count();
    }
    
    console.log('📦 Local database initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize local database:', error);
    return false;
  }
}

/**
 * Check if database is ready
 */
export function isDBReady(): boolean {
  return localDb.isOpen;
}

/**
 * Clear all data from local database
 */
export async function clearLocalDB(): Promise<void> {
  const db = localDb._db;
  if (db) {
    try {
      await (db.guests as any).clear();
      await (db.reservations as any).clear();
      await (db.menuItems as any).clear();
      await (db.categories as any).clear();
      await (db.tables as any).clear();
      await (db.orders as any).clear();
      await (db.orderItems as any).clear();
      await (db.staff as any).clear();
      await (db.payments as any).clear();
      await (db.syncQueue as any).clear();
      await (db.syncMetadata as any).clear();
    } catch (e) {
      console.warn('Some tables could not be cleared:', e);
    }
  }
  console.log('🗑️ Local database cleared');
}

// ============================================================================
// Export Types
// ============================================================================

export type {
  Dexie
};
