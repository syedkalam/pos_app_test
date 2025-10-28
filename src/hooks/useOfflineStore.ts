/**
 * React Hook for Offline Data Store
 * Provides reactive access to offline-first data storage
 */

import { useEffect, useState, useCallback } from 'react';
import { offlineStore, type DataItem } from '../lib/OfflineDataStore';

export function useOfflineStore<T>(store: string, id?: string) {
  const [data, setData] = useState<DataItem<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const item = await offlineStore.get<T>(store, id);
        setData(item);
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to changes
    const unsubscribe = offlineStore.subscribe(store, (updatedItem) => {
      if (updatedItem.id === id) {
        setData(updatedItem);
      }
    });

    return unsubscribe;
  }, [store, id]);

  const update = useCallback(
    async (newData: T) => {
      if (!id) throw new Error('No ID provided');

      try {
        await offlineStore.put(store, id, newData);
        setError(null);
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [store, id]
  );

  const remove = useCallback(async () => {
    if (!id) throw new Error('No ID provided');

    try {
      await offlineStore.delete(store, id);
      setData(null);
      setError(null);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, [store, id]);

  return { data, loading, error, update, remove };
}

export function useOfflineQuery<T>(
  store: string,
  indexName?: string,
  query?: IDBValidKey | IDBKeyRange
) {
  const [data, setData] = useState<DataItem<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const items = await offlineStore.query<T>(store, indexName, query);
      setData(items);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [store, indexName, query]);

  useEffect(() => {
    refetch();

    // Subscribe to changes
    const unsubscribe = offlineStore.subscribe(store, () => {
      refetch();
    });

    return unsubscribe;
  }, [refetch, store]);

  return { data, loading, error, refetch };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
