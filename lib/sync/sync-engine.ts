/**
 * Sync Engine - Core sync logic with delta updates and conflict resolution
 * Handles synchronization between local IndexedDB and cloud Appwrite
 */

import { localDb, generateChecksum, getCurrentTimestamp, type SyncQueueItem, type SyncMetadata, type LocalGuest, type LocalReservation, type LocalMenuItem, type LocalTable, type LocalOrder, type LocalPayment } from '../local-db';

// ============================================================================
// Configuration
// ============================================================================

const SYNC_INTERVAL = 45 * 60 * 1000; // 45 minutes
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface ConflictResolution {
  localWins: boolean;
  resolvedData: Record<string, unknown>;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface AppwriteClient {
  databases: {
    listDocuments: (databaseId: string, collectionId: string, queries?: string[]) => Promise<{ documents: unknown[] }>;
    createDocument: (databaseId: string, collectionId: string, data: Record<string, unknown>) => Promise<unknown>;
    updateDocument: (databaseId: string, collectionId: string, data: Record<string, unknown>) => Promise<unknown>;
    deleteDocument: (databaseId: string, collectionId: string) => Promise<void>;
  };
}

// ============================================================================
// Sync Queue Management
// ============================================================================

/**
 * Add a mutation to the sync queue
 */
export async function queueMutation(
  collection: string,
  operation: 'create' | 'update' | 'delete',
  recordId: string,
  data: Record<string, unknown>
): Promise<void> {
  const checksum = generateChecksum(data);
  
  const queueItem: SyncQueueItem = {
    id: `${collection}-${recordId}-${Date.now()}`,
    collection,
    operation,
    recordId,
    data,
    timestamp: getCurrentTimestamp(),
    retries: 0,
    checksum
  };

  await localDb.syncQueue.put(queueItem);
  console.log(`📝 Queued ${operation} for ${collection}:${recordId}`);
}

/**
 * Get all pending sync items
 */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  return localDb.syncQueue.orderBy('timestamp').toArray();
}

/**
 * Get count of pending sync items
 */
export async function getPendingSyncCount(): Promise<number> {
  return localDb.syncQueue.count();
}

/**
 * Remove item from sync queue
 */
export async function removeSyncQueueItem(id: string): Promise<void> {
  await localDb.syncQueue.delete(id);
}

/**
 * Update sync queue item retry count
 */
export async function incrementRetryCount(id: string, error: string): Promise<void> {
  const item = await localDb.syncQueue.get(id);
  if (item) {
    item.retries += 1;
    item.lastError = error;
    await localDb.syncQueue.put(item);
  }
}

// ============================================================================
// Delta Sync - Pull Changes from Cloud
// ============================================================================

/**
 * Pull changes from Appwrite since last sync
 */
export async function pullChanges(
  appwrite: AppwriteClient,
  databaseId: string,
  collectionId: string,
  since?: string
): Promise<unknown[]> {
  try {
    const queries: string[] = [];
    
    if (since) {
      // Query for updated documents since the last sync
      queries.push(`createdAt[>=]${since}`);
    }

    const response = await appwrite.databases.listDocuments(
      databaseId,
      collectionId,
      queries.length > 0 ? queries : undefined
    );

    return response.documents;
  } catch (error) {
    console.error(`❌ Failed to pull changes from ${collectionId}:`, error);
    throw error;
  }
}

/**
 * Process pulled changes and update local database
 */
export async function processPulledChanges(
  collection: string,
  remoteData: unknown[]
): Promise<number> {
  let updated = 0;

  for (const doc of remoteData as Record<string, unknown>[]) {
    const remoteChecksum = generateChecksum(doc);
    const existingItem = await getLocalItem(collection, doc.$id as string);

    if (!existingItem) {
      // New item from cloud - add to local
      await addLocalItem(collection, doc);
      updated++;
    } else if (existingItem.syncStatus === 'synced') {
      // Item was synced before - update if different
      const localChecksum = existingItem.checksum || '';
      if (remoteChecksum !== localChecksum) {
        await updateLocalItem(collection, doc);
        updated++;
      }
    }
    // If local has pending changes, conflict resolution will handle it
  }

  return updated;
}

// ============================================================================
// Process Queue - Push Changes to Cloud
// ============================================================================

/**
 * Process sync queue and push changes to cloud
 */
export async function processQueue(
  appwrite: AppwriteClient,
  databaseId: string
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    errors: []
  };

  const pendingItems = await getPendingSyncItems();

  for (const item of pendingItems) {
    if (item.retries >= MAX_RETRIES) {
      result.errors.push(`Max retries exceeded for ${item.collection}:${item.recordId}`);
      continue;
    }

    try {
      const success = await pushMutation(appwrite, databaseId, item);
      
      if (success) {
        await removeSyncQueueItem(item.id);
        
        // Mark local item as synced
        await markAsSynced(item.collection, item.recordId, item.checksum);
        result.pushed++;
      } else {
        await incrementRetryCount(item.id, 'Push failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await incrementRetryCount(item.id, errorMessage);
      result.errors.push(`${item.collection}:${item.recordId} - ${errorMessage}`);
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Push a single mutation to cloud
 */
async function pushMutation(
  appwrite: AppwriteClient,
  databaseId: string,
  item: SyncQueueItem
): Promise<boolean> {
  const collectionMap: Record<string, string> = {
    guests: process.env.NEXT_PUBLIC_PATIENT_COLLECTION_ID || 'guests',
    reservations: process.env.NEXT_PUBLIC_APPOINTMENT_COLLECTION_ID || 'reservations',
    menuItems: 'menu_items',
    tables: 'tables',
    orders: 'orders',
    payments: 'payments',
    staff: 'staff'
  };

  const collectionId = collectionMap[item.collection];
  if (!collectionId) {
    console.warn(`Unknown collection: ${item.collection}`);
    return false;
  }

  try {
    switch (item.operation) {
      case 'create':
        await appwrite.databases.createDocument(databaseId, collectionId, item.data);
        break;
      case 'update':
        await appwrite.databases.updateDocument(databaseId, collectionId, item.data);
        break;
      case 'delete':
        await appwrite.databases.deleteDocument(databaseId, collectionId);
        break;
    }
    return true;
  } catch (error) {
    console.error(`Failed to push ${item.operation} for ${item.collection}:${item.recordId}:`, error);
    return false;
  }
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Resolve conflict using last-write-wins with checksums
 */
export function resolveConflict(
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): ConflictResolution {
  const localUpdated = (local.updatedAt as string) || (local.createdAt as string) || '';
  const remoteUpdated = (remote.updatedAt as string) || (remote.createdAt as string) || '';

  // Last write wins based on timestamp
  if (localUpdated >= remoteUpdated) {
    return {
      localWins: true,
      resolvedData: local
    };
  }

  return {
    localWins: false,
    resolvedData: remote
  };
}

/**
 * Mark a local item as synced
 */
async function markAsSynced(
  collection: string,
  recordId: string,
  checksum: string
): Promise<void> {
  const table = getTableForCollection(collection);
  if (table) {
    await table.update(recordId, {
      syncStatus: 'synced',
      checksum
    });
  }
}

// ============================================================================
// Sync Metadata
// ============================================================================

/**
 * Get last sync timestamp for a collection
 */
export async function getLastSyncTimestamp(collection: string): Promise<string | null> {
  const metadata = await localDb.syncMetadata.get(collection);
  return metadata?.lastSyncTimestamp || null;
}

/**
 * Update sync metadata for a collection
 */
export async function updateSyncMetadata(
  collection: string,
  recordCount: number
): Promise<void> {
  const metadata: SyncMetadata = {
    id: collection,
    collection,
    lastSyncTimestamp: getCurrentTimestamp(),
    recordCount
  };

  await localDb.syncMetadata.put(metadata);
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTableForCollection(collection: string) {
  const tableMap: Record<string, typeof localDb.guests | typeof localDb.reservations | typeof localDb.menuItems | typeof localDb.tables | typeof localDb.orders | typeof localDb.payments | typeof localDb.staff> = {
    guests: localDb.guests,
    reservations: localDb.reservations,
    menuItems: localDb.menuItems,
    tables: localDb.tables,
    orders: localDb.orders,
    payments: localDb.payments,
    staff: localDb.staff
  };
  return tableMap[collection];
}

async function getLocalItem(collection: string, id: string): Promise<Record<string, unknown> | undefined> {
  const table = getTableForCollection(collection);
  if (table) {
    return table.get(id) as Promise<Record<string, unknown> | undefined>;
  }
  return undefined;
}

async function addLocalItem(collection: string, data: Record<string, unknown>): Promise<void> {
  const table = getTableForCollection(collection);
  if (table) {
    await table.put({
      ...data,
      syncStatus: 'synced',
      checksum: generateChecksum(data)
    } as never);
  }
}

async function updateLocalItem(collection: string, data: Record<string, unknown>): Promise<void> {
  const table = getTableForCollection(collection);
  if (table && data.$id) {
    await table.update(data.$id as string, {
      ...data,
      syncStatus: 'synced',
      checksum: generateChecksum(data)
    });
  }
}

// ============================================================================
// Full Sync
// ============================================================================

/**
 * Perform a full sync (pull + push)
 */
export async function performFullSync(
  appwrite: AppwriteClient,
  databaseId: string
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    errors: []
  };

  const collections = ['guests', 'reservations', 'menuItems', 'tables', 'orders', 'payments', 'staff'];

  for (const collection of collections) {
    try {
      // Pull changes from cloud
      const lastSync = await getLastSyncTimestamp(collection);
      const remoteData = await pullChanges(appwrite, databaseId, collection, lastSync || undefined);
      
      if (remoteData.length > 0) {
        const pulled = await processPulledChanges(collection, remoteData);
        result.pulled += pulled;
      }

      // Update sync metadata
      await updateSyncMetadata(collection, remoteData.length);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to sync ${collection}: ${errorMessage}`);
    }
  }

  // Push local changes
  const pushResult = await processQueue(appwrite, databaseId);
  result.pushed = pushResult.pushed;
  result.errors.push(...pushResult.errors);

  result.success = result.errors.length === 0;
  return result;
}

// ============================================================================
// Sync Scheduler
// ============================================================================

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let currentSyncStatus: SyncStatus = 'idle';

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

/**
 * Start scheduled sync (every 45 minutes)
 */
export function startScheduledSync(
  appwrite: AppwriteClient,
  databaseId: string,
  onSyncComplete?: (result: SyncResult) => void
): void {
  if (syncIntervalId) {
    console.log('⚠️ Scheduled sync already running');
    return;
  }

  // Initial sync
  performFullSync(appwrite, databaseId).then((result) => {
    onSyncComplete?.(result);
  });

  // Schedule recurring sync
  syncIntervalId = setInterval(async () => {
    currentSyncStatus = 'syncing';
    const result = await performFullSync(appwrite, databaseId);
    currentSyncStatus = result.success ? 'idle' : 'error';
    onSyncComplete?.(result);
  }, SYNC_INTERVAL);

  console.log(`🔄 Scheduled sync started (every ${SYNC_INTERVAL / 60000} minutes)`);
}

/**
 * Stop scheduled sync
 */
export function stopScheduledSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('🛑 Scheduled sync stopped');
  }
}

/**
 * Trigger immediate sync
 */
export async function triggerImmediateSync(
  appwrite: AppwriteClient,
  databaseId: string
): Promise<SyncResult> {
  currentSyncStatus = 'syncing';
  const result = await performFullSync(appwrite, databaseId);
  currentSyncStatus = result.success ? 'idle' : 'error';
  return result;
}
