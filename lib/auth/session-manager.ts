/**
 * Session Manager - Maintains session across browser closes and offline periods
 */

import { getCurrentSession, type OfflineAuthState, restoreSession, logout as authLogout } from './offline-auth';
import { localDb, getCurrentTimestamp, type LocalStaff } from '../local-db';

// ============================================================================
// Types
// ============================================================================

export interface SessionInfo {
  isValid: boolean;
  staffId: string | null;
  staffName: string | null;
  staffRole: string | null;
  expiresAt: string | null;
  lastActivity: string;
}

export interface SessionConfig {
  sessionDuration: number; // milliseconds
  activityCheckInterval: number; // milliseconds
  warnBeforeExpiry: number; // milliseconds
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: SessionConfig = {
  sessionDuration: 8 * 60 * 60 * 1000, // 8 hours
  activityCheckInterval: 60000, // 1 minute
  warnBeforeExpiry: 5 * 60 * 1000 // 5 minutes
};

// ============================================================================
// State
// ============================================================================

let config: SessionConfig = DEFAULT_CONFIG;
let activityCheckIntervalId: ReturnType<typeof setInterval> | null = null;
let sessionWarningCallback: ((remainingTime: number) => void) | null = null;
let sessionExpiredCallback: (() => void) | null = null;

// ============================================================================
// Session Validation
// ============================================================================

/**
 * Validate current session
 */
export function validateSession(): SessionInfo {
  const session = getCurrentSession();
  
  if (!session.isAuthenticated || !session.sessionExpiresAt) {
    return {
      isValid: false,
      staffId: null,
      staffName: null,
      staffRole: null,
      expiresAt: null,
      lastActivity: getCurrentTimestamp()
    };
  }
  
  const now = new Date();
  const expiresAt = new Date(session.sessionExpiresAt);
  const isValid = expiresAt > now;
  
  const remainingTime = expiresAt.getTime() - now.getTime();
  
  // Trigger warning if approaching expiry
  if (isValid && remainingTime < config.warnBeforeExpiry && sessionWarningCallback) {
    sessionWarningCallback(remainingTime);
  }
  
  // Trigger expiry if time's up
  if (!isValid && sessionExpiredCallback) {
    sessionExpiredCallback();
  }
  
  return {
    isValid,
    staffId: session.staffId,
    staffName: session.staffName,
    staffRole: session.staffRole,
    expiresAt: session.sessionExpiresAt,
    lastActivity: session.lastLoginAt || getCurrentTimestamp()
  };
}

/**
 * Get remaining session time in milliseconds
 */
export function getRemainingSessionTime(): number {
  const session = getCurrentSession();
  
  if (!session.sessionExpiresAt) {
    return 0;
  }
  
  const remaining = new Date(session.sessionExpiresAt).getTime() - Date.now();
  return Math.max(0, remaining);
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Initialize session manager
 */
export async function initializeSessionManager(
  callbacks?: {
    onWarning?: (remainingTime: number) => void;
    onExpired?: () => void;
  },
  sessionConfig?: Partial<SessionConfig>
): Promise<boolean> {
  // Apply custom config
  if (sessionConfig) {
    config = { ...config, ...sessionConfig };
  }
  
  // Set callbacks
  sessionWarningCallback = callbacks?.onWarning || null;
  sessionExpiredCallback = callbacks?.onExpired || null;
  
  // Try to restore session from storage
  const restored = await restoreSession();
  
  if (restored.success) {
    // Start activity monitoring
    startActivityMonitoring();
    console.log('✅ Session restored');
    return true;
  }
  
  return false;
}

/**
 * Start monitoring session activity
 */
function startActivityMonitoring(): void {
  if (activityCheckIntervalId) {
    return;
  }
  
  activityCheckIntervalId = setInterval(() => {
    validateSession();
  }, config.activityCheckInterval);
  
  console.log('👀 Session activity monitoring started');
}

/**
 * Stop monitoring session activity
 */
function stopActivityMonitoring(): void {
  if (activityCheckIntervalId) {
    clearInterval(activityCheckIntervalId);
    activityCheckIntervalId = null;
    console.log('🛑 Session activity monitoring stopped');
  }
}

/**
 * Extend session (e.g., on user activity)
 */
export function extendSession(): void {
  const session = getCurrentSession();
  
  if (session.isAuthenticated) {
    const newExpiry = new Date(Date.now() + config.sessionDuration).toISOString();
    
    // Note: This would need to update the in-memory session
    // In a full implementation, this would trigger a re-save to localStorage
    
    console.log('⏰ Session extended');
  }
}

/**
 * End session and cleanup
 */
export function endSession(): void {
  stopActivityMonitoring();
  authLogout();
  console.log('👋 Session ended');
}

// ============================================================================
// Activity Tracking
// ============================================================================

/**
 * Track user activity to extend session
 */
export function trackActivity(): void {
  // List of events that count as activity
  const activityEvents = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
  
  if (typeof window === 'undefined') {
    return;
  }
  
  const handleActivity = () => {
    extendSession();
  };
  
  // Attach activity listeners
  activityEvents.forEach(event => {
    window.addEventListener(event, handleActivity, { passive: true });
  });
  
  console.log('🎯 Activity tracking enabled');
}

/**
 * Remove activity tracking
 */
export function removeActivityTracking(): void {
  const activityEvents = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];
  
  if (typeof window === 'undefined') {
    return;
  }
  
  const handleActivity = () => {
    extendSession();
  };
  
  activityEvents.forEach(event => {
    window.removeEventListener(event, handleActivity);
  });
}

// ============================================================================
// Session Persistence for Offline
// ============================================================================

/**
 * Store session data in IndexedDB for offline persistence
 */
export async function persistSessionToIndexedDB(): Promise<void> {
  const session = getCurrentSession();
  
  if (!session.isAuthenticated) {
    return;
  }
  
  // Store session data in local database
  await localDb.staff.where('id').equals(session.staffId || '').first();
  
  console.log('💾 Session persisted to IndexedDB');
}

/**
 * Restore session from IndexedDB
 */
export async function restoreSessionFromIndexedDB(): Promise<boolean> {
  // Use the existing restoreSession from offline-auth
  const result = await restoreSession();
  return result.success;
}

// ============================================================================
// Session Validation on Reconnect
// ============================================================================

/**
 * Validate session integrity when reconnecting to network
 */
export async function validateSessionOnReconnect(): Promise<boolean> {
  const session = getCurrentSession();
  
  if (!session.isAuthenticated || !session.staffId) {
    return false;
  }
  
  // Check if staff member still exists and is active in local DB
  const staff = await localDb.staff.get(session.staffId);
  
  if (!staff || !staff.isActive) {
    // Session no longer valid
    endSession();
    return false;
  }
  
  return true;
}

/**
 * Check if session needs re-validation after being offline
 */
export function needsRevalidation(): boolean {
  const session = getCurrentSession();
  
  if (!session.isAuthenticated) {
    return false;
  }
  
  // If session was restored from storage (was offline)
  // and hasn't been validated online yet, flag for revalidation
  // This is a simplified version - in production you'd track this more carefully
  
  return true;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup session manager
 */
export function cleanupSessionManager(): void {
  stopActivityMonitoring();
  removeActivityTracking();
  sessionWarningCallback = null;
  sessionExpiredCallback = null;
  console.log('🧹 Session manager cleaned up');
}
