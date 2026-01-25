import { useState, useEffect, useCallback } from "react";
import dataSyncManagerService, {
  type SyncManagerConfig,
  type SyncManagerStats,
  type MemoryUsageInfo,
} from "../services/data-sync-manager.service";
import type { NatsConnection } from "nats.ws";

export interface UseDataSyncResult {
  isRunning: boolean;
  isLoading: boolean;
  error: string | null;
  stats: SyncManagerStats | null;
  memoryInfo: MemoryUsageInfo | null;
  health: { healthy: boolean; issues: string[] } | null;

  startSync: (connection: NatsConnection) => Promise<void>;
  stopSync: () => void;
  performCleanup: (retentionHours?: number) => Promise<void>;
  updateConfig: (config: Partial<SyncManagerConfig>) => void;
  refreshStats: () => Promise<void>;
  refreshMemoryInfo: () => Promise<void>;
  checkHealth: () => Promise<void>;
  clearLogs: () => void;
}

export function useDataSync(): UseDataSyncResult {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SyncManagerStats | null>(null);
  const [memoryInfo, setMemoryInfo] = useState<MemoryUsageInfo | null>(null);
  const [health, setHealth] = useState<{
    healthy: boolean;
    issues: string[];
  } | null>(null);

  const handleError = (err: unknown, operation: string) => {
    const message =
      err instanceof Error ? err.message : `Failed to ${operation}`;
    setError(message);
    console.error(`Data sync error (${operation}):`, err);
  };

  const startSync = useCallback(async (connection: NatsConnection) => {
    setIsLoading(true);
    setError(null);

    try {
      await dataSyncManagerService.startSync(connection);
      setIsRunning(true);

      // Get initial stats
      const initialStats = await dataSyncManagerService.getSyncStats();
      setStats(initialStats);
    } catch (err) {
      handleError(err, "start sync");
      setIsRunning(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopSync = useCallback(() => {
    dataSyncManagerService.stopSync();
    setIsRunning(false);
    setStats(null);
    setMemoryInfo(null);
    setHealth(null);
  }, []);

  const performCleanup = useCallback(async (retentionHours?: number) => {
    setIsLoading(true);
    setError(null);

    try {
      await dataSyncManagerService.performCleanup(retentionHours);

      // Refresh stats after cleanup
      const updatedStats = await dataSyncManagerService.getSyncStats();
      setStats(updatedStats);

      const updatedMemoryInfo =
        await dataSyncManagerService.getMemoryUsageInfo();
      setMemoryInfo(updatedMemoryInfo);
    } catch (err) {
      handleError(err, "perform cleanup");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateConfig = useCallback((config: Partial<SyncManagerConfig>) => {
    try {
      dataSyncManagerService.updateConfig(config);
      setError(null);
    } catch (err) {
      handleError(err, "update config");
    }
  }, []);

  const refreshStats = useCallback(async () => {
    if (!dataSyncManagerService.getIsRunning()) {
      return;
    }

    try {
      const updatedStats = await dataSyncManagerService.getSyncStats();
      setStats(updatedStats);
      setError(null);
    } catch (err) {
      handleError(err, "refresh stats");
    }
  }, []);

  const refreshMemoryInfo = useCallback(async () => {
    try {
      const updatedMemoryInfo =
        await dataSyncManagerService.getMemoryUsageInfo();
      setMemoryInfo(updatedMemoryInfo);
      setError(null);
    } catch (err) {
      handleError(err, "refresh memory info");
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const healthStatus = await dataSyncManagerService.checkHealth();
      setHealth(healthStatus);
      setError(null);
    } catch (err) {
      handleError(err, "check health");
    }
  }, []);

  const clearLogs = useCallback(() => {
    dataSyncManagerService.clearLogs();
    setError(null);
  }, []);

  // Auto-refresh stats when running
  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const interval = setInterval(() => {
      refreshStats();
      refreshMemoryInfo();
      checkHealth();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [isRunning, refreshStats, refreshMemoryInfo, checkHealth]);

  // Initialize running state
  useEffect(() => {
    setIsRunning(dataSyncManagerService.getIsRunning());
  }, []);

  return {
    isRunning,
    isLoading,
    error,
    stats,
    memoryInfo,
    health,
    startSync,
    stopSync,
    performCleanup,
    updateConfig,
    refreshStats,
    refreshMemoryInfo,
    checkHealth,
    clearLogs,
  };
}
