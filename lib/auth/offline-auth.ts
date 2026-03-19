/**
 * Offline Authentication Store
 * Enables staff login without internet using cached credentials
 */

import { localDb, generateChecksum, getCurrentTimestamp, type LocalStaff } from '../local-db';
import { isOnline } from '../sync/network-monitor';

// ============================================================================
// Types
// ============================================================================

export interface OfflineAuthState {
  isAuthenticated: boolean;
  staffId: string | null;
  staffName: string | null;
  staffRole: string | null;
  permissions: string[];
  sessionExpiresAt: string | null;
  lastLoginAt: string | null;
}

export interface StaffCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  staff?: LocalStaff;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours
const CREDENTIALS_KEY = 'offline_auth_credentials';
const SESSION_KEY = 'offline_auth_session';

// ============================================================================
// Encryption Helpers (Web Crypto API)
// ============================================================================

/**
 * Generate encryption key from PIN
 */
async function deriveKey(pin: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('ScanNServeSalt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with PIN-based key
 */
async function encryptData(data: string, pin: string): Promise<string> {
  const key = await deriveKey(pin);
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data with PIN-based key
 */
async function decryptData(encryptedData: string, pin: string): Promise<string> {
  const key = await deriveKey(pin);
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Store session data in memory
 */
let currentSession: OfflineAuthState = {
  isAuthenticated: false,
  staffId: null,
  staffName: null,
  staffRole: null,
  permissions: [],
  sessionExpiresAt: null,
  lastLoginAt: null
};

/**
 * Get current session state
 */
export function getCurrentSession(): OfflineAuthState {
  return { ...currentSession };
}

/**
 * Check if session is valid
 */
export function isSessionValid(): boolean {
  if (!currentSession.isAuthenticated || !currentSession.sessionExpiresAt) {
    return false;
  }
  
  return new Date(currentSession.sessionExpiresAt) > new Date();
}

/**
 * Clear current session
 */
function clearSession(): void {
  currentSession = {
    isAuthenticated: false,
    staffId: null,
    staffName: null,
    staffRole: null,
    permissions: [],
    sessionExpiresAt: null,
    lastLoginAt: null
  };
  
  // Clear from storage
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}

// ============================================================================
// Authentication Methods
// ============================================================================

/**
 * Authenticate staff member (works offline with PIN or online with password)
 */
export async function authenticateStaff(
  email: string,
  passwordOrPin: string,
  usePin: boolean = false
): Promise<AuthResult> {
  // Try to find staff by email
  const staff = await localDb.staff.where('email').equals(email).first();
  
  if (!staff) {
    // If online, try cloud authentication
    if (isOnline()) {
      return { success: false, error: 'Staff not found locally. Please sync data first.' };
    }
    return { success: false, error: 'Staff member not found. Please sync data while online.' };
  }
  
  if (!staff.isActive) {
    return { success: false, error: 'Staff account is inactive' };
  }
  
  let authenticated = false;
  
  if (usePin && staff.pin) {
    // PIN-based authentication (offline)
    authenticated = staff.pin === passwordOrPin;
  } else if (staff.passwordHash) {
    // Password-based authentication (with hash comparison)
    const inputHash = generateChecksum({ password: passwordOrPin });
    authenticated = staff.passwordHash === inputHash;
  }
  
  if (!authenticated) {
    return { success: false, error: 'Invalid credentials' };
  }
  
  // Create session
  const sessionExpiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();
  
  currentSession = {
    isAuthenticated: true,
    staffId: staff.id,
    staffName: staff.name,
    staffRole: staff.role,
    permissions: staff.permissions,
    sessionExpiresAt,
    lastLoginAt: getCurrentTimestamp()
  };
  
  // Store session in localStorage for persistence
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    } catch (e) {
      console.warn('Failed to persist session:', e);
    }
  }
  
  return { success: true, staff };
}

/**
 * Restore session from storage
 */
export async function restoreSession(): Promise<AuthResult> {
  if (typeof localStorage === 'undefined') {
    return { success: false, error: 'localStorage not available' };
  }
  
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) {
    return { success: false, error: 'No stored session' };
  }
  
  try {
    const session: OfflineAuthState = JSON.parse(stored);
    
    // Check if session is still valid
    if (session.sessionExpiresAt && new Date(session.sessionExpiresAt) > new Date()) {
      currentSession = session;
      return { success: true };
    }
    
    // Session expired
    clearSession();
    return { success: false, error: 'Session expired' };
  } catch (e) {
    clearSession();
    return { success: false, error: 'Invalid session data' };
  }
}

/**
 * Logout current user
 */
export function logout(): void {
  clearSession();
  console.log('👋 User logged out');
}

/**
 * Check if user has specific permission
 */
export function hasPermission(permission: string): boolean {
  return currentSession.permissions.includes(permission) || 
         currentSession.permissions.includes('*');
}

/**
 * Check if user has specific role
 */
export function hasRole(role: string): boolean {
  return currentSession.staffRole === role;
}

// ============================================================================
// Staff Credential Caching
// ============================================================================

/**
 * Cache staff credentials for offline use (after online login)
 */
export async function cacheStaffCredentials(staff: LocalStaff, pin?: string): Promise<void> {
  const staffData = {
    ...staff,
    syncStatus: 'synced' as const,
    passwordHash: staff.passwordHash, // Store hash, not plaintext
    pin: pin ? await encryptData(pin, staff.id) : undefined
  };
  
  await localDb.staff.put(staffData);
  console.log(`📋 Cached credentials for ${staff.email}`);
}

/**
 * Get cached staff list for offline login
 */
export async function getCachedStaffList(): Promise<LocalStaff[]> {
  return localDb.staff.where('isActive').equals(1).toArray();
}

/**
 * Update staff PIN for offline access
 */
export async function updateStaffPin(staffId: string, newPin: string): Promise<boolean> {
  const staff = await localDb.staff.get(staffId);
  if (!staff) {
    return false;
  }
  
  staff.pin = newPin;
  staff.updatedAt = getCurrentTimestamp();
  staff.syncStatus = 'pending';
  
  await localDb.staff.put(staff);
  return true;
}

// ============================================================================
// Sync Integration
// ============================================================================

/**
 * Sync staff data from cloud
 */
export async function syncStaffFromCloud(staffData: LocalStaff[]): Promise<number> {
  let synced = 0;
  
  for (const staff of staffData) {
    const existing = await localDb.staff.get(staff.id);
    
    if (!existing || existing.syncStatus === 'synced') {
      // New or previously synced - update with cloud data
      await localDb.staff.put({
        ...staff,
        syncStatus: 'synced'
      });
      synced++;
    }
    // If local has pending changes, keep local version
  }
  
  return synced;
}

// ============================================================================
// Export Default State
// ============================================================================

export const defaultAuthState: OfflineAuthState = {
  isAuthenticated: false,
  staffId: null,
  staffName: null,
  staffRole: null,
  permissions: [],
  sessionExpiresAt: null,
  lastLoginAt: null
};
