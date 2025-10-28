/**
 * Task 2.4: Synchronization Engine
 *
 * Implements bidirectional sync between local storage and REST API:
 * - Detect local changes since last sync
 * - Handle concurrent modifications gracefully
 * - Maintain sync status indicators
 * - Support partial sync for large datasets
 */

import { offlineStore, type DataItem } from './OfflineDataStore';

// Types
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';
export type EntityType = 'products' | 'orders' | 'inventory';

export interface SyncState {
  status: SyncStatus;
  lastSync: number | null;
  lastError: string | null;
  itemsSynced: number;
  itemsPending: number;
  progress: number; // 0-100
}

export interface SyncOptions {
  fullSync?: boolean; // Force full sync instead of delta
  entities?: EntityType[]; // Limit sync to specific entities
  batchSize?: number; // Items per batch
  priority?: EntityType[]; // Sync priority order
}

export interface ChangeDetectionResult {
  created: string[];
  updated: string[];
  deleted: string[];
}

export interface SyncConflict {
  entityType: EntityType;
  entityId: string;
  localVersion: DataItem;
  remoteVersion: DataItem;
  resolution: 'local' | 'remote' | 'manual';
}

// API Configuration
const API_BASE_URL = '/api/v1';
const SYNC_INTERVAL = 30000; // 30 seconds
const BATCH_SIZE = 50;
const MAX_PARALLEL_REQUESTS = 3;

export class SyncEngine {
  private syncState: Map<EntityType, SyncState> = new Map();
  private listeners: Set<(state: Map<EntityType, SyncState>) => void> = new Set();
  private syncInProgress = false;
  private autoSyncTimer: number | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    this.initializeSyncState();
    this.setupEventListeners();
  }

  // ==================== Initialization ====================

  private initializeSyncState(): void {
    const entities: EntityType[] = ['products', 'orders', 'inventory'];

    entities.forEach((entity) => {
      this.syncState.set(entity, {
        status: 'idle',
        lastSync: this.getLastSyncTimestamp(entity),
        lastError: null,
        itemsSynced: 0,
        itemsPending: 0,
        progress: 0,
      });
    });
  }

  private setupEventListeners(): void {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('[SYNC] Connection restored, initiating sync...');
      this.sync({ fullSync: false });
    });

    // Listen to data changes
    offlineStore.subscribe('orders', () => {
      this.updatePendingCount('orders');
    });
  }

  // ==================== Main Sync Methods ====================

  async sync(options: SyncOptions = {}): Promise<void> {
    if (this.syncInProgress) {
      console.log('[SYNC] Sync already in progress, skipping...');
      return;
    }

    if (!navigator.onLine) {
      console.log('[SYNC] Offline, skipping sync');
      return;
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();

    const entities = options.entities || ['products', 'inventory', 'orders'];
    const batchSize = options.batchSize || BATCH_SIZE;

    try {
      for (const entity of entities) {
        await this.syncEntity(entity, options.fullSync || false, batchSize);
      }

      console.log('[SYNC] All entities synced successfully');
    } catch (error: any) {
      console.error('[SYNC] Sync failed:', error);
      this.handleSyncError(error);
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  private async syncEntity(
    entity: EntityType,
    fullSync: boolean,
    batchSize: number
  ): Promise<void> {
    console.log(`[SYNC] Starting sync for ${entity}`);

    this.updateSyncState(entity, {
      status: 'syncing',
      itemsSynced: 0,
      progress: 0,
    });

    try {
      // Step 1: Push local changes to server
      await this.pushLocalChanges(entity, batchSize);

      // Step 2: Pull remote changes from server
      await this.pullRemoteChanges(entity, fullSync, batchSize);

      // Step 3: Mark as complete
      this.updateSyncState(entity, {
        status: 'success',
        lastSync: Date.now(),
        lastError: null,
        progress: 100,
      });

      this.saveLastSyncTimestamp(entity, Date.now());
    } catch (error: any) {
      this.updateSyncState(entity, {
        status: 'error',
        lastError: error.message,
        progress: 0,
      });
      throw error;
    }
  }

  // ==================== Change Detection ====================

  async detectLocalChanges(entity: EntityType): Promise<ChangeDetectionResult> {
    const lastSync = this.getLastSyncTimestamp(entity);
    const allItems = await offlineStore.query<any>(entity);

    const created: string[] = [];
    const updated: string[] = [];
    const deleted: string[] = [];

    allItems.forEach((item) => {
      if (item.syncStatus === 'pending') {
        if (item.timestamp > lastSync) {
          if (item.data.isNew) {
            created.push(item.id);
          } else {
            updated.push(item.id);
          }
        }
      }
    });

    // Detect deletions (stored in sync queue)
    const syncQueue = await offlineStore.query<any>('syncQueue');
    syncQueue.forEach((op) => {
      if (op.data.operation === 'delete' && op.data.store === entity) {
        deleted.push(op.data.data.id);
      }
    });

    return { created, updated, deleted };
  }

  // ==================== Push (Upload) ====================

  private async pushLocalChanges(entity: EntityType, batchSize: number): Promise<void> {
    const changes = await this.detectLocalChanges(entity);
    const totalChanges = changes.created.length + changes.updated.length + changes.deleted.length;

    if (totalChanges === 0) {
      console.log(`[SYNC] No local changes to push for ${entity}`);
      return;
    }

    console.log(`[SYNC] Pushing ${totalChanges} changes for ${entity}`);

    // Process in batches
    const allIds = [...changes.created, ...changes.updated];
    const batches = this.createBatches(allIds, batchSize);

    let synced = 0;

    for (const batch of batches) {
      const items = await Promise.all(
        batch.map(async (id) => {
          const item = await offlineStore.get(entity, id);
          return item;
        })
      );

      // Upload batch
      await this.uploadBatch(entity, items.filter((i) => i !== null) as DataItem[]);

      synced += batch.length;
      this.updateSyncState(entity, {
        itemsSynced: synced,
        progress: Math.floor((synced / totalChanges) * 50), // 0-50% for push
      });
    }

    // Handle deletions
    for (const id of changes.deleted) {
      await this.deleteRemote(entity, id);
    }
  }

  private async uploadBatch(entity: EntityType, items: DataItem[]): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/${entity}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items.map((i) => i.data)),
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Update sync status locally
      for (const item of items) {
        await offlineStore.put(entity, item.id, {
          ...item.data,
          syncStatus: 'synced',
        });
      }

      console.log(`[SYNC] Uploaded ${items.length} items for ${entity}`);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Sync cancelled');
      }
      throw error;
    }
  }

  private async deleteRemote(entity: EntityType, id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/${entity}/${id}`, {
        method: 'DELETE',
        signal: this.abortController?.signal,
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      console.log(`[SYNC] Deleted ${entity}/${id} from server`);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Sync cancelled');
      }
      console.error(`Failed to delete ${entity}/${id}:`, error);
    }
  }

  // ==================== Pull (Download) ====================

  private async pullRemoteChanges(
    entity: EntityType,
    fullSync: boolean,
    batchSize: number
  ): Promise<void> {
    const lastSync = fullSync ? 0 : this.getLastSyncTimestamp(entity);

    console.log(`[SYNC] Pulling changes for ${entity} since ${new Date(lastSync).toISOString()}`);

    try {
      // Fetch changes from server
      const url = `${API_BASE_URL}/${entity}/changes?since=${lastSync}&limit=${batchSize}`;
      const response = await fetch(url, {
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.statusText}`);
      }

      const data = await response.json();
      const items: any[] = data.items || [];
      const hasMore: boolean = data.hasMore || false;

      console.log(`[SYNC] Received ${items.length} items for ${entity}`);

      // Process items and handle conflicts
      let synced = 0;
      for (const item of items) {
        await this.mergeRemoteItem(entity, item);
        synced++;

        this.updateSyncState(entity, {
          itemsSynced: synced,
          progress: 50 + Math.floor((synced / items.length) * 50), // 50-100% for pull
        });
      }

      // If there are more items, recursively fetch next batch
      if (hasMore) {
        await this.pullRemoteChanges(entity, false, batchSize);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Sync cancelled');
      }
      throw error;
    }
  }

  private async mergeRemoteItem(entity: EntityType, remoteData: any): Promise<void> {
    const localItem = await offlineStore.get(entity, remoteData.id);

    if (!localItem) {
      // New item from server, just insert
      await offlineStore.put(entity, remoteData.id, {
        ...remoteData,
        syncStatus: 'synced',
      });
      return;
    }

    // Check for conflicts
    if (localItem.syncStatus === 'pending') {
      // Conflict detected
      const remoteItem: DataItem = {
        id: remoteData.id,
        data: remoteData,
        version: remoteData.version || Date.now(),
        deviceId: 'server',
        timestamp: remoteData.updatedAt || Date.now(),
        vectorClock: remoteData.vectorClock || {},
        syncStatus: 'synced',
      };

      const resolved = await offlineStore.resolveConflict(entity, localItem, remoteItem);

      await offlineStore.put(entity, resolved.id, {
        ...resolved.data,
        syncStatus: 'synced',
      });

      console.log(`[SYNC] Resolved conflict for ${entity}/${remoteData.id}`);
    } else {
      // No conflict, server version is newer
      await offlineStore.put(entity, remoteData.id, {
        ...remoteData,
        syncStatus: 'synced',
      });
    }
  }

  // ==================== Auto Sync ====================

  startAutoSync(interval: number = SYNC_INTERVAL): void {
    if (this.autoSyncTimer) {
      this.stopAutoSync();
    }

    console.log(`[SYNC] Starting auto-sync every ${interval}ms`);

    this.autoSyncTimer = window.setInterval(() => {
      if (navigator.onLine && !this.syncInProgress) {
        this.sync({ fullSync: false });
      }
    }, interval);

    // Initial sync
    this.sync({ fullSync: false });
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
      console.log('[SYNC] Auto-sync stopped');
    }
  }

  cancelSync(): void {
    if (this.abortController) {
      this.abortController.abort();
      console.log('[SYNC] Sync cancelled by user');
    }
  }

  // ==================== State Management ====================

  private updateSyncState(entity: EntityType, updates: Partial<SyncState>): void {
    const current = this.syncState.get(entity)!;
    this.syncState.set(entity, { ...current, ...updates });
    this.notifyListeners();
  }

  getSyncState(entity?: EntityType): SyncState | Map<EntityType, SyncState> {
    if (entity) {
      return this.syncState.get(entity)!;
    }
    return new Map(this.syncState);
  }

  private async updatePendingCount(entity: EntityType): Promise<void> {
    const changes = await this.detectLocalChanges(entity);
    const pending = changes.created.length + changes.updated.length + changes.deleted.length;

    this.updateSyncState(entity, { itemsPending: pending });
  }

  // ==================== Persistence ====================

  private getLastSyncTimestamp(entity: EntityType): number {
    const key = `pos-last-sync-${entity}`;
    const value = localStorage.getItem(key);
    return value ? parseInt(value, 10) : 0;
  }

  private saveLastSyncTimestamp(entity: EntityType, timestamp: number): void {
    const key = `pos-last-sync-${entity}`;
    localStorage.setItem(key, timestamp.toString());
  }

  // ==================== Utilities ====================

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private handleSyncError(error: any): void {
    console.error('[SYNC] Sync error:', error);

    // Update all entity states to error
    this.syncState.forEach((state, entity) => {
      if (state.status === 'syncing') {
        this.updateSyncState(entity, {
          status: 'error',
          lastError: error.message,
        });
      }
    });
  }

  // ==================== Event Listeners ====================

  subscribe(callback: (state: Map<EntityType, SyncState>) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const stateCopy = new Map(this.syncState);
    this.listeners.forEach((callback) => callback(stateCopy));
  }

  // ==================== Health Check ====================

  async checkServerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ==================== Stats & Monitoring ====================

  async getSyncStats(): Promise<{
    totalPending: number;
    lastSync: number | null;
    syncInProgress: boolean;
    serverAvailable: boolean;
  }> {
    let totalPending = 0;
    let lastSync: number | null = null;

    for (const [entity, state] of this.syncState) {
      totalPending += state.itemsPending;
      if (state.lastSync && (!lastSync || state.lastSync < lastSync)) {
        lastSync = state.lastSync;
      }
    }

    const serverAvailable = await this.checkServerHealth();

    return {
      totalPending,
      lastSync,
      syncInProgress: this.syncInProgress,
      serverAvailable,
    };
  }
}

// Export singleton
export const syncEngine = new SyncEngine();
