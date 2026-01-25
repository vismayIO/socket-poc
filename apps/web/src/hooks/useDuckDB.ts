import { useState, useEffect, useCallback } from "react";
import duckDBService, {
  type TradeData,
  type OrderBookData,
  type OHLCVData,
  type DataStats,
} from "../services/duckdb.service";

export interface UseDuckDBResult {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  dataStats: DataStats | null;
  initialize: () => Promise<void>;
  ingestTrades: (trades: TradeData[]) => Promise<void>;
  ingestOrderBook: (orderBook: OrderBookData[]) => Promise<void>;
  ingestOHLCV: (ohlcv: OHLCVData[]) => Promise<void>;
  executeQuery: (sql: string) => Promise<unknown[]>;
  refreshStats: () => Promise<void>;
  clearOldData: (retentionHours?: number) => Promise<void>;
}

export function useDuckDB(): UseDuckDBResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataStats, setDataStats] = useState<DataStats | null>(null);

  const initialize = useCallback(async () => {
    if (isInitialized) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await duckDBService.initializeDatabase();
      setIsInitialized(true);

      // Get initial stats
      const stats = await duckDBService.getDataStats();
      setDataStats(stats);

      console.log("✅ DuckDB hook initialized");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to initialize DuckDB";
      setError(message);
      console.error("❌ DuckDB initialization failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized]);

  const ingestTrades = useCallback(
    async (trades: TradeData[]) => {
      if (!isInitialized) {
        throw new Error("DuckDB not initialized");
      }

      try {
        await duckDBService.ingestTradeData(trades);
        // Refresh stats after ingestion
        const stats = await duckDBService.getDataStats();
        setDataStats(stats);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to ingest trades";
        setError(message);
        throw err;
      }
    },
    [isInitialized],
  );

  const ingestOrderBook = useCallback(
    async (orderBook: OrderBookData[]) => {
      if (!isInitialized) {
        throw new Error("DuckDB not initialized");
      }

      try {
        await duckDBService.ingestOrderBookData(orderBook);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to ingest order book";
        setError(message);
        throw err;
      }
    },
    [isInitialized],
  );

  const ingestOHLCV = useCallback(
    async (ohlcv: OHLCVData[]) => {
      if (!isInitialized) {
        throw new Error("DuckDB not initialized");
      }

      try {
        await duckDBService.ingestOHLCVData(ohlcv);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to ingest OHLCV";
        setError(message);
        throw err;
      }
    },
    [isInitialized],
  );

  const executeQuery = useCallback(
    async (sql: string): Promise<unknown[]> => {
      if (!isInitialized) {
        throw new Error("DuckDB not initialized");
      }

      try {
        return await duckDBService.executeQuery(sql);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to execute query";
        setError(message);
        throw err;
      }
    },
    [isInitialized],
  );

  const refreshStats = useCallback(async () => {
    if (!isInitialized) {
      return;
    }

    try {
      const stats = await duckDBService.getDataStats();
      setDataStats(stats);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh stats";
      setError(message);
    }
  }, [isInitialized]);

  const clearOldData = useCallback(
    async (retentionHours?: number) => {
      if (!isInitialized) {
        return;
      }

      try {
        await duckDBService.clearOldData(retentionHours);
        // Refresh stats after cleanup
        const stats = await duckDBService.getDataStats();
        setDataStats(stats);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to clear old data";
        setError(message);
      }
    },
    [isInitialized],
  );

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInitialized) {
        duckDBService.close();
      }
    };
  }, [isInitialized]);

  return {
    isInitialized,
    isLoading,
    error,
    dataStats,
    initialize,
    ingestTrades,
    ingestOrderBook,
    ingestOHLCV,
    executeQuery,
    refreshStats,
    clearOldData,
  };
}
