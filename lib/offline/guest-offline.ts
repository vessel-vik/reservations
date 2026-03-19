/**
 * Guest Registration Offline - Register new guests without internet
 */

import { localDb, generateOfflineId, generateChecksum, getCurrentTimestamp, type LocalGuest } from '../local-db';
import { queueMutation } from '../sync/sync-engine';
import { isOnline } from '../sync/network-monitor';

// ============================================================================
// Types
// ============================================================================

export interface CreateGuestInput {
  userId?: string;
  name: string;
  email: string;
  phone: string;
  birthDate?: string;
  gender?: string;
  address?: string;
  occupation?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
  preferredTable?: string;
  dietaryRestrictions?: string;
  specialRequests?: string;
  allergies?: string;
  favoriteItems?: string;
  identificationType?: string;
  identificationNumber?: string;
  privacyConsent?: boolean;
  marketingConsent?: boolean;
  newsletterConsent?: boolean;
}

export interface UpdateGuestInput {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
  address?: string;
  occupation?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
  preferredTable?: string;
  dietaryRestrictions?: string;
  specialRequests?: string;
  allergies?: string;
  favoriteItems?: string;
  identificationType?: string;
  identificationNumber?: string;
  privacyConsent?: boolean;
  marketingConsent?: boolean;
  newsletterConsent?: boolean;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new guest (works offline)
 */
export async function createGuestOffline(
  input: CreateGuestInput
): Promise<LocalGuest> {
  const id = generateOfflineId('GUEST');
  const now = getCurrentTimestamp();
  
  const guest: LocalGuest = {
    id,
    userId: input.userId || id,
    name: input.name,
    email: input.email,
    phone: input.phone,
    birthDate: input.birthDate || '',
    gender: input.gender || '',
    address: input.address || '',
    occupation: input.occupation || '',
    emergencyContactName: input.emergencyContactName || '',
    emergencyContactNumber: input.emergencyContactNumber || '',
    preferredTable: input.preferredTable || '',
    dietaryRestrictions: input.dietaryRestrictions || '',
    specialRequests: input.specialRequests || '',
    allergies: input.allergies,
    favoriteItems: input.favoriteItems,
    privacyConsent: input.privacyConsent ?? false,
    marketingConsent: input.marketingConsent ?? false,
    newsletterConsent: input.newsletterConsent ?? false,
    createdAt: now,
    updatedAt: now,
    syncStatus: isOnline() ? 'synced' : 'pending',
    checksum: ''
  };
  
  guest.checksum = generateChecksum(guest as unknown as Record<string, unknown>);
  
  await localDb.guests.put(guest);
  
  if (!isOnline()) {
    await queueMutation('guests', 'create', id, guest as unknown as Record<string, unknown>);
  }
  
  console.log(`📝 Created guest ${input.name} (${isOnline() ? 'online' : 'offline'})`);
  
  return guest;
}

/**
 * Get guest by ID
 */
export async function getGuestById(id: string): Promise<LocalGuest | undefined> {
  return localDb.guests.get(id);
}

/**
 * Get guest by email
 */
export async function getGuestByEmail(email: string): Promise<LocalGuest | undefined> {
  return localDb.guests
    .filter(guest => guest.email.toLowerCase() === email.toLowerCase())
    .first();
}

/**
 * Get guest by phone
 */
export async function getGuestByPhone(phone: string): Promise<LocalGuest | undefined> {
  return localDb.guests
    .filter(guest => guest.phone === phone)
    .first();
}

/**
 * Get all guests
 */
export async function getGuests(
  limit?: number
): Promise<LocalGuest[]> {
  let query = localDb.guests.orderBy('createdAt').reverse();
  
  if (limit) {
    return query.limit(limit).toArray();
  }
  
  return query.toArray();
}

/**
 * Search guests by name or phone
 */
export async function searchGuests(searchTerm: string): Promise<LocalGuest[]> {
  const term = searchTerm.toLowerCase();
  
  return localDb.guests
    .filter(guest => 
      guest.name.toLowerCase().includes(term) ||
      guest.phone.includes(term) ||
      guest.email.toLowerCase().includes(term)
    )
    .toArray();
}

/**
 * Update a guest
 */
export async function updateGuestOffline(
  input: UpdateGuestInput
): Promise<LocalGuest | undefined> {
  const existing = await localDb.guests.get(input.id);
  
  if (!existing) {
    console.error(`Guest ${input.id} not found`);
    return undefined;
  }
  
  const updated: LocalGuest = {
    ...existing,
    ...(input.name && { name: input.name }),
    ...(input.email && { email: input.email }),
    ...(input.phone && { phone: input.phone }),
    ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
    ...(input.gender !== undefined && { gender: input.gender }),
    ...(input.address !== undefined && { address: input.address }),
    ...(input.occupation !== undefined && { occupation: input.occupation }),
    ...(input.emergencyContactName !== undefined && { emergencyContactName: input.emergencyContactName }),
    ...(input.emergencyContactNumber !== undefined && { emergencyContactNumber: input.emergencyContactNumber }),
    ...(input.preferredTable !== undefined && { preferredTable: input.preferredTable }),
    ...(input.dietaryRestrictions !== undefined && { dietaryRestrictions: input.dietaryRestrictions }),
    ...(input.specialRequests !== undefined && { specialRequests: input.specialRequests }),
    ...(input.allergies !== undefined && { allergies: input.allergies }),
    ...(input.favoriteItems !== undefined && { favoriteItems: input.favoriteItems }),
    ...(input.identificationType !== undefined && { identificationType: input.identificationType }),
    ...(input.identificationNumber !== undefined && { identificationNumber: input.identificationNumber }),
    ...(input.privacyConsent !== undefined && { privacyConsent: input.privacyConsent }),
    ...(input.marketingConsent !== undefined && { marketingConsent: input.marketingConsent }),
    ...(input.newsletterConsent !== undefined && { newsletterConsent: input.newsletterConsent }),
    updatedAt: getCurrentTimestamp(),
    syncStatus: isOnline() ? 'synced' : 'pending'
  };
  
  updated.checksum = generateChecksum(updated as unknown as Record<string, unknown>);
  
  await localDb.guests.put(updated);
  
  if (!isOnline()) {
    await queueMutation('guests', 'update', input.id, updated as unknown as Record<string, unknown>);
  }
  
  console.log(`✏️ Updated guest ${input.id} (${isOnline() ? 'online' : 'offline'})`);
  
  return updated;
}

/**
 * Delete a guest (soft delete)
 */
export async function deleteGuestOffline(id: string): Promise<void> {
  const guest = await localDb.guests.get(id);
  
  if (guest) {
    await updateGuestOffline({
      id,
      // Mark as inactive - in practice you'd add an isActive field
    });
  }
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get guests with pending sync
 */
export async function getPendingGuestSyncCount(): Promise<number> {
  return localDb.guests
    .filter(guest => guest.syncStatus === 'pending')
    .count();
}

/**
 * Get recently registered guests
 */
export async function getRecentGuests(limit: number = 10): Promise<LocalGuest[]> {
  return localDb.guests
    .orderBy('createdAt')
    .reverse()
    .limit(limit)
    .toArray();
}

// ============================================================================
// Sync Helpers
// ============================================================================

/**
 * Sync guests from cloud
 */
export async function syncGuestsFromCloud(
  cloudGuests: LocalGuest[]
): Promise<number> {
  let synced = 0;
  
  for (const cloudGuest of cloudGuests) {
    const local = await localDb.guests.get(cloudGuest.id);
    
    if (!local) {
      await localDb.guests.put({
        ...cloudGuest,
        syncStatus: 'synced'
      });
      synced++;
    } else if (local.syncStatus === 'synced') {
      if (local.checksum !== cloudGuest.checksum) {
        await localDb.guests.put({
          ...cloudGuest,
          syncStatus: 'synced'
        });
        synced++;
      }
    }
  }
  
  return synced;
}

/**
 * Find or create guest
 */
export async function findOrCreateGuest(input: CreateGuestInput): Promise<LocalGuest> {
  // Try to find by email
  const existingByEmail = await getGuestByEmail(input.email);
  if (existingByEmail) {
    return existingByEmail;
  }
  
  // Try to find by phone
  const existingByPhone = await getGuestByPhone(input.phone);
  if (existingByPhone) {
    return existingByPhone;
  }
  
  // Create new guest
  return createGuestOffline(input);
}
