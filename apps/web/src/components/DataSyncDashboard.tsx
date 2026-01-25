import { useState } from "react";
import { useDataSync } from "../hooks/useDataSync";
import { useNats } from "../hooks/useNats";
import { useDuckDB } from "../hooks/useDuckDB";
import type { SyncManagerConfig } from "../services/data-sync-manager.service";
import "./DataSyncDashboard.css";

export function DataSyncDashboard() {
  const { connection, isConnected } = useNats();
  const { isInitialized: isDuckDBReady } = useDuckDB();
  const {
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
    clearLogs,
  } = useDataSync();

  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState<Partial<SyncManagerConfig>>({
    retentionHours: 24,
    validationEnabled: true,
    autoCleanupEnabled: true,
    memoryThresholdMB: 512,
    ingestionConfig: {
      batchSize: 100,
      flushIntervalMs: 1000,
      enableTradeIngestion: true,
      enableOrderBookIngestion: true,
      enableOHLCVIngestion: true,
    },
  });

  const handleStartSync = async () => {
    if (!connection) {
      return;
    }
    await startSync(connection);
  };

  const handleStopSync = () => {
    stopSync();
  };

  const handleCleanup = async () => {
    await performCleanup();
  };

  const handleConfigUpdate = () => {
    updateConfig(configForm);
    setShowConfig(false);
  };

  const formatUptime = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const formatBytes = (mb: number): string => {
    if (mb < 1) return `${(mb * 1024).toFixed(1)} KB`;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  const getHealthStatusColor = (healthy: boolean): string => {
    return healthy ? "healthy" : "unhealthy";
  };

  const getMemoryStatusColor = (usage: number, threshold: number): string => {
    const percentage = (usage / threshold) * 100;
    if (percentage < 50) return "low";
    if (percentage < 80) return "medium";
    return "high";
  };

  if (!isDuckDBReady) {
    return (
      <div className="data-sync-dashboard">
        <div className="loading-message">
          ⏳ Waiting for DuckDB to initialize...
        </div>
      </div>
    );
  }

  return (
    <div className="data-sync-dashboard">
      <div className="dashboard-header">
        <h3>🔄 Data Synchronization Manager</h3>
        <div className="status-indicators">
          <span
            className={`status-indicator ${isRunning ? "running" : "stopped"}`}
          >
            {isRunning ? "🟢 Running" : "🔴 Stopped"}
          </span>
          {health && (
            <span
              className={`status-indicator ${getHealthStatusColor(health.healthy)}`}
            >
              {health.healthy ? "✅ Healthy" : "⚠️ Issues"}
            </span>
          )}
        </div>
      </div>

      {error && <div className="error-message">❌ {error}</div>}

      <div className="controls-section">
        <div className="main-controls">
          {!isRunning ? (
            <button
              onClick={handleStartSync}
              disabled={isLoading || !isConnected || !connection}
              className="start-button"
            >
              {isLoading ? "⏳ Starting..." : "▶️ Start Sync"}
            </button>
          ) : (
            <button
              onClick={handleStopSync}
              disabled={isLoading}
              className="stop-button"
            >
              ⏸️ Stop Sync
            </button>
          )}

          <button
            onClick={handleCleanup}
            disabled={isLoading || !isRunning}
            className="cleanup-button"
          >
            {isLoading ? "⏳ Cleaning..." : "🧹 Manual Cleanup"}
          </button>

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="config-button"
          >
            ⚙️ Configuration
          </button>

          <button onClick={clearLogs} className="clear-logs-button">
            🗑️ Clear Logs
          </button>
        </div>

        {!isConnected && (
          <div className="warning">
            ⚠️ NATS connection required for data synchronization
          </div>
        )}
      </div>

      {showConfig && (
        <div className="config-panel">
          <h4>⚙️ Configuration</h4>
          <div className="config-form">
            <div className="config-group">
              <label>Retention Hours:</label>
              <input
                type="number"
                value={configForm.retentionHours || 24}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    retentionHours: parseInt(e.target.value),
                  })
                }
                min="1"
                max="168"
              />
            </div>

            <div className="config-group">
              <label>Memory Threshold (MB):</label>
              <input
                type="number"
                value={configForm.memoryThresholdMB || 512}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    memoryThresholdMB: parseInt(e.target.value),
                  })
                }
                min="128"
                max="2048"
              />
            </div>

            <div className="config-group">
              <label>Batch Size:</label>
              <input
                type="number"
                value={configForm.ingestionConfig?.batchSize || 100}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    ingestionConfig: {
                      ...configForm.ingestionConfig!,
                      batchSize: parseInt(e.target.value),
                    },
                  })
                }
                min="10"
                max="1000"
              />
            </div>

            <div className="config-group">
              <label>Flush Interval (ms):</label>
              <input
                type="number"
                value={configForm.ingestionConfig?.flushIntervalMs || 1000}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    ingestionConfig: {
                      ...configForm.ingestionConfig!,
                      flushIntervalMs: parseInt(e.target.value),
                    },
                  })
                }
                min="100"
                max="10000"
              />
            </div>

            <div className="config-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={configForm.validationEnabled || false}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      validationEnabled: e.target.checked,
                    })
                  }
                />
                Enable Validation
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={configForm.autoCleanupEnabled || false}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      autoCleanupEnabled: e.target.checked,
                    })
                  }
                />
                Auto Cleanup
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    configForm.ingestionConfig?.enableTradeIngestion || false
                  }
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      ingestionConfig: {
                        ...configForm.ingestionConfig!,
                        enableTradeIngestion: e.target.checked,
                      },
                    })
                  }
                />
                Trade Ingestion
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    configForm.ingestionConfig?.enableOrderBookIngestion ||
                    false
                  }
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      ingestionConfig: {
                        ...configForm.ingestionConfig!,
                        enableOrderBookIngestion: e.target.checked,
                      },
                    })
                  }
                />
                Order Book Ingestion
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    configForm.ingestionConfig?.enableOHLCVIngestion || false
                  }
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      ingestionConfig: {
                        ...configForm.ingestionConfig!,
                        enableOHLCVIngestion: e.target.checked,
                      },
                    })
                  }
                />
                OHLCV Ingestion
              </label>
            </div>

            <div className="config-actions">
              <button onClick={handleConfigUpdate} className="apply-button">
                ✅ Apply Configuration
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="cancel-button"
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="stats-grid">
          {/* System Stats */}
          <div className="stats-card">
            <h4>📊 System Statistics</h4>
            <div className="stat-row">
              <span>Uptime:</span>
              <span>{formatUptime(stats.uptime)}</span>
            </div>
            <div className="stat-row">
              <span>Total Trades:</span>
              <span>
                {stats.dataStats
                  ? formatNumber(stats.dataStats.totalTrades)
                  : "0"}
              </span>
            </div>
            <div className="stat-row">
              <span>Active Symbols:</span>
              <span>
                {stats.dataStats
                  ? formatNumber(stats.dataStats.symbolCount)
                  : "0"}
              </span>
            </div>
            <div className="stat-row">
              <span>Last Cleanup:</span>
              <span>
                {stats.lastCleanupAt
                  ? stats.lastCleanupAt.toLocaleString()
                  : "Never"}
              </span>
            </div>
          </div>

          {/* Ingestion Stats */}
          <div className="stats-card">
            <h4>📈 Ingestion Statistics</h4>
            <div className="stat-row">
              <span>Trades Ingested:</span>
              <span>{formatNumber(stats.ingestionStats.tradesIngested)}</span>
            </div>
            <div className="stat-row">
              <span>Order Book Entries:</span>
              <span>
                {formatNumber(stats.ingestionStats.orderBookEntriesIngested)}
              </span>
            </div>
            <div className="stat-row">
              <span>OHLCV Records:</span>
              <span>
                {formatNumber(stats.ingestionStats.ohlcvRecordsIngested)}
              </span>
            </div>
            <div className="stat-row">
              <span>Ingestion Errors:</span>
              <span
                className={stats.ingestionStats.errors > 0 ? "error-count" : ""}
              >
                {formatNumber(stats.ingestionStats.errors)}
              </span>
            </div>
          </div>

          {/* Validation Stats */}
          <div className="stats-card">
            <h4>✅ Validation Statistics</h4>
            <div className="stat-row">
              <span>Total Validated:</span>
              <span>{formatNumber(stats.validationStats.totalValidated)}</span>
            </div>
            <div className="stat-row">
              <span>Valid Records:</span>
              <span>{formatNumber(stats.validationStats.validRecords)}</span>
            </div>
            <div className="stat-row">
              <span>Invalid Records:</span>
              <span
                className={
                  stats.validationStats.invalidRecords > 0 ? "error-count" : ""
                }
              >
                {formatNumber(stats.validationStats.invalidRecords)}
              </span>
            </div>
            <div className="stat-row">
              <span>Error Rate:</span>
              <span
                className={
                  stats.validationStats.errorRate > 5 ? "error-count" : ""
                }
              >
                {stats.validationStats.errorRate.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Memory Usage */}
          {memoryInfo && (
            <div className="stats-card">
              <h4>💾 Memory Usage</h4>
              <div className="stat-row">
                <span>Estimated Usage:</span>
                <span
                  className={getMemoryStatusColor(
                    memoryInfo.estimatedMB,
                    configForm.memoryThresholdMB || 512,
                  )}
                >
                  {formatBytes(memoryInfo.estimatedMB)}
                </span>
              </div>
              <div className="stat-row">
                <span>Data Range:</span>
                <span>{memoryInfo.dataRangeHours.toFixed(1)} hours</span>
              </div>
              <div className="stat-row">
                <span>Trade Count:</span>
                <span>{formatNumber(memoryInfo.tradeCount)}</span>
              </div>
              {memoryInfo.recommendedAction &&
                memoryInfo.recommendedAction !== "NONE" && (
                  <div className="stat-row">
                    <span>Recommendation:</span>
                    <span className="warning-text">
                      {memoryInfo.recommendedAction}
                    </span>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* Health Status */}
      {health && !health.healthy && (
        <div className="health-issues">
          <h4>⚠️ Health Issues</h4>
          <ul>
            {health.issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error and Warning Logs */}
      {stats && (stats.errors.length > 0 || stats.warnings.length > 0) && (
        <div className="logs-section">
          {stats.errors.length > 0 && (
            <div className="error-logs">
              <h4>❌ Recent Errors</h4>
              <div className="log-entries">
                {stats.errors.slice(-5).map((error, index) => (
                  <div key={index} className="log-entry error">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.warnings.length > 0 && (
            <div className="warning-logs">
              <h4>⚠️ Recent Warnings</h4>
              <div className="log-entries">
                {stats.warnings.slice(-5).map((warning, index) => (
                  <div key={index} className="log-entry warning">
                    {warning}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
