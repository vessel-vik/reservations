/**
 * Reservations Offline - Full reservation CRUD without internet
 */

import { localDb, generateOfflineId, generateChecksum, getCurrentTimestamp, type LocalReservation } from '../local-db';
import { queueMutation } from '../sync/sync-engine';
import { isOnline } from '../sync/network-monitor';

// ============================================================================
// Types
// ============================================================================

export interface CreateReservationInput {
  guestId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  schedule: string;
  tablePreference?: string;
  occasion?: string;
  note?: string;
  partySize: number;
  specialRequests?: string;
  welcomeDrink?: string;
}

export interface UpdateReservationInput {
  id: string;
  schedule?: string;
  status?: LocalReservation['status'];
  tablePreference?: string;
  occasion?: string;
  note?: string;
  partySize?: number;
  specialRequests?: string;
  welcomeDrink?: string;
  cancellationReason?: string;
}

export interface ReservationFilters {
  status?: LocalReservation['status'];
  date?: string;
  guestId?: string;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new reservation (works offline)
 */
export async function createReservationOffline(
  input: CreateReservationInput,
  userId: string
): Promise<LocalReservation> {
  const id = generateOfflineId('RES');
  const now = getCurrentTimestamp();
  
  const reservation: LocalReservation = {
    id,
    guestId: input.guestId,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    guestPhone: input.guestPhone,
    schedule: input.schedule,
    status: 'pending',
    tablePreference: input.tablePreference || '',
    occasion: input.occasion || '',
    note: input.note || '',
    partySize: input.partySize,
    userId,
    specialRequests: input.specialRequests,
    welcomeDrink: input.welcomeDrink,
    createdAt: now,
    updatedAt: now,
    syncStatus: isOnline() ? 'synced' : 'pending',
    checksum: ''
  };
  
  // Generate checksum
  reservation.checksum = generateChecksum(reservation as unknown as Record<string, unknown>);
  
  // Save to local database
  await localDb.reservations.put(reservation);
  
  // Queue for sync if offline
  if (!isOnline()) {
    await queueMutation('reservations', 'create', id, reservation as unknown as Record<string, unknown>);
  }
  
  console.log(`📝 Created reservation ${id} (${isOnline() ? 'online' : 'offline'})`);
  
  return reservation;
}

/**
 * Get reservation by ID
 */
export async function getReservationById(id: string): Promise<LocalReservation | undefined> {
  return localDb.reservations.get(id);
}

/**
 * Get all reservations with optional filters
 */
export async function getReservations(
  filters?: ReservationFilters
): Promise<LocalReservation[]> {
  let query = localDb.reservations.orderBy('schedule');
  
  const allReservations = await query.toArray();
  
  // Apply filters in memory
  let filtered = allReservations;
  
  if (filters?.status) {
    filtered = filtered.filter(r => r.status === filters.status);
  }
  
  if (filters?.date) {
    const dateStr = filters.date.split('T')[0];
    filtered = filtered.filter(r => r.schedule.startsWith(dateStr));
  }
  
  if (filters?.guestId) {
    filtered = filtered.filter(r => r.guestId === filters.guestId);
  }
  
  return filtered;
}

/**
 * Update a reservation
 */
export async function updateReservationOffline(
  input: UpdateReservationInput
): Promise<LocalReservation | undefined> {
  const existing = await localDb.reservations.get(input.id);
  
  if (!existing) {
    console.error(`Reservation ${input.id} not found`);
    return undefined;
  }
  
  const updated: LocalReservation = {
    ...existing,
    ...(input.schedule && { schedule: input.schedule }),
    ...(input.status && { status: input.status }),
    ...(input.tablePreference !== undefined && { tablePreference: input.tablePreference }),
    ...(input.occasion !== undefined && { occasion: input.occasion }),
    ...(input.note !== undefined && { note: input.note }),
    ...(input.partySize && { partySize: input.partySize }),
    ...(input.specialRequests !== undefined && { specialRequests: input.specialRequests }),
    ...(input.welcomeDrink !== undefined && { welcomeDrink: input.welcomeDrink }),
    ...(input.cancellationReason !== undefined && { cancellationReason: input.cancellationReason }),
    updatedAt: getCurrentTimestamp(),
    syncStatus: isOnline() ? 'synced' : 'pending'
  };
  
  // Generate new checksum
  updated.checksum = generateChecksum(updated as unknown as Record<string, unknown>);
  
  // Save to local database
  await localDb.reservations.put(updated);
  
  // Queue for sync if offline
  if (!isOnline()) {
    await queueMutation('reservations', 'update', input.id, updated as unknown as Record<string, unknown>);
  }
  
  console.log(`✏️ Updated reservation ${input.id} (${isOnline() ? 'online' : 'offline'})`);
  
  return updated;
}

/**
 * Cancel a reservation
 */
export async function cancelReservationOffline(
  id: string,
  reason?: string
): Promise<LocalReservation | undefined> {
  return updateReservationOffline({
    id,
    status: 'cancelled',
    cancellationReason: reason
  });
}

/**
 * Delete a reservation (soft delete)
 */
export async function deleteReservationOffline(
  id: string
): Promise<void> {
  await updateReservationOffline({
    id,
    status: 'cancelled'
  });
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get upcoming reservations
 */
export async function getUpcomingReservations(
  limit: number = 50
): Promise<LocalReservation[]> {
  const now = new Date().toISOString();
  
  return localDb.reservations
    .where('schedule')
    .above(now)
    .filter(r => r.status !== 'cancelled' && r.status !== 'completed')
    .limit(limit)
    .toArray();
}

/**
 * Get today's reservations
 */
export async function getTodaysReservations(): Promise<LocalReservation[]> {
  const today = new Date().toISOString().split('T')[0];
  
  return localDb.reservations
    .filter(r => r.schedule.startsWith(today))
    .toArray();
}

/**
 * Get reservations by status
 */
export async function getReservationsByStatus(
  status: LocalReservation['status']
): Promise<LocalReservation[]> {
  return localDb.reservations
    .filter(r => r.status === status)
    .toArray();
}

/**
 * Get pending sync count for reservations
 */
export async function getPendingReservationSyncCount(): Promise<number> {
  return localDb.reservations
    .filter(r => r.syncStatus === 'pending')
    .count();
}

// ============================================================================
// Sync Helpers
// ============================================================================

/**
 * Sync reservations from cloud
 */
export async function syncReservationsFromCloud(
  cloudData: LocalReservation[]
): Promise<number> {
  let synced = 0;
  
  for (const cloudReservation of cloudData) {
    const local = await localDb.reservations.get(cloudReservation.id);
    
    if (!local) {
      // New from cloud
      await localDb.reservations.put({
        ...cloudReservation,
        syncStatus: 'synced'
      });
      synced++;
    } else if (local.syncStatus === 'synced') {
      // Both synced, update if different
      if (local.checksum !== cloudReservation.checksum) {
        await localDb.reservations.put({
          ...cloudReservation,
          syncStatus: 'synced'
        });
        synced++;
      }
    }
    // If local has pending changes, skip (conflict resolution handles this)
  }
  
  return synced;
}

/**
 * Get all local reservations for initial sync
 */
export async function getAllLocalReservations(): Promise<LocalReservation[]> {
  return localDb.reservations.toArray();
}
