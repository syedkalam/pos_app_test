# Part 1: Architecture & System Design

## 1. Offline-First Architecture

### a. Data Synchronization Strategy

**Three-Tier Sync Model:**

```
┌─────────────────┐
│   Client Store  │ ← Orders, Inventory, Menu (IndexedDB)
└────────┬────────┘
         │
    ┌────▼────────┐
    │ Sync Queue  │ ← Pending Changes (Write-Ahead Log)
    └────┬────────┘
         │
    ┌────▼────────┐
    │ Server API  │ ← Source of Truth
    └─────────────┘
```

**Strategy Details:**

1. **Orders:**
   - Store all orders locally with `syncStatus: 'pending' | 'synced' | 'conflict'`
   - Use optimistic updates for instant UI feedback
   - Queue orders for background sync when online
   - Implement exponential backoff for failed syncs
   - Generate client-side UUIDs (v4) to prevent ID collisions

2. **Inventory:**
   - Pull-based sync model: periodic polling from server
   - Last-modified timestamps on each SKU
   - Delta sync: only fetch changed items since last sync
   - Local adjustments tracked in a separate transaction log
   - Reconcile server inventory with local adjustments on sync

3. **Menu Items:**
   - Infrequent changes: full fetch on startup if outdated
   - Store ETags for efficient HTTP caching
   - Admin-initiated push notifications for urgent menu updates
   - Versioned menu schema to handle format changes

### b. Conflict Resolution Strategy

**Last-Write-Wins (LWW) with Vector Clocks:**

```typescript
interface DataItem {
  id: string;
  data: any;
  version: number;
  deviceId: string;
  timestamp: number;
  vectorClock: Record<string, number>; // deviceId → version
}
```

**Resolution Rules:**

1. **Orders:** No conflicts (append-only log with unique IDs)
2. **Inventory:**
   - Server always wins for stock counts
   - Local decrements applied as adjustments after sync
   - Warn cashier if item sold out during offline period
3. **Menu Items:**
   - Server-authoritative (read-only on clients)
   - Force refresh on conflict detection

**Three-Way Merge Process:**
```
1. Compare local.vectorClock vs server.vectorClock
2. If either is subset → simple merge
3. If diverged → apply business rules:
   - Inventory: sum local decrements, apply to server value
   - Orders: keep both (different UUIDs)
   - Menu: server wins, notify user of changes
```

### c. Data Consistency Approach

**Eventual Consistency with Strong Client-Side Guarantees:**

1. **ACID at Client Level:**
   - Use IndexedDB transactions for atomic operations
   - All cart → order conversions wrapped in single transaction
   - Rollback mechanism if payment fails

2. **Sync Guarantees:**
   ```
   Client State Machine:
   OFFLINE → [queue writes] → SYNCING → [resolve conflicts] → SYNCED
                ↑                                                  ↓
                └────────────[on network error]──────────────────┘
   ```

3. **Consistency Checks:**
   - CRC32 checksums on critical data (orders, payments)
   - Periodic integrity scans of IndexedDB
   - Background reconciliation job every 5 minutes
   - Detect and quarantine corrupted records

4. **Multi-Device Consistency:**
   - WebSocket broadcasts for real-time updates when online
   - Operational Transform (OT) for concurrent cart edits
   - Shared device ID registry to track active terminals

---

## 2. Performance Constraints

### a. Optimization for Low-End Hardware (2GB RAM, ARM)

**JavaScript Bundle Size Optimization:**

1. **Code Splitting:**
   ```typescript
   // Route-based splitting
   const AdminPanel = lazy(() => import('./routes/admin'));
   const Reports = lazy(() => import('./routes/reports'));

   // Feature-based splitting
   const PaymentProcessor = lazy(() => import('./features/payment'));
   ```

2. **Tree Shaking:**
   - Use ES modules exclusively
   - Avoid default exports for better tree-shaking
   - Import only needed functions: `import { sum } from 'lodash-es'`

3. **Minification & Compression:**
   - Vite with Rollup for production builds
   - Terser for aggressive minification
   - Brotli compression (70% smaller than gzip)
   - Remove console.logs in production

4. **Target Output:**
   - Core bundle: 150KB gzipped
   - Lazy chunks: <50KB each
   - Total JS budget: <200KB (as required)

**Runtime Performance:**

1. **Memory Management:**
   - Object pooling for frequent allocations (cart items, DOM nodes)
   - WeakMap for component caching
   - Debounce search (300ms) and scroll handlers (16ms)
   - Limit product catalog render to viewport (virtual scrolling)

2. **Computation Optimization:**
   - Memoize expensive calculations (totals, tax, discounts)
   - Web Worker for heavy operations (report generation, large syncs)
   - RequestIdleCallback for non-critical tasks
   - Avoid re-renders: React.memo, useMemo, useCallback

### b. Bundle Size Strategy

**Dependency Audit:**
```bash
# Current dependencies size analysis
react + react-dom: ~130KB (necessary)
redux-toolkit: ~45KB (replace with Zustand: ~3KB)
uuid: ~5KB (replace with crypto.randomUUID())
```

**Reduction Plan:**
1. Replace Redux Toolkit → Zustand (saves ~42KB)
2. Use native UUID → crypto.randomUUID() (saves ~5KB)
3. Custom router → React Router DOM (keep, needed)
4. Inline critical CSS, lazy-load rest
5. SVG sprites instead of icon libraries

**Target Bundle:**
- React/ReactDOM: 130KB
- Zustand: 3KB
- Router: 15KB
- Application code: 40KB
- **Total: ~188KB** ✅

### c. DOM Manipulation & Memory Management

**Virtual List for Large Catalogs:**

```typescript
// Only render visible items + buffer
const VirtualProductList = ({ items }) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const itemHeight = 120; // px
  const bufferSize = 5;

  const handleScroll = useCallback(
    debounce((scrollTop) => {
      const start = Math.floor(scrollTop / itemHeight) - bufferSize;
      const end = start + Math.ceil(window.innerHeight / itemHeight) + bufferSize * 2;
      setVisibleRange({ start: Math.max(0, start), end });
    }, 16),
    []
  );

  return (
    <div style={{ height: items.length * itemHeight }}>
      {items.slice(visibleRange.start, visibleRange.end).map(renderItem)}
    </div>
  );
};
```

**Memory Leak Prevention:**
1. Cleanup timers/intervals in useEffect returns
2. Abort fetch requests on component unmount
3. Remove event listeners on cleanup
4. Clear IndexedDB cursors
5. Limit undo/redo history to 20 operations

**Efficient Updates:**
- Use CSS transforms over layout properties
- Batch DOM reads/writes (FastDOM pattern)
- RequestAnimationFrame for animations
- Avoid forced synchronous layouts

---

## 3. Multi-Device Coordination

### a. Real-Time Order Status Updates

**Hybrid WebSocket + Polling Architecture:**

```typescript
class OrderStatusSync {
  private ws: WebSocket | null = null;
  private pollingInterval: number | null = null;

  connect() {
    // Try WebSocket first
    this.ws = new WebSocket('wss://api.pos.com/orders');

    this.ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      this.applyOrderUpdate(update);
    };

    this.ws.onerror = () => {
      // Fallback to polling
      this.startPolling();
    };
  }

  private startPolling() {
    this.pollingInterval = setInterval(() => {
      this.fetchOrderUpdates();
    }, 3000); // 3 second intervals
  }

  private applyOrderUpdate(update: OrderUpdate) {
    // Merge with local state using vector clocks
    const local = this.getLocalOrder(update.id);
    if (update.vectorClock[update.deviceId] > local.vectorClock[update.deviceId]) {
      this.updateLocalOrder(update);
      this.notifyKitchenDisplay(update);
    }
  }
}
```

**Optimistic UI Pattern:**
1. Cashier updates order status locally (instant feedback)
2. Send update via WebSocket or queue if offline
3. Kitchen display receives update via broadcast
4. On conflict, server version wins, UI reverts with notification

### b. Print Job Queuing System

**Priority Queue with Network-Aware Routing:**

```typescript
interface PrintJob {
  id: string;
  type: 'receipt' | 'kitchen' | 'bar';
  priority: number; // 1-10
  printerAddress: string; // IP or Bluetooth MAC
  data: ReceiptData;
  retryCount: number;
  createdAt: number;
}

class PrintQueue {
  private queues: Map<string, PriorityQueue<PrintJob>> = new Map();
  private activePrinters: Set<string> = new Set();

  async enqueue(job: PrintJob) {
    const queue = this.getQueue(job.printerAddress);
    queue.insert(job, job.priority);

    // Don't wait for completion (fire-and-forget)
    this.processQueue(job.printerAddress);
  }

  private async processQueue(printerAddress: string) {
    if (this.activePrinters.has(printerAddress)) return; // Already processing

    this.activePrinters.add(printerAddress);
    const queue = this.getQueue(printerAddress);

    while (!queue.isEmpty()) {
      const job = queue.extract();

      try {
        await this.sendToPrinter(job);
        this.markComplete(job.id);
      } catch (error) {
        if (job.retryCount < 3) {
          job.retryCount++;
          queue.insert(job, job.priority - 1); // Lower priority on retry
        } else {
          this.moveToDeadLetter(job, error);
        }
      }
    }

    this.activePrinters.delete(printerAddress);
  }
}
```

**Network Printer Discovery:**
- mDNS/Bonjour for automatic discovery
- SSDP for UPnP devices
- Manual IP entry fallback
- Persistent device registry in IndexedDB

### c. Device Discovery & Pairing

**Local Network Discovery Protocol:**

```typescript
class DeviceDiscovery {
  private peers: Map<string, PeerDevice> = new Map();

  // Broadcast presence every 5 seconds
  async startBroadcast() {
    const beacon = {
      deviceId: this.deviceId,
      type: 'cashier' | 'kitchen' | 'admin',
      timestamp: Date.now(),
      services: ['orders', 'printing', 'inventory']
    };

    // Use UDP multicast to 239.255.0.1:9999
    await this.udpMulticast(beacon);
  }

  // Listen for peer announcements
  async discoverPeers() {
    this.udpListen((message, remoteAddress) => {
      const peer = JSON.parse(message);
      this.peers.set(peer.deviceId, {
        ...peer,
        address: remoteAddress,
        lastSeen: Date.now()
      });

      // Establish WebRTC data channel for P2P sync
      if (peer.type === 'kitchen') {
        this.connectPeer(peer);
      }
    });
  }

  // Bluetooth fallback for printers
  async pairBluetoothPrinter() {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['printing_service'] }]
    });

    const server = await device.gatt.connect();
    this.savePrinterConfig(device.id, server);
  }
}
```

**Pairing Flow:**
```
1. User taps "Find Devices"
2. Scan local network (multicast UDP)
3. Display discovered devices
4. User selects device type (kitchen/printer/etc.)
5. Establish connection (WebSocket or WebRTC)
6. Exchange capabilities & services
7. Save pairing in persistent storage
8. Auto-reconnect on app startup
```

---

## 4. Data Storage Strategy

### a. Storage Technology Comparison

| Feature | IndexedDB | WebSQL | localStorage |
|---------|-----------|---------|--------------|
| **Capacity** | ~250MB-1GB | Deprecated ❌ | ~5-10MB |
| **Performance** | Fast (async) | N/A | Slow (sync) |
| **Querying** | Indexes, cursors | N/A | None (key-value) |
| **Transactions** | Full ACID | N/A | None |
| **Browser Support** | Excellent | Removed | Universal |
| **Recommendation** | ✅ **Primary** | ❌ Avoid | Session only |

**Decision: IndexedDB as Primary Storage**

Rationale:
- Asynchronous API (non-blocking UI)
- Sufficient capacity for large catalogs
- Native indexing for fast queries
- Transaction support for data integrity
- Works offline in all modern browsers

**localStorage Usage:**
- Session tokens only
- User preferences (theme, language)
- Last sync timestamp
- Device ID

### b. Efficient Local Querying

**Compound Indexes for Common Queries:**

```typescript
// IndexedDB Schema
const schema = {
  products: {
    keyPath: 'id',
    indexes: [
      { name: 'category', keyPath: 'category', unique: false },
      { name: 'price', keyPath: 'price', unique: false },
      { name: 'categoryPrice', keyPath: ['category', 'price'], unique: false }, // Compound
      { name: 'searchText', keyPath: 'searchText', unique: false } // Normalized search
    ]
  },
  orders: {
    keyPath: 'id',
    indexes: [
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false },
      { name: 'statusCreatedAt', keyPath: ['status', 'createdAt'], unique: false }
    ]
  }
};
```

**Query Optimization Techniques:**

1. **Pre-computed Search Field:**
   ```typescript
   // On product insert
   product.searchText = `${product.name} ${product.category} ${product.sku}`
     .toLowerCase()
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
   ```

2. **Cursor Pagination:**
   ```typescript
   async function* paginateProducts(pageSize = 50) {
     const tx = db.transaction('products', 'readonly');
     const store = tx.objectStore('products');
     let cursor = await store.openCursor();

     while (cursor) {
       const batch = [];
       for (let i = 0; i < pageSize && cursor; i++) {
         batch.push(cursor.value);
         cursor = await cursor.continue();
       }
       yield batch;
     }
   }
   ```

3. **In-Memory Cache for Hot Data:**
   ```typescript
   class CachedStore {
     private cache = new Map<string, Product>();
     private cacheTimeout = 60000; // 1 minute

     async get(id: string): Promise<Product> {
       if (this.cache.has(id)) {
         return this.cache.get(id)!;
       }

       const product = await this.fetchFromIndexedDB(id);
       this.cache.set(id, product);
       setTimeout(() => this.cache.delete(id), this.cacheTimeout);
       return product;
     }
   }
   ```

### c. Data Pruning Strategy

**Tiered Retention Policy:**

```typescript
const retentionPolicy = {
  orders: {
    completed: 30, // days
    cancelled: 7,
    pending: 90 // Keep longer for offline recovery
  },
  printJobs: {
    successful: 1,
    failed: 7
  },
  syncLogs: {
    all: 14
  },
  products: {
    inactive: 180 // Archive unused products
  }
};

class DataPruner {
  async pruneOldRecords() {
    const now = Date.now();
    const cutoffs = {
      completedOrders: now - retentionPolicy.orders.completed * 86400000,
      cancelledOrders: now - retentionPolicy.orders.cancelled * 86400000,
      printJobs: now - retentionPolicy.printJobs.successful * 86400000
    };

    // Prune in transaction for consistency
    const tx = db.transaction(['orders', 'printJobs'], 'readwrite');

    // Delete old completed orders
    const ordersIndex = tx.objectStore('orders').index('statusCreatedAt');
    const range = IDBKeyRange.bound(
      ['completed', 0],
      ['completed', cutoffs.completedOrders]
    );
    await ordersIndex.openCursor(range).delete();

    // Archive to compressed blob before deletion (optional)
    await this.archiveToFile(oldOrders);
  }

  async checkQuota() {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage / estimate.quota;

    if (usage > 0.8) { // 80% full
      await this.pruneOldRecords();
      await this.compactDatabase();
    }
  }
}
```

**Storage Monitoring:**
- Check quota on app startup
- Monitor IndexedDB size in background
- Warn user at 80% capacity
- Auto-prune at 90% capacity
- Offer manual export/archive at 95%

**Compression for Archives:**
- Use CompressionStream API for old orders
- Store compressed blobs in separate object store
- Lazy decompress on demand
- Export to external storage (File System API)

---

## Summary

This architecture provides:
- **Offline-first** operation with intelligent sync
- **High performance** on constrained hardware
- **Multi-device coordination** via WebSocket + P2P
- **Efficient storage** with IndexedDB and smart pruning
- **Bundle size** under 200KB requirement
- **Production-ready** conflict resolution and consistency

The implementation follows best practices for PWA development, mobile performance optimization, and distributed systems design.
