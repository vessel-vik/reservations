/**
 * Network Monitor - Detects online/offline status and triggers sync
 */

import { triggerImmediateSync, type SyncResult } from './sync-engine';
import type { AppwriteClient } from './sync-engine';

// ============================================================================
// Types
// ============================================================================

export type NetworkStatus = 'online' | 'offline' | 'checking';

export interface NetworkState {
  status: NetworkStatus;
  lastChecked: string;
  isOnline: boolean;
}

export interface NetworkEventHandlers {
  onOnline?: () => void;
  onOffline?: () => void;
  onSyncReady?: (result: SyncResult) => void;
  onStatusChange?: (status: NetworkStatus) => void;
}

// ============================================================================
// Configuration
// ============================================================================

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const APPWRITE_ENDPOINT = process.env.NEXT_PUBLIC_ENDPOINT || 'https://cloud.appwrite.io/v1';
const RETRY_DELAYS = [1000, 2000, 5000, 10000];

// ============================================================================
// State
// ============================================================================

let currentStatus: NetworkStatus = 'checking';
let healthCheckIntervalId: ReturnType<typeof setInterval> | null = null;
let eventHandlers: NetworkEventHandlers = {};
let appwriteClient: AppwriteClient | null = null;
let databaseId: string = '';

// ============================================================================
// Event Emitter
// ============================================================================

function emitOnline(): void {
  currentStatus = 'online';
  eventHandlers.onOnline?.();
  eventHandlers.onStatusChange?.('online');
  console.log('🌐 Network: Online');
  
  // Trigger immediate sync when coming back online
  if (appwriteClient && databaseId) {
    triggerImmediateSync(appwriteClient, databaseId)
      .then((result) => {
        eventHandlers.onSyncReady?.(result);
      })
      .catch((error) => {
        console.error('❌ Immediate sync failed:', error);
      });
  }
}

function emitOffline(): void {
  currentStatus = 'offline';
  eventHandlers.onOffline?.();
  eventHandlers.onStatusChange?.('offline');
  console.log('📴 Network: Offline');
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check if we can reach the Appwrite server
 */
async function checkConnectivity(): Promise<boolean> {
  try {
    // Try a simple fetch to the Appwrite endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${APPWRITE_ENDPOINT}/health`, {
      method: 'GET',
      signal: controller.signal,
      mode: 'no-cors'
    });

    clearTimeout(timeoutId);
    
    // With mode: 'no-cors', we get an opaque response which is treated as success
    return true;
  } catch (error) {
    console.log('❌ Health check failed:', error);
    return false;
  }
}

/**
 * Perform comprehensive network check
 */
async function performNetworkCheck(): Promise<void> {
  currentStatus = 'checking';
  eventHandlers.onStatusChange?.('checking');

  // Check navigator.onLine first (fast, unreliable)
  const navigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  
  if (!navigatorOnline) {
    emitOffline();
    return;
  }

  // Then check actual connectivity to Appwrite
  const isConnected = await checkConnectivity();
  
  if (isConnected && currentStatus !== 'online') {
    emitOnline();
  } else if (!isConnected && currentStatus !== 'offline') {
    emitOffline();
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the network monitor
 */
export function initializeNetworkMonitor(
  handlers: NetworkEventHandlers,
  appwrite?: AppwriteClient,
  dbId?: string
): void {
  eventHandlers = handlers;
  appwriteClient = appwrite || null;
  databaseId = dbId || '';

  // Set initial status
  if (typeof navigator !== 'undefined') {
    currentStatus = navigator.onLine ? 'online' : 'offline';
  }

  // Add event listeners for browser online/offline events
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnlineEvent);
    window.addEventListener('offline', handleOfflineEvent);
  }

  // Start periodic health checks
  startHealthCheck();

  console.log('🔌 Network monitor initialized');
}

/**
 * Handle browser online event
 */
function handleOnlineEvent(): void {
  console.log('🌐 Browser: Online event received');
  // Verify with actual health check before declaring online
  performNetworkCheck();
}

/**
 * Handle browser offline event
 */
function handleOfflineEvent(): void {
  console.log('📴 Browser: Offline event received');
  emitOffline();
}

/**
 * Start periodic health checks
 */
export function startHealthCheck(): void {
  if (healthCheckIntervalId) {
    console.log('⚠️ Health check already running');
    return;
  }

  // Initial check
  performNetworkCheck();

  // Schedule periodic checks
  healthCheckIntervalId = setInterval(performNetworkCheck, HEALTH_CHECK_INTERVAL);
  console.log(`❤️ Health check started (every ${HEALTH_CHECK_INTERVAL / 1000}s)`);
}

/**
 * Stop periodic health checks
 */
export function stopHealthCheck(): void {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
    console.log('🛑 Health check stopped');
  }
}

/**
 * Get current network status
 */
export function getNetworkStatus(): NetworkState {
  return {
    status: currentStatus,
    lastChecked: new Date().toISOString(),
    isOnline: currentStatus === 'online'
  };
}

/**
 * Check if currently online
 */
export function isOnline(): boolean {
  return currentStatus === 'online';
}

/**
 * Manually trigger a connectivity check
 */
export async function checkNow(): Promise<boolean> {
  await performNetworkCheck();
  return currentStatus === 'online';
}

/**
 * Update Appwrite client (for when it becomes available)
 */
export function updateAppwriteClient(client: AppwriteClient, dbId: string): void {
  appwriteClient = client;
  databaseId = dbId;
}

/**
 * Clean up network monitor
 */
export function cleanupNetworkMonitor(): void {
  stopHealthCheck();
  
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnlineEvent);
    window.removeEventListener('offline', handleOfflineEvent);
  }
  
  eventHandlers = {};
  appwriteClient = null;
  console.log('🧹 Network monitor cleaned up');
}

// ============================================================================
// Reconnection Helper
// ============================================================================

/**
 * Wait for network to be available with retry logic
 */
export async function waitForNetwork(maxRetries: number = 5): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const isConnected = await checkNow();
    if (isConnected) {
      return true;
    }
    
    if (i < maxRetries - 1) {
      console.log(`⏳ Waiting for network... (attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i] || 10000));
    }
  }
  
  return false;
}
