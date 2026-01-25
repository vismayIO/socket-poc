import { useEffect, useState, useCallback } from "react";
import { useDuckDB } from "../hooks/useDuckDB";
import { useNats } from "../hooks/useNats";
import dataIngestionService, {
  type IngestionStats,
} from "../services/data-ingestion.service";
import "./DuckDBStatus.css";

export function DuckDBStatus() {
  const {
    isInitialized,
    isLoading,
    error,
    dataStats,
    refreshStats,
    clearOldData,
  } = useDuckDB();

  const { connection, isConnected } = useNats();
  const [ingestionStats, setIngestionStats] = useState<IngestionStats | null>(
    null,
  );
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionError, setIngestionError] = useState<string | null>(null);

  const startIngestion = useCallback(async () => {
    if (!connection) {
      setIngestionError("NATS connection not available");
      return;
    }

    try {
      setIngestionError(null);
      await dataIngestionService.startIngestion(connection);
      setIsIngesting(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start ingestion";
      setIngestionError(message);
    }
  }, [connection]);

  const stopIngestion = useCallback(() => {
    dataIngestionService.stopIngestion();
    setIsIngesting(false);
  }, []);

  // Update ingestion stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (dataIngestionService.isIngesting()) {
        setIngestionStats(dataIngestionService.getStats());
        setIsIngesting(true);
      } else {
        setIsIngesting(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Auto-start ingestion when both DuckDB and NATS are ready
  // Note: Removed automatic start to prevent cascading renders
  // Users can manually start ingestion using the button

  const handleClearOldData = async () => {
    try {
      await clearOldData(24); // Clear data older than 24 hours
      await refreshStats();
    } catch (err) {
      console.error("Failed to clear old data:", err);
    }
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return "N/A";
    return date.toLocaleString();
  };

  return (
    <div className="duckdb-status">
      <div className="status-header">
        <h3>🦆 DuckDB WASM Analytics</h3>
        <div className="status-indicators">
          <span
            className={`status-indicator ${isInitialized ? "connected" : "disconnected"}`}
          >
            {isInitialized ? "✅ Ready" : "❌ Not Ready"}
          </span>
          <span
            className={`status-indicator ${isIngesting ? "connected" : "disconnected"}`}
          >
            {isIngesting ? "📊 Ingesting" : "⏸️ Paused"}
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="loading">
          <span>🔄 Initializing DuckDB WASM...</span>
        </div>
      )}

      {error && (
        <div className="error">
          <span>❌ Error: {error}</span>
        </div>
      )}

      {ingestionError && (
        <div className="error">
          <span>❌ Ingestion Error: {ingestionError}</span>
        </div>
      )}

      {isInitialized && (
        <div className="stats-grid">
          <div className="stats-section">
            <h4>📊 Data Statistics</h4>
            <div className="stats-row">
              <span>Total Trades:</span>
              <span>
                {dataStats ? formatNumber(dataStats.totalTrades) : "0"}
              </span>
            </div>
            <div className="stats-row">
              <span>Symbols:</span>
              <span>
                {dataStats ? formatNumber(dataStats.symbolCount) : "0"}
              </span>
            </div>
            <div className="stats-row">
              <span>Data Range:</span>
              <span>
                {dataStats?.dataRangeStart
                  ? formatDate(dataStats.dataRangeStart)
                  : "N/A"}{" "}
                -
                {dataStats?.dataRangeEnd
                  ? formatDate(dataStats.dataRangeEnd)
                  : "N/A"}
              </span>
            </div>
          </div>

          {ingestionStats && (
            <div className="stats-section">
              <h4>📈 Ingestion Statistics</h4>
              <div className="stats-row">
                <span>Trades Ingested:</span>
                <span>{formatNumber(ingestionStats.tradesIngested)}</span>
              </div>
              <div className="stats-row">
                <span>Order Book Entries:</span>
                <span>
                  {formatNumber(ingestionStats.orderBookEntriesIngested)}
                </span>
              </div>
              <div className="stats-row">
                <span>OHLCV Records:</span>
                <span>{formatNumber(ingestionStats.ohlcvRecordsIngested)}</span>
              </div>
              <div className="stats-row">
                <span>Last Ingested:</span>
                <span>{formatDate(ingestionStats.lastIngestedAt)}</span>
              </div>
              <div className="stats-row">
                <span>Errors:</span>
                <span
                  className={ingestionStats.errors > 0 ? "error-count" : ""}
                >
                  {formatNumber(ingestionStats.errors)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="controls">
        {isInitialized && (
          <>
            <button
              onClick={isIngesting ? stopIngestion : startIngestion}
              disabled={!isConnected}
              className={isIngesting ? "stop-button" : "start-button"}
            >
              {isIngesting ? "⏸️ Stop Ingestion" : "▶️ Start Ingestion"}
            </button>

            <button onClick={refreshStats} className="refresh-button">
              🔄 Refresh Stats
            </button>

            <button onClick={handleClearOldData} className="clear-button">
              🧹 Clear Old Data
            </button>
          </>
        )}
      </div>

      {!isConnected && (
        <div className="warning">
          ⚠️ NATS connection required for data ingestion
        </div>
      )}
    </div>
  );
}
