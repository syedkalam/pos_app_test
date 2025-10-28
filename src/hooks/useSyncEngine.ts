/**
 * React Hook for Sync Engine
 * Provides reactive access to synchronization status
 */

import { useEffect, useState, useCallback } from 'react';
import { syncEngine, type SyncState, type EntityType, type SyncOptions } from '../lib/SyncEngine';

export function useSyncEngine() {
  const [syncStates, setSyncStates] = useState<Map<EntityType, SyncState>>(
    syncEngine.getSyncState() as Map<EntityType, SyncState>
  );
  const [stats, setStats] = useState({
    totalPending: 0,
    lastSync: null as number | null,
    syncInProgress: false,
    serverAvailable: false,
  });

  useEffect(() => {
    // Subscribe to sync state changes
    const unsubscribe = syncEngine.subscribe((state) => {
      setSyncStates(new Map(state));
    });

    // Load initial stats
    syncEngine.getSyncStats().then(setStats);

    return unsubscribe;
  }, []);

  const sync = useCallback(async (options?: SyncOptions) => {
    await syncEngine.sync(options);
    const newStats = await syncEngine.getSyncStats();
    setStats(newStats);
  }, []);

  const cancelSync = useCallback(() => {
    syncEngine.cancelSync();
  }, []);

  const startAutoSync = useCallback((interval?: number) => {
    syncEngine.startAutoSync(interval);
  }, []);

  const stopAutoSync = useCallback(() => {
    syncEngine.stopAutoSync();
  }, []);

  return {
    syncStates,
    stats,
    sync,
    cancelSync,
    startAutoSync,
    stopAutoSync,
  };
}

export function useEntitySyncState(entity: EntityType) {
  const [state, setState] = useState<SyncState>(
    syncEngine.getSyncState(entity) as SyncState
  );

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((states) => {
      const entityState = states.get(entity);
      if (entityState) {
        setState(entityState);
      }
    });

    return unsubscribe;
  }, [entity]);

  return state;
}
