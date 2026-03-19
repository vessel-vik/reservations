'use client';

import { useOffline } from '@/hooks/useOffline';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { ReactNode } from 'react';

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  // Don't pass appwrite client - works in offline/demo mode
  const offline = useOffline({
    autoSync: false, // Disable auto-sync without Appwrite
    syncInterval: 45 * 60 * 1000
  });

  // Don't render indicator if not initialized yet
  if (!offline.isInitialized) {
    return <>{children}</>;
  }

  return (
    <>
      <OfflineIndicator position="top" showDetails={true} />
      {children}
    </>
  );
}
