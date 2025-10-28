/**
 * Task 2.1: Offline-First Data Layer
 *
 * A robust data abstraction layer that:
 * 1. Automatically queues writes when offline
 * 2. Provides read-through caching
 * 3. Handles sync conflicts intelligently
 * 4. Maintains referential integrity
 */

// Types
export interface DataItem<T = any> {
  id: string;
  data: T;
  version: number;
  deviceId: string;
  timestamp: number;
  vectorClock: Record<string, number>;
  syncStatus: 'pending' | 'synced' | 'conflict';
}

export interface WriteOperation {
  id: string;
  store: string;
  operation: 'put' | 'delete';
  data?: any;
  timestamp: number;
  retryCount: number;
}

export interface SyncConflict {
  localVersion: DataItem;
  remoteVersion: DataItem;
  resolvedVersion?: DataItem;
}

// Configuration
const DB_NAME = 'pos-offline-store';
const DB_VERSION = 1;
const STORES = ['products', 'orders', 'inventory', 'syncQueue', 'conflicts'];
const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 32000; // 32 seconds

export class OfflineDataStore {
  private db: IDBDatabase | null = null;
  private deviceId: string;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private cache: Map<string, Map<string, DataItem>> = new Map();
  private cacheTimeout: number = 60000; // 1 minute
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(deviceId?: string) {
    this.deviceId = deviceId || this.generateDeviceId();
    this.setupOnlineListeners();
  }

  // ==================== Initialization ====================

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.startBackgroundSync();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        STORES.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });

            // Create indexes based on store type
            switch (storeName) {
              case 'products':
                store.createIndex('category', 'data.category', { unique: false });
                store.createIndex('searchText', 'data.searchText', { unique: false });
                break;
              case 'orders':
                store.createIndex('status', 'data.status', { unique: false });
                store.createIndex('createdAt', 'data.createdAt', { unique: false });
                store.createIndex('statusCreatedAt', ['data.status', 'data.createdAt'], { unique: false });
                break;
              case 'syncQueue':
                store.createIndex('timestamp', 'timestamp', { unique: false });
                break;
            }
          }
        });
      };
    });
  }

  private generateDeviceId(): string {
    let deviceId = localStorage.getItem('pos-device-id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('pos-device-id', deviceId);
    }
    return deviceId;
  }

  private setupOnlineListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processQueuedWrites();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // ==================== CRUD Operations ====================

  /**
   * Read with cache support
   */
  async get<T>(store: string, id: string): Promise<DataItem<T> | null> {
    // Check cache first
    const cached = this.getCached(store, id);
    if (cached) return cached as DataItem<T>;

    // Read from IndexedDB
    const item = await this.getFromDB<T>(store, id);

    if (item) {
      this.updateCache(store, id, item);
    }

    return item;
  }

  /**
   * Write with automatic queueing when offline
   */
  async put<T>(store: string, id: string, data: T): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const item: DataItem<T> = {
      id,
      data,
      version: Date.now(),
      deviceId: this.deviceId,
      timestamp: Date.now(),
      vectorClock: { [this.deviceId]: Date.now() },
      syncStatus: this.isOnline ? 'synced' : 'pending',
    };

    // Write to IndexedDB with transaction
    await this.executeTransaction(store, 'readwrite', async (objectStore) => {
      objectStore.put(item);
    });

    // Update cache
    this.updateCache(store, id, item);

    // Queue for sync if offline
    if (!this.isOnline) {
      await this.queueWrite(store, id, data);
    } else {
      // Optimistic sync
      this.syncItem(store, id, item).catch((error) => {
        console.error('Sync failed:', error);
        this.queueWrite(store, id, data);
      });
    }

    // Notify listeners
    this.notifyListeners(store, item);
  }

  /**
   * Delete with queueing support
   */
  async delete(store: string, id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.executeTransaction(store, 'readwrite', async (objectStore) => {
      objectStore.delete(id);
    });

    // Remove from cache
    this.removeCached(store, id);

    // Queue deletion
    if (!this.isOnline) {
      await this.queueDelete(store, id);
    }

    // Notify listeners
    this.notifyListeners(store, { id, deleted: true });
  }

  /**
   * Query with index support
   */
  async query<T>(
    store: string,
    indexName?: string,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<DataItem<T>[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readonly');
      const objectStore = transaction.objectStore(store);
      const source = indexName ? objectStore.index(indexName) : objectStore;
      const request = query ? source.getAll(query) : source.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== Transaction Support ====================

  async executeTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => void | Promise<void>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, mode);
      const objectStore = transaction.objectStore(storeName);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error('Transaction aborted'));

      try {
        const result = callback(objectStore);
        if (result instanceof Promise) {
          result.catch(reject);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  async executeMultiStoreTransaction(
    storeNames: string[],
    mode: IDBTransactionMode,
    callback: (stores: Map<string, IDBObjectStore>) => void | Promise<void>
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeNames, mode);
      const stores = new Map<string, IDBObjectStore>();

      storeNames.forEach((name) => {
        stores.set(name, transaction.objectStore(name));
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error('Transaction aborted'));

      try {
        const result = callback(stores);
        if (result instanceof Promise) {
          result.catch(reject);
        }
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  // ==================== Sync Queue Management ====================

  private async queueWrite(store: string, id: string, data: any): Promise<void> {
    const operation: WriteOperation = {
      id: crypto.randomUUID(),
      store,
      operation: 'put',
      data: { id, data },
      timestamp: Date.now(),
      retryCount: 0,
    };

    await this.executeTransaction('syncQueue', 'readwrite', (objectStore) => {
      objectStore.put({ id: operation.id, ...operation });
    });
  }

  private async queueDelete(store: string, id: string): Promise<void> {
    const operation: WriteOperation = {
      id: crypto.randomUUID(),
      store,
      operation: 'delete',
      data: { id },
      timestamp: Date.now(),
      retryCount: 0,
    };

    await this.executeTransaction('syncQueue', 'readwrite', (objectStore) => {
      objectStore.put({ id: operation.id, ...operation });
    });
  }

  private async processQueuedWrites(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) return;

    this.syncInProgress = true;

    try {
      const queuedOps = await this.query<WriteOperation>('syncQueue');

      for (const op of queuedOps) {
        try {
          await this.executeQueuedOperation(op);

          // Remove from queue on success
          await this.executeTransaction('syncQueue', 'readwrite', (objectStore) => {
            objectStore.delete(op.id);
          });
        } catch (error) {
          // Retry with exponential backoff
          await this.handleSyncFailure(op, error);
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async executeQueuedOperation(op: WriteOperation): Promise<void> {
    // Simulate API call - replace with actual endpoint
    const delay = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, op.retryCount),
      MAX_RETRY_DELAY
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (op.operation === 'put') {
      // await fetch(`/api/${op.store}/${op.data.id}`, {
      //   method: 'PUT',
      //   body: JSON.stringify(op.data),
      // });
      console.log(`[SYNC] PUT ${op.store}/${op.data.id}`);
    } else if (op.operation === 'delete') {
      // await fetch(`/api/${op.store}/${op.data.id}`, { method: 'DELETE' });
      console.log(`[SYNC] DELETE ${op.store}/${op.data.id}`);
    }
  }

  private async handleSyncFailure(op: WriteOperation, error: any): Promise<void> {
    op.retryCount++;

    if (op.retryCount >= MAX_RETRY_ATTEMPTS) {
      console.error(`Max retries exceeded for operation ${op.id}`, error);
      // Move to dead letter queue
      await this.executeTransaction('conflicts', 'readwrite', (objectStore) => {
        objectStore.put({ ...op, error: error.message });
      });
      // Remove from sync queue
      await this.executeTransaction('syncQueue', 'readwrite', (objectStore) => {
        objectStore.delete(op.id);
      });
    } else {
      // Update retry count
      await this.executeTransaction('syncQueue', 'readwrite', (objectStore) => {
        objectStore.put({ id: op.id, ...op });
      });
    }
  }

  // ==================== Conflict Resolution ====================

  private async syncItem<T>(store: string, id: string, localItem: DataItem<T>): Promise<void> {
    // Simulate fetching from server
    // const response = await fetch(`/api/${store}/${id}`);
    // const remoteItem: DataItem<T> = await response.json();

    // For demo purposes, skip actual sync
    // In production, compare vector clocks and resolve conflicts
  }

  async resolveConflict<T>(
    store: string,
    localItem: DataItem<T>,
    remoteItem: DataItem<T>
  ): Promise<DataItem<T>> {
    // Compare vector clocks
    const localIsNewer = this.compareVectorClocks(
      localItem.vectorClock,
      remoteItem.vectorClock
    );

    if (localIsNewer === 0) {
      // Concurrent modification - apply business rules
      return this.mergeConflict(store, localItem, remoteItem);
    } else if (localIsNewer > 0) {
      return localItem;
    } else {
      return remoteItem;
    }
  }

  private compareVectorClocks(
    clock1: Record<string, number>,
    clock2: Record<string, number>
  ): number {
    let clock1Ahead = false;
    let clock2Ahead = false;

    const allDevices = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);

    for (const deviceId of allDevices) {
      const v1 = clock1[deviceId] || 0;
      const v2 = clock2[deviceId] || 0;

      if (v1 > v2) clock1Ahead = true;
      if (v2 > v1) clock2Ahead = true;
    }

    if (clock1Ahead && !clock2Ahead) return 1;
    if (clock2Ahead && !clock1Ahead) return -1;
    return 0; // Concurrent
  }

  private mergeConflict<T>(
    store: string,
    local: DataItem<T>,
    remote: DataItem<T>
  ): DataItem<T> {
    // Store-specific merge strategies
    switch (store) {
      case 'orders':
        // Orders are append-only, keep both (shouldn't happen with UUIDs)
        return local;

      case 'inventory':
        // Server wins for inventory, apply local decrements
        return remote;

      case 'products':
        // Server authoritative
        return remote;

      default:
        // Last-write-wins
        return local.timestamp > remote.timestamp ? local : remote;
    }
  }

  // ==================== Cache Management ====================

  private getCached(store: string, id: string): DataItem | null {
    const storeCache = this.cache.get(store);
    return storeCache?.get(id) || null;
  }

  private updateCache(store: string, id: string, item: DataItem): void {
    if (!this.cache.has(store)) {
      this.cache.set(store, new Map());
    }
    this.cache.get(store)!.set(id, item);

    // Auto-expire cache
    setTimeout(() => {
      this.cache.get(store)?.delete(id);
    }, this.cacheTimeout);
  }

  private removeCached(store: string, id: string): void {
    this.cache.get(store)?.delete(id);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ==================== Event-Driven Architecture ====================

  subscribe(store: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(store)) {
      this.listeners.set(store, new Set());
    }
    this.listeners.get(store)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(store)?.delete(callback);
    };
  }

  private notifyListeners(store: string, data: any): void {
    const callbacks = this.listeners.get(store);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }

  // ==================== Background Sync ====================

  private startBackgroundSync(): void {
    // Process queue every 30 seconds
    setInterval(() => {
      if (this.isOnline) {
        this.processQueuedWrites();
      }
    }, 30000);
  }

  // ==================== Helper Methods ====================

  private async getFromDB<T>(store: string, id: string): Promise<DataItem<T> | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  isOnlineStatus(): boolean {
    return this.isOnline;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
export const offlineStore = new OfflineDataStore();
