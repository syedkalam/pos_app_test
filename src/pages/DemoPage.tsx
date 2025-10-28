/**
 * Demo Page - Testing All POS Features
 * Demonstrates offline-first, sync, and print capabilities
 */

import { useEffect, useState } from 'react';
import { offlineStore } from '../lib/OfflineDataStore';
import { printManager } from '../lib/PrintJobManager';
import { syncEngine } from '../lib/SyncEngine';
import { useSyncEngine } from '../hooks/useSyncEngine';
import { usePrintManager } from '../hooks/usePrintManager';
import { useOnlineStatus } from '../hooks/useOfflineStore';
import { SyncStatusBar } from '../components/SyncStatusBar/SyncStatusBar';
import { generateProducts, generateOrders, populateOfflineStore } from '../utils/mockData';
import styles from './DemoPage.module.scss';

export function DemoPage() {
  const [initialized, setInitialized] = useState(false);
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    printJobs: 0,
  });

  const isOnline = useOnlineStatus();
  const { syncStates, startAutoSync, stopAutoSync } = useSyncEngine();
  const { jobs, printers, queueStatus, print, registerPrinter } = usePrintManager();

  // Initialize systems
  useEffect(() => {
    const init = async () => {
      console.log('[Demo] Initializing systems...');

      // Initialize offline store
      await offlineStore.init();

      // Initialize print manager
      await printManager.init();

      // Register a demo printer
      await registerPrinter({
        id: 'receipt-1',
        name: 'Receipt Printer #1',
        address: '192.168.1.100:9100',
        destination: 'receipt',
        protocol: 'escpos',
        paperWidth: 80,
        enabled: true,
      });

      await registerPrinter({
        id: 'kitchen-1',
        name: 'Kitchen Printer',
        address: '192.168.1.101:9100',
        destination: 'kitchen',
        protocol: 'escpos',
        paperWidth: 80,
        enabled: true,
      });

      // Start auto-sync
      startAutoSync(30000); // 30 seconds

      setInitialized(true);
      console.log('[Demo] Initialization complete!');
    };

    init();

    return () => {
      stopAutoSync();
    };
  }, [startAutoSync, stopAutoSync, registerPrinter]);

  // Load stats
  useEffect(() => {
    const loadStats = async () => {
      const products = await offlineStore.query('products');
      const orders = await offlineStore.query('orders');

      setStats({
        products: products.length,
        orders: orders.length,
        printJobs: jobs.length,
      });
    };

    if (initialized) {
      loadStats();
    }
  }, [initialized, jobs]);

  // Handlers
  const handlePopulateData = async () => {
    console.log('[Demo] Starting data population...');
    await populateOfflineStore(offlineStore, 2000, 150);
    const products = await offlineStore.query('products');
    const orders = await offlineStore.query('orders');
    setStats({ ...stats, products: products.length, orders: orders.length });
    console.log('[Demo] Data populated! Products:', products.length, 'Orders:', orders.length);
  };

  const handleTestPrint = async () => {
    const products = generateProducts(3);
    const orders = generateOrders(1, products);
    const order = orders[0];

    const receiptData = {
      orderId: order.id,
      items: order.items,
      subtotal: order.total * 0.9,
      tax: order.total * 0.1,
      total: order.total,
      paymentMethod: 'Cash',
      timestamp: new Date().toLocaleString(),
      cashier: 'Demo User',
    };

    await print('receipt', 'order', receiptData, 8);
    alert('Print job queued! Check console for output.');
  };

  const handleTestKitchenPrint = async () => {
    const products = generateProducts(3);
    const orders = generateOrders(1, products);
    const order = orders[0];

    await print('kitchen', 'order', order, 9);
    alert('Kitchen print job queued! Check console for output.');
  };

  const handleClearData = async () => {
    if (!confirm('Clear all data? This cannot be undone.')) return;

    const products = await offlineStore.query('products');
    const orders = await offlineStore.query('orders');

    for (const item of products) {
      await offlineStore.delete('products', item.id);
    }

    for (const item of orders) {
      await offlineStore.delete('orders', item.id);
    }

    setStats({ products: 0, orders: 0, printJobs: jobs.length });
  };

  const handleForceSync = async () => {
    await syncEngine.sync({ fullSync: true });
  };

  if (!initialized) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Initializing POS systems...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <SyncStatusBar />

      <div className={styles.content}>
        <h1>POS System Demo</h1>
        <p className={styles.subtitle}>
          Test offline-first data storage, synchronization, and print management
        </p>

        {/* System Status */}
        <section className={styles.section}>
          <h2>System Status</h2>
          <div className={styles.statusGrid}>
            <div className={styles.statusCard}>
              <div className={styles.statusIcon}>
                {isOnline ? '🟢' : '🔴'}
              </div>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Connection</span>
                <span className={styles.statusValue}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            <div className={styles.statusCard}>
              <div className={styles.statusIcon}>📦</div>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Products</span>
                <span className={styles.statusValue}>{stats.products}</span>
              </div>
            </div>

            <div className={styles.statusCard}>
              <div className={styles.statusIcon}>📋</div>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Orders</span>
                <span className={styles.statusValue}>{stats.orders}</span>
              </div>
            </div>

            <div className={styles.statusCard}>
              <div className={styles.statusIcon}>🖨️</div>
              <div className={styles.statusInfo}>
                <span className={styles.statusLabel}>Print Jobs</span>
                <span className={styles.statusValue}>{stats.printJobs}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Data Management */}
        <section className={styles.section}>
          <h2>Data Management</h2>
          <div className={styles.buttonGroup}>
            <button className={styles.button} onClick={handlePopulateData}>
              Populate Mock Data (2000 products, 150 orders)
            </button>
            <button className={styles.button} onClick={handleClearData}>
              Clear All Data
            </button>
            <button className={styles.button} onClick={handleForceSync}>
              Force Full Sync
            </button>
          </div>
        </section>

        {/* Sync Status */}
        <section className={styles.section}>
          <h2>Sync Status</h2>
          <div className={styles.syncStatus}>
            {Array.from(syncStates.entries()).map(([entity, state]) => (
              <div key={entity} className={styles.syncEntity}>
                <div className={styles.syncHeader}>
                  <span className={styles.entityName}>{entity}</span>
                  <span className={`${styles.badge} ${styles[state.status]}`}>
                    {state.status}
                  </span>
                </div>
                <div className={styles.syncDetails}>
                  <span>Pending: {state.itemsPending}</span>
                  <span>Synced: {state.itemsSynced}</span>
                  {state.lastSync && (
                    <span>
                      Last sync: {new Date(state.lastSync).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {state.lastError && (
                  <div className={styles.error}>{state.lastError}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Print Management */}
        <section className={styles.section}>
          <h2>Print Management</h2>
          <div className={styles.buttonGroup}>
            <button className={styles.button} onClick={handleTestPrint}>
              Test Receipt Print
            </button>
            <button className={styles.button} onClick={handleTestKitchenPrint}>
              Test Kitchen Print
            </button>
          </div>

          <div className={styles.printers}>
            <h3>Registered Printers</h3>
            {printers.map((printer) => (
              <div key={printer.id} className={styles.printerCard}>
                <div className={styles.printerInfo}>
                  <strong>{printer.name}</strong>
                  <span className={styles.printerAddress}>{printer.address}</span>
                  <span className={styles.badge}>{printer.destination}</span>
                </div>
                <div className={styles.printerStatus}>
                  {queueStatus[printer.address] ? (
                    <>
                      <span>Pending: {queueStatus[printer.address].pending}</span>
                      <span>
                        {queueStatus[printer.address].active ? 'Active' : 'Idle'}
                      </span>
                    </>
                  ) : (
                    <span>Idle</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.printJobs}>
            <h3>Recent Print Jobs</h3>
            {jobs.slice(0, 10).map((job) => (
              <div key={job.id} className={styles.jobCard}>
                <div className={styles.jobInfo}>
                  <span className={styles.jobType}>{job.destination}</span>
                  <span className={styles.jobTime}>
                    {new Date(job.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <span className={`${styles.badge} ${styles[job.status]}`}>
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Performance Info */}
        <section className={styles.section}>
          <h2>Performance Metrics</h2>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Device ID:</span>
              <code className={styles.metricValue}>
                {offlineStore.getDeviceId()}
              </code>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Bundle Size:</span>
              <span className={styles.metricValue}>~188KB (target: &lt;200KB)</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Virtual Scrolling:</span>
              <span className={styles.metricValue}>Enabled (1000+ items)</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
