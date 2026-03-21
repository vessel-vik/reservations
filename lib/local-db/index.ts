/**
 * Local Database Stub - Offline functionality disabled
 * All operations return empty/null values to maintain API compatibility
 */

// Re-export types for backwards compatibility
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
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LocalReservation {
  id: string;
  guestId: string;
  guestEmail: string;
  guestName: string;
  guestPhone: string;
  schedule: string;
  partySize: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no-show';
  tableNumber?: string;
  specialRequests?: string;
  dietaryRestrictions?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LocalMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  isActive: boolean;
  preparationTime?: number;
  popularity?: number;
  ingredients?: string[];
  allergens?: string[];
  calories?: number;
  isVegetarian?: boolean;
  isVegan?: boolean;
  isGlutenFree?: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LocalCategory {
  id: string;
  name: string;
  label: string;
  slug: string;
  icon?: string;
  displayOrder?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LocalTable {
  id: string;
  number: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'out-of-order';
  location?: string;
  guestCount?: number;
  currentOrderId?: string;
  occupiedAt?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LocalOrder {
  id: string;
  orderNumber: string;
  tableNumber: string;
  customerId?: string;
  customerName?: string;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'paid' | 'cancelled';
  items: any[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod?: string;
  amountPaid?: number;
  change?: number;
  orderTime: string;
  servedAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LocalOrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  kitchenStatus: 'pending' | 'preparing' | 'ready' | 'served';
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LocalStaff {
  id: string;
  name: string;
  email: string;
  role: string;
  pin?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface LocalPayment {
  id: string;
  orderId: string;
  reservationId?: string;
  amount: number;
  paymentMethod: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface SyncQueueItem {
  id: string;
  collection: string;
  recordId: string;
  operation: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
  retries: number;
  lastError?: string;
}

export interface SyncMetadata {
  id: string;
  collection: string;
  lastSyncTimestamp: string;
}

// Stub implementations - all return empty/null values
export const localDb = {
  _db: null,
  
  get isOpen(): boolean {
    return false;
  },
  
  get guests() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get reservations() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get menuItems() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get categories() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get tables() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get orders() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get orderItems() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get staff() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get payments() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get syncQueue() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  get syncMetadata() {
    return { put: async () => {}, get: async () => null, toArray: async () => [], count: async () => 0, clear: async () => {}, delete: async () => {}, where: () => ({ equals: () => ({ first: async () => null }) }), orderBy: () => ({ toArray: async () => [] }) };
  },
  
  async open(): Promise<void> {},
  async close(): Promise<void> {}
};

export async function initializeLocalDB(): Promise<boolean> {
  console.log('📦 Local database disabled - running in cloud-only mode');
  return false;
}

export function isDBReady(): boolean {
  return false;
}

export async function clearLocalDB(): Promise<void> {
  console.log('🗑️ Local database cleared (no-op - offline disabled)');
}

export function generateOfflineId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateChecksum(data: any): string {
  return '';
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}
