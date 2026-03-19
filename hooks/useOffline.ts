/**
 * Offline Integration Hook - Ties together all offline features
 * Use this hook in your Next.js app to enable offline functionality
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { initializeLocalDB, clearLocalDB } from '@/lib/local-db';
import { initializeNetworkMonitor, getNetworkStatus, isOnline } from '@/lib/sync/network-monitor';
import { initializeSessionManager, validateSession, getCurrentSession, endSession } from '@/lib/auth/session-manager';
import { performInitialSync, seedDefaultData, isFirstRun, markInitialSyncComplete } from '@/lib/sync/initial-sync';
import { getPendingSyncCount, triggerImmediateSync, type SyncResult } from '@/lib/sync/sync-engine';
import type { NetworkStatus } from '@/lib/sync/network-monitor';

// ============================================================================
// Types
// ============================================================================

export interface UseOfflineOptions {
  appwriteClient?: unknown;
  databaseId?: string;
  autoSync?: boolean;
  syncInterval?: number;
}

export interface UseOfflineReturn {
  isInitialized: boolean;
  isOnline: boolean;
  networkStatus: NetworkStatus;
  pendingSyncCount: number;
  isFirstRun: boolean;
  lastInitialSync: string | null;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  error: string | null;
  initialize: () => Promise<void>;
  sync: () => Promise<SyncResult | null>;
  clearData: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useOffline(options: UseOfflineOptions = {}): UseOfflineReturn {
  const {
    appwriteClient,
    databaseId,
    autoSync = true,
    syncInterval = 45 * 60 * 1000 // 45 minutes
  } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('checking');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isFirstRunState, setIsFirstRunState] = useState(false);
  const [lastInitialSync, setLastInitialSync] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize offline system
  const initialize = useCallback(async () => {
    try {
      setError(null);

      // Initialize local database
      await initializeLocalDB();
      console.log('✅ Local database initialized');

      // Check if first run
      const firstRun = isFirstRun();
      setIsFirstRunState(firstRun);

      if (firstRun) {
        console.log('🚀 First run detected, seeding default data...');
        
        // Try to sync from cloud if client provided
        if (appwriteClient && databaseId) {
          try {
            const syncResult = await performInitialSync(
              appwriteClient as any,
              databaseId
            );
            
            if (syncResult.success) {
              console.log('☁️ Initial cloud sync complete');
              setLastInitialSync(new Date().toISOString());
            } else {
              console.warn('⚠️ Cloud sync failed, using default data');
              await seedDefaultData();
            }
          } catch (syncError) {
            console.warn('⚠️ Cloud sync error, using default data:', syncError);
            await seedDefaultData();
          }
        } else {
          // No client provided, seed default data
          await seedDefaultData();
          setLastInitialSync(new Date().toISOString());
        }
      } else {
        const lastSync = localStorage.getItem('scan_n_serve_initial_sync_complete');
        setLastInitialSync(lastSync);
      }

      // Initialize network monitor
      initializeNetworkMonitor(
        {
          onOnline: () => setNetworkStatus('online'),
          onOffline: () => setNetworkStatus('offline'),
          onStatusChange: (status) => setNetworkStatus(status),
          onSyncReady: (result) => {
            setLastSyncResult(result);
            getPendingSyncCount().then(setPendingSyncCount);
          }
        },
        appwriteClient as any,
        databaseId
      );

      // Initialize session manager
      await initializeSessionManager({
        onExpired: () => {
          console.log('⚠️ Session expired');
          endSession();
        },
        onWarning: (remainingTime) => {
          console.log(`⚠️ Session expiring in ${remainingTime / 1000} seconds`);
        }
      });

      // Update pending count
      const count = await getPendingSyncCount();
      setPendingSyncCount(count);

      setIsInitialized(true);
      console.log('🎉 Offline system initialized');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize';
      setError(errorMessage);
      console.error('❌ Initialization failed:', err);
    }
  }, [appwriteClient, databaseId]);

  // Perform sync
  const sync = useCallback(async (): Promise<SyncResult | null> => {
    if (!isOnline()) {
      console.log('📴 Cannot sync while offline');
      return null;
    }

    if (!appwriteClient || !databaseId) {
      setError('Appwrite client not configured');
      return null;
    }

    setIsSyncing(true);
    setError(null);

    try {
      const result = await triggerImmediateSync(
        appwriteClient as any,
        databaseId
      );
      
      setLastSyncResult(result);
      await getPendingSyncCount().then(setPendingSyncCount);
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMessage);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [appwriteClient, databaseId]);

  // Clear all local data
  const clearData = useCallback(async () => {
    await clearLocalDB();
    localStorage.removeItem('scan_n_serve_initial_sync_complete');
    setIsFirstRunState(true);
    setLastInitialSync(null);
    setPendingSyncCount(0);
    setLastSyncResult(null);
    console.log('🗑️ Local data cleared');
  }, []);

  // Setup effect
  useEffect(() => {
    initialize();

    return () => {
      // Cleanup on unmount
    };
  }, []);

  // Periodic pending count update
  useEffect(() => {
    if (!isInitialized) return;

    const updateCount = async () => {
      const count = await getPendingSyncCount();
      setPendingSyncCount(count);
    };

    updateCount();
    const interval = setInterval(updateCount, 10000);

    return () => clearInterval(interval);
  }, [isInitialized]);

  return {
    isInitialized,
    isOnline: networkStatus === 'online',
    networkStatus,
    pendingSyncCount,
    isFirstRun: isFirstRunState,
    lastInitialSync,
    isSyncing,
    lastSyncResult,
    error,
    initialize,
    sync,
    clearData
  };
}

// ============================================================================
// Export Types
// ============================================================================

export type { NetworkStatus, SyncResult };
