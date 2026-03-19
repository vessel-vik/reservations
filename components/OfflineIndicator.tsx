'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, Clock, AlertTriangle } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface OfflineIndicatorProps {
  position?: 'top' | 'bottom';
  showDetails?: boolean;
  onSyncClick?: () => void;
}

type NetworkStatus = 'online' | 'offline' | 'checking';
type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

// ============================================================================
// Component
// ============================================================================

function OfflineIndicatorComponent({ 
  position = 'top',
  showDetails = true,
  onSyncClick
}: OfflineIndicatorProps) {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('checking');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [isClient, setIsClient] = useState(false);

  // Set client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Update status periodically
  useEffect(() => {
    if (!isClient) return;

    const updateStatus = async () => {
      try {
        // Try to get network status - safe import
        const { getNetworkStatus } = await import('@/lib/sync/network-monitor');
        const status = getNetworkStatus();
        setNetworkStatus(status.status);
      } catch (e) {
        // Fallback to navigator.onLine
        setNetworkStatus(typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline');
      }
      
      try {
        const { getPendingSyncCount } = await import('@/lib/sync/sync-engine');
        const count = await getPendingSyncCount();
        setPendingCount(count);
        
        const { getSyncStatus } = await import('@/lib/sync/sync-engine');
        setSyncStatus(getSyncStatus() as SyncStatus);
      } catch (e) {
        // Sync engine not initialized yet
        setPendingCount(0);
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, [isClient]);

  // Handle manual sync
  const handleSync = useCallback(async () => {
    if (isSyncing || networkStatus !== 'online') return;
    
    setIsSyncing(true);
    try {
      // This would be called with actual Appwrite client
      // await triggerImmediateSync(appwrite, databaseId);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
    
    onSyncClick?.();
  }, [isSyncing, networkStatus, onSyncClick]);

  // Don't render if checking or online with no pending changes
  if (networkStatus === 'checking') {
    return null;
  }

  const isOnline = networkStatus === 'online';
  const hasPendingChanges = pendingCount > 0;

  // Styles based on status
  const bannerStyles = isOnline 
    ? 'bg-green-50 border-green-200 text-green-800'
    : 'bg-amber-50 border-amber-200 text-amber-800';

  const iconColor = isOnline ? 'text-green-600' : 'text-amber-600';

  return (
    <div 
      className={`
        w-full border-b transition-all duration-300
        ${bannerStyles}
        ${position === 'top' ? 'sticky top-0' : 'sticky bottom-0'}
      `}
    >
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Status Section */}
          <div className="flex items-center gap-3">
            {isOnline ? (
              <Wifi className={`w-5 h-5 ${iconColor}`} />
            ) : (
              <WifiOff className={`w-5 h-5 ${iconColor}`} />
            )}
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="font-medium text-sm">
                {isOnline ? 'Online' : 'Offline Mode'}
              </span>
              
              {!isOnline && (
                <span className="text-xs opacity-80">
                  • Changes will sync when connected
                </span>
              )}
            </div>
          </div>

          {/* Details Section */}
          {showDetails && (
            <div className="flex items-center gap-4">
              {/* Pending Changes */}
              {hasPendingChanges && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4" />
                  <span>
                    {pendingCount} pending change{pendingCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Last Sync Time */}
              {isOnline && lastSyncTime && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                  <span>Last synced: {lastSyncTime}</span>
                </div>
              )}

              {/* Sync Button */}
              {isOnline && (
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
                    transition-colors duration-200
                    ${isSyncing 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }
                  `}
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              )}

              {/* Error Indicator */}
              {syncStatus === 'error' && (
                <div className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs">Sync Error</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Compact Version
// ============================================================================

export function CompactOfflineIndicator() {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('checking');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateStatus = async () => {
      const status = getNetworkStatus();
      setNetworkStatus(status.status);
      
      const count = await getPendingSyncCount();
      setPendingCount(count);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  if (networkStatus === 'checking') {
    return null;
  }

  const isOnline = networkStatus === 'online';

  return (
    <div className="flex items-center gap-2">
      {isOnline ? (
        <Wifi className="w-4 h-4 text-green-600" />
      ) : (
        <WifiOff className="w-4 h-4 text-amber-600" />
      )}
      
      {pendingCount > 0 && (
        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
          {pendingCount}
        </span>
      )}
    </div>
  );
}

export { OfflineIndicatorComponent as OfflineIndicator, CompactOfflineIndicator };
