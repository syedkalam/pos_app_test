import { useEffect, type ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { store } from "../store/store";
import { offlineStore } from "../../lib/OfflineDataStore";
import { syncEngine } from "../../lib/SyncEngine";

function AppInitializer({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize offline store and sync engine
    const initializeApp = async () => {
      try {
        console.log('[POS] Initializing offline store...');
        await offlineStore.init();
        console.log('[POS] Offline store initialized successfully');

        // Start auto-sync (every 30 seconds)
        console.log('[POS] Starting auto-sync...');
        syncEngine.startAutoSync(30000);
        console.log('[POS] Auto-sync started');
      } catch (error) {
        console.error('[POS] Failed to initialize app:', error);
      }
    };

    initializeApp();

    // Cleanup on unmount
    return () => {
      syncEngine.stopAutoSync();
    };
  }, []);

  return <>{children}</>;
}

export default function AppProvider({ children }: { children: ReactNode }) {
  return (
    <ReduxProvider store={store}>
      <AppInitializer>{children}</AppInitializer>
    </ReduxProvider>
  );
}
