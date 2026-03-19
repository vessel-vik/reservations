/**
 * Offline System - Main entry point for all offline functionality
 * 
 * This module provides a unified API for offline-first operations in the ScanNServe POS system.
 * 
 * @package @scan-n-serve/offline
 * @version 1.0.0
 */

// ============================================================================
// Local Database
// ============================================================================

export {
  localDb,
  LocalDatabase,
  initializeLocalDB,
  clearLocalDB,
  generateOfflineId,
  generateChecksum,
  getCurrentTimestamp,
  type LocalGuest,
  type LocalReservation,
  type LocalMenuItem,
  type LocalCategory,
  type LocalTable,
  type LocalOrder,
  type LocalOrderItem,
  type LocalStaff,
  type LocalPayment,
  type SyncQueueItem,
  type SyncMetadata
} from '@/lib/local-db';

// ============================================================================
// Sync Engine
// ============================================================================

export {
  queueMutation,
  getPendingSyncItems,
  getPendingSyncCount,
  removeSyncQueueItem,
  performFullSync,
  triggerImmediateSync,
  startScheduledSync,
  stopScheduledSync,
  getSyncStatus,
  resolveConflict,
  getLastSyncTimestamp,
  updateSyncMetadata,
  type SyncResult,
  type SyncStatus,
  type ConflictResolution
} from '@/lib/sync/sync-engine';

// ============================================================================
// Network Monitor
// ============================================================================

export {
  initializeNetworkMonitor,
  startHealthCheck,
  stopHealthCheck,
  getNetworkStatus,
  isOnline,
  checkNow,
  updateAppwriteClient,
  cleanupNetworkMonitor,
  waitForNetwork,
  type NetworkStatus,
  type NetworkState,
  type NetworkEventHandlers
} from '@/lib/sync/network-monitor';

// ============================================================================
// Initial Sync & Data Seeding
// ============================================================================

export {
  isFirstRun,
  markInitialSyncComplete,
  getLastInitialSyncDate,
  performInitialSync,
  seedDefaultData,
  exportLocalData,
  importLocalData,
  type SeedResult
} from '@/lib/sync/initial-sync';

// ============================================================================
// Offline Authentication
// ============================================================================

export {
  authenticateStaff,
  restoreSession,
  logout,
  hasPermission,
  hasRole,
  cacheStaffCredentials,
  getCachedStaffList,
  updateStaffPin,
  syncStaffFromCloud,
  getCurrentSession,
  isSessionValid,
  type OfflineAuthState,
  type StaffCredentials,
  type AuthResult
} from '@/lib/auth/offline-auth';

// ============================================================================
// Session Manager
// ============================================================================

export {
  initializeSessionManager,
  validateSession,
  getRemainingSessionTime,
  extendSession,
  endSession,
  trackActivity,
  removeActivityTracking,
  validateSessionOnReconnect,
  needsRevalidation,
  cleanupSessionManager,
  type SessionInfo,
  type SessionConfig
} from '@/lib/auth/session-manager';

// ============================================================================
// Reservations Offline
// ============================================================================

export {
  createReservationOffline,
  getReservationById,
  getReservations,
  updateReservationOffline,
  cancelReservationOffline,
  deleteReservationOffline,
  getUpcomingReservations,
  getTodaysReservations,
  getReservationsByStatus,
  getPendingReservationSyncCount,
  syncReservationsFromCloud,
  getAllLocalReservations,
  type CreateReservationInput,
  type UpdateReservationInput,
  type ReservationFilters
} from '@/lib/offline/reservations-offline';

// ============================================================================
// Menu & Tables Offline
// ============================================================================

export {
  // Menu Items
  createMenuItemOffline,
  getMenuItems,
  getMenuItemById,
  getMenuItemsByCategory,
  getAvailableMenuItems,
  updateMenuItemOffline,
  toggleMenuItemAvailability,
  // Categories
  getCategories,
  createCategoryOffline,
  // Tables
  createTableOffline,
  getTables,
  getTableById,
  getTableByNumber,
  getAvailableTables,
  getTablesByLocation,
  updateTableOffline,
  occupyTable,
  releaseTable,
  markTableForCleaning,
  // Sync
  syncMenuFromCloud,
  syncTablesFromCloud,
  type CreateMenuItemInput,
  type UpdateMenuItemInput,
  type CreateTableInput,
  type UpdateTableInput
} from '@/lib/offline/menu-offline';

// ============================================================================
// Orders Offline
// ============================================================================

export {
  createOrderOffline,
  getOrderById,
  getOrderByNumber,
  getOrders,
  updateOrderOffline,
  placeOrder,
  cancelOrder,
  addOrderItem,
  getOrderItems,
  updateOrderItemStatus,
  removeOrderItem,
  getActiveOrders,
  getOrdersByTable,
  getTodaysOrders,
  getPendingOrderSyncCount,
  getKitchenQueue,
  syncOrdersFromCloud,
  type CreateOrderInput,
  type UpdateOrderInput,
  type AddOrderItemInput
} from '@/lib/offline/orders-offline';

// ============================================================================
// Guest Registration Offline
// ============================================================================

export {
  createGuestOffline,
  getGuestById,
  getGuestByEmail,
  getGuestByPhone,
  getGuests,
  searchGuests,
  updateGuestOffline,
  deleteGuestOffline,
  getPendingGuestSyncCount,
  getRecentGuests,
  syncGuestsFromCloud,
  findOrCreateGuest,
  type CreateGuestInput,
  type UpdateGuestInput
} from '@/lib/offline/guest-offline';

// ============================================================================
// Payments Offline
// ============================================================================

export {
  processPaymentOffline,
  getPaymentById,
  getPaymentByOrderId,
  getPaymentByTransactionId,
  getPayments,
  getTodaysPayments,
  getTodaysPaymentTotal,
  getPendingOfflinePayments,
  getPendingOfflinePaymentCount,
  retryPendingPayments,
  refundPayment,
  syncPaymentsFromCloud,
  checkPaymentTerminal,
  processTerminalPayment,
  type ProcessPaymentInput,
  type PaymentResult
} from '@/lib/offline/payment-queue';

// ============================================================================
// Hooks
// ============================================================================

export {
  useOffline,
  type UseOfflineOptions,
  type UseOfflineReturn
} from '@/hooks/useOffline';

// ============================================================================
// Components
// ============================================================================

export { default as OfflineIndicator, CompactOfflineIndicator } from '@/components/OfflineIndicator';

// ============================================================================
// Constants
// ============================================================================

export const OFFLINE_VERSION = '1.0.0';

export const DEFAULT_SYNC_INTERVAL = 45 * 60 * 1000; // 45 minutes

export const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

export const MAX_PAYMENT_RETRIES = 3;

// ============================================================================
// Usage Example
// ============================================================================

/**
 * 
 * // In your Next.js app layout or provider:
 * 
 * 'use client';
 * 
 * import { useOffline } from '@/lib/offline';
 * 
 * function AppProvider({ children }) {
 *   const offline = useOffline({
 *     appwriteClient,
 *     databaseId: 'your-database-id',
 *     autoSync: true,
 *     syncInterval: 45 * 60 * 1000
 *   });
 * 
 *   return (
 *     <>
 *       <OfflineIndicator />
 *       {children}
 *     </>
 *   );
 * }
 * 
 * // Using offline operations:
 * 
 * import { 
 *   createReservationOffline,
 *   createOrderOffline,
 *   processPaymentOffline 
 * } from '@/lib/offline';
 * 
 * // Create reservation (works offline)
 * const reservation = await createReservationOffline({
 *   guestId: 'guest-123',
 *   guestName: 'John Doe',
 *   guestEmail: 'john@example.com',
 *   guestPhone: '+2348000000000',
 *   schedule: '2024-01-15T19:00:00Z',
 *   partySize: 4
 * }, 'user-123');
 * 
 * // Create order
 * const order = await createOrderOffline({
 *   type: 'dine_in',
 *   tableNumber: 5,
 *   customerName: 'John Doe',
 *   waiterName: 'Jane'
 * });
 * 
 * // Process payment
 * const payment = await processPaymentOffline({
 *   orderId: order.id,
 *   amount: 15000,
 *   method: 'card',
 *   customerName: 'John Doe',
 *   processedBy: 'staff-123',
 *   staffName: 'Jane',
 *   subtotal: 12000,
 *   taxAmount: 900,
 *   serviceCharge: 1200
 * });
 * 
 */
