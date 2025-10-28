/**
 * Sync Status Bar Component
 * Displays real-time synchronization status and offline indicators
 */

import { useSyncEngine } from '../../hooks/useSyncEngine';
import { useOnlineStatus } from '../../hooks/useOfflineStore';
import styles from './SyncStatusBar.module.scss';

export function SyncStatusBar() {
  const { syncStates, stats, sync } = useSyncEngine();
  const isOnline = useOnlineStatus();

  const handleSyncClick = () => {
    if (isOnline && !stats.syncInProgress) {
      sync({ fullSync: false });
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return 'offline';
    if (stats.syncInProgress) return 'syncing';
    if (stats.totalPending > 0) return 'pending';
    return 'synced';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (stats.syncInProgress) return 'Syncing...';
    if (stats.totalPending > 0) return `${stats.totalPending} pending`;
    return 'All synced';
  };

  const statusColor = getStatusColor();

  return (
    <div className={`${styles.container} ${styles[statusColor]}`}>
      <div className={styles.indicator}>
        <div className={styles.dot} />
        <span className={styles.text}>{getStatusText()}</span>
      </div>

      {stats.lastSync && (
        <span className={styles.lastSync}>
          Last sync: {formatRelativeTime(stats.lastSync)}
        </span>
      )}

      {isOnline && !stats.syncInProgress && (
        <button
          className={styles.syncButton}
          onClick={handleSyncClick}
          disabled={stats.syncInProgress}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.65 2.35a7.5 7.5 0 1 0 0 11.3l1.06-1.06a9 9 0 1 1 0-9.18l-1.06-1.06z" />
            <path d="M14 4V0h-1v4h-4v1h5z" />
          </svg>
        </button>
      )}

      {stats.syncInProgress && (
        <div className={styles.progressContainer}>
          {Array.from(syncStates.entries()).map(([entity, state]) => (
            <div key={entity} className={styles.entityProgress}>
              <span className={styles.entityName}>{entity}</span>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
