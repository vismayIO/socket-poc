import dataIngestionService, {
  type DataIngestionConfig,
  type IngestionStats,
} from "./data-ingestion.service";
import dataValidationService, {
  type ValidationStats,
} from "./data-validation.service";
import duckDBService, { type DataStats } from "./duckdb.service";
import type { NatsConnection } from "nats.ws";

export interface SyncManagerConfig {
  ingestionConfig: DataIngestionConfig;
  retentionHours: number;
  validationEnabled: boolean;
  monitoringIntervalMs: number;
  autoCleanupEnabled: boolean;
  cleanupIntervalMs: number;
  memoryThresholdMB: number;
}

export interface SyncManagerStats {
  isRunning: boolean;
  uptime: number; // milliseconds
  ingestionStats: IngestionStats;
  validationStats: ValidationStats;
  dataStats: DataStats | null;
  memoryUsage: number; // MB (estimated)
  lastCleanupAt: Date | null;
  errors: string[];
  warnings: string[];
}

export interface MemoryUsageInfo {
  estimatedMB: number;
  tradeCount: number;
  symbolCount: number;
  dataRangeHours: number;
  recommendedAction?: "NONE" | "CLEANUP" | "REDUCE_RETENTION";
}

class DataSyncManagerService {
  private config: SyncManagerConfig;
  private isRunning = false;
  private startTime: Date | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private errors: string[] = [];
  private warnings: string[] = [];
  private lastCleanupAt: Date | null = null;

  constructor(config: Partial<SyncManagerConfig> = {}) {
    this.config = {
      ingestionConfig: {
        batchSize: 100,
        flushIntervalMs: 1000,
        enableTradeIngestion: true,
        enableOrderBookIngestion: true,
        enableOHLCVIngestion: true,
      },
      retentionHours: 24,
      validationEnabled: true,
      monitoringIntervalMs: 5000, // 5 seconds
      autoCleanupEnabled: true,
      cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
      memoryThresholdMB: 512,
      ...config,
    };
  }

  /**
   * Start the data synchronization manager
   */
  async startSync(natsConnection: NatsConnection): Promise<void> {
    if (this.isRunning) {
      console.log("⚠️ Data sync manager already running");
      return;
    }

    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    console.log("🚀 Starting data synchronization manager...");
    this.isRunning = true;
    this.startTime = new Date();
    this.errors = [];
    this.warnings = [];

    try {
      // Configure and start data ingestion
      dataIngestionService.updateConfig(this.config.ingestionConfig);
      await dataIngestionService.startIngestion(natsConnection);

      // Start monitoring
      this.startMonitoring();

      // Start automatic cleanup if enabled
      if (this.config.autoCleanupEnabled) {
        this.startAutoCleanup();
      }

      console.log("✅ Data synchronization manager started successfully");
    } catch (error) {
      this.isRunning = false;
      this.startTime = null;
      const message =
        error instanceof Error ? error.message : "Failed to start sync manager";
      this.addError(message);
      throw error;
    }
  }

  /**
   * Stop the data synchronization manager
   */
  stopSync(): void {
    if (!this.isRunning) {
      return;
    }

    console.log("🛑 Stopping data synchronization manager...");
    this.isRunning = false;

    // Stop data ingestion
    dataIngestionService.stopIngestion();

    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Stop auto cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.startTime = null;
    console.log("✅ Data synchronization manager stopped");
  }

  /**
   * Get comprehensive synchronization statistics
   */
  async getSyncStats(): Promise<SyncManagerStats> {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    const ingestionStats = dataIngestionService.getStats();
    const validationStats = dataValidationService.getValidationStats();
    const dataStats = duckDBService.isReady()
      ? await duckDBService.getDataStats()
      : null;
    const memoryUsage = await this.estimateMemoryUsage();

    return {
      isRunning: this.isRunning,
      uptime,
      ingestionStats,
      validationStats,
      dataStats,
      memoryUsage: memoryUsage.estimatedMB,
      lastCleanupAt: this.lastCleanupAt,
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  /**
   * Manually trigger data cleanup
   */
  async performCleanup(retentionHours?: number): Promise<void> {
    const hours = retentionHours || this.config.retentionHours;

    try {
      console.log(`🧹 Starting manual cleanup (retention: ${hours} hours)...`);
      await duckDBService.clearOldData(hours);
      this.lastCleanupAt = new Date();
      console.log("✅ Manual cleanup completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cleanup failed";
      this.addError(`Cleanup failed: ${message}`);
      throw error;
    }
  }

  /**
   * Get detailed memory usage information
   */
  async getMemoryUsageInfo(): Promise<MemoryUsageInfo> {
    return await this.estimateMemoryUsage();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SyncManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update ingestion config if running
    if (this.isRunning) {
      dataIngestionService.updateConfig(this.config.ingestionConfig);

      // Restart monitoring with new interval
      if (newConfig.monitoringIntervalMs && this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.startMonitoring();
      }

      // Restart cleanup with new interval
      if (newConfig.cleanupIntervalMs && this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        if (this.config.autoCleanupEnabled) {
          this.startAutoCleanup();
        }
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SyncManagerConfig {
    return { ...this.config };
  }

  /**
   * Check system health
   */
  async checkHealth(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check if DuckDB is ready
    if (!duckDBService.isReady()) {
      issues.push("DuckDB service not ready");
    }

    // Check if ingestion is running when it should be
    if (this.isRunning && !dataIngestionService.isIngesting()) {
      issues.push("Data ingestion not running");
    }

    // Check error rate
    const validationStats = dataValidationService.getValidationStats();
    if (validationStats.errorRate > 10) {
      // More than 10% error rate
      issues.push(
        `High validation error rate: ${validationStats.errorRate.toFixed(2)}%`,
      );
    }

    // Check memory usage
    const memoryInfo = await this.estimateMemoryUsage();
    if (memoryInfo.estimatedMB > this.config.memoryThresholdMB) {
      issues.push(
        `Memory usage above threshold: ${memoryInfo.estimatedMB}MB > ${this.config.memoryThresholdMB}MB`,
      );
    }

    // Check recent errors
    const recentErrors = this.errors.filter(
      (error) => Date.now() - new Date(error).getTime() < 5 * 60 * 1000, // Last 5 minutes
    );
    if (recentErrors.length > 5) {
      issues.push(
        `High error rate: ${recentErrors.length} errors in last 5 minutes`,
      );
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Clear error and warning logs
   */
  clearLogs(): void {
    this.errors = [];
    this.warnings = [];
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCheck();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Monitoring check failed";
        this.addError(`Monitoring error: ${message}`);
      }
    }, this.config.monitoringIntervalMs);
  }

  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Auto cleanup failed";
        this.addError(`Auto cleanup error: ${message}`);
      }
    }, this.config.cleanupIntervalMs);
  }

  private async performMonitoringCheck(): Promise<void> {
    // Check memory usage
    const memoryInfo = await this.estimateMemoryUsage();
    if (memoryInfo.estimatedMB > this.config.memoryThresholdMB) {
      this.addWarning(`Memory usage high: ${memoryInfo.estimatedMB}MB`);

      if (memoryInfo.recommendedAction === "CLEANUP") {
        this.addWarning(
          "Triggering automatic cleanup due to high memory usage",
        );
        await this.performCleanup();
      }
    }

    // Check validation error rate
    const validationStats = dataValidationService.getValidationStats();
    if (validationStats.errorRate > 5) {
      this.addWarning(
        `Validation error rate elevated: ${validationStats.errorRate.toFixed(2)}%`,
      );
    }

    // Check ingestion queue sizes
    const queueSizes = dataIngestionService.getQueueSizes();
    const totalQueueSize =
      queueSizes.trades + queueSizes.orderBook + queueSizes.ohlcv;
    if (totalQueueSize > this.config.ingestionConfig.batchSize * 5) {
      this.addWarning(
        `Large ingestion queues: ${totalQueueSize} items pending`,
      );
    }
  }

  private async estimateMemoryUsage(): Promise<MemoryUsageInfo> {
    try {
      const dataStats = await duckDBService.getDataStats();

      // Rough estimation: each trade ~200 bytes, each symbol ~50 bytes base
      const estimatedTradeMemory = dataStats.totalTrades * 0.0002; // MB
      const estimatedSymbolMemory = dataStats.symbolCount * 0.00005; // MB
      const estimatedIndexMemory = dataStats.totalTrades * 0.00005; // MB for indexes

      const totalEstimatedMB =
        estimatedTradeMemory + estimatedSymbolMemory + estimatedIndexMemory;

      const dataRangeHours =
        dataStats.dataRangeStart && dataStats.dataRangeEnd
          ? (dataStats.dataRangeEnd.getTime() -
              dataStats.dataRangeStart.getTime()) /
            (1000 * 60 * 60)
          : 0;

      let recommendedAction: "NONE" | "CLEANUP" | "REDUCE_RETENTION" = "NONE";

      if (totalEstimatedMB > this.config.memoryThresholdMB * 0.8) {
        recommendedAction = "CLEANUP";
      } else if (totalEstimatedMB > this.config.memoryThresholdMB * 1.2) {
        recommendedAction = "REDUCE_RETENTION";
      }

      return {
        estimatedMB: Math.round(totalEstimatedMB * 100) / 100,
        tradeCount: dataStats.totalTrades,
        symbolCount: dataStats.symbolCount,
        dataRangeHours: Math.round(dataRangeHours * 100) / 100,
        recommendedAction,
      };
    } catch (error) {
      console.error("Failed to estimate memory usage:", error);
      return {
        estimatedMB: 0,
        tradeCount: 0,
        symbolCount: 0,
        dataRangeHours: 0,
      };
    }
  }

  private addError(message: string): void {
    const timestamp = new Date().toISOString();
    this.errors.push(`[${timestamp}] ${message}`);

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100);
    }

    console.error(`❌ Sync Manager Error: ${message}`);
  }

  private addWarning(message: string): void {
    const timestamp = new Date().toISOString();
    this.warnings.push(`[${timestamp}] ${message}`);

    // Keep only last 100 warnings
    if (this.warnings.length > 100) {
      this.warnings = this.warnings.slice(-100);
    }

    console.warn(`⚠️ Sync Manager Warning: ${message}`);
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const dataSyncManagerService = new DataSyncManagerService();
export default dataSyncManagerService;
