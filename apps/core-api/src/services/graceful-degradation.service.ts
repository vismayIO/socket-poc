import { EventEmitter } from "events";

export interface DegradationConfig {
  cpuThreshold: number;
  memoryThreshold: number;
  connectionThreshold: number;
  errorRateThreshold: number;
  latencyThreshold: number;
}

export interface DegradationState {
  level: "normal" | "degraded" | "critical";
  activeFeatures: string[];
  disabledFeatures: string[];
  reason: string;
  timestamp: Date;
}

export interface FeatureConfig {
  name: string;
  priority: number; // Lower number = higher priority (kept longer)
  degradationLevel: "degraded" | "critical";
  fallbackFunction?: () => any;
}

export class GracefulDegradationService extends EventEmitter {
  private currentState: DegradationState = {
    level: "normal",
    activeFeatures: [],
    disabledFeatures: [],
    reason: "",
    timestamp: new Date(),
  };

  private features = new Map<string, FeatureConfig>();
  private config: DegradationConfig;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config?: Partial<DegradationConfig>) {
    super();

    this.config = {
      cpuThreshold: 80, // 80% CPU usage
      memoryThreshold: 85, // 85% memory usage
      connectionThreshold: 1000, // 1000 concurrent connections
      errorRateThreshold: 10, // 10% error rate
      latencyThreshold: 100, // 100ms average latency
      ...config,
    };

    this.initializeFeatures();
    this.startMonitoring();
  }

  /**
   * Register a feature for graceful degradation
   */
  registerFeature(config: FeatureConfig): void {
    this.features.set(config.name, config);
    this.currentState.activeFeatures.push(config.name);
  }

  /**
   * Check if a feature is currently enabled
   */
  isFeatureEnabled(featureName: string): boolean {
    return this.currentState.activeFeatures.includes(featureName);
  }

  /**
   * Execute feature with fallback if disabled
   */
  async executeFeature<T>(
    featureName: string,
    primaryFunction: () => Promise<T>,
    fallbackFunction?: () => Promise<T>,
  ): Promise<T> {
    if (this.isFeatureEnabled(featureName)) {
      try {
        return await primaryFunction();
      } catch (error) {
        this.emit("feature_error", {
          feature: featureName,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date(),
        });

        // If primary function fails, try fallback
        if (fallbackFunction) {
          return await fallbackFunction();
        }
        throw error;
      }
    } else {
      // Feature is disabled, use fallback
      const feature = this.features.get(featureName);
      const fallback = fallbackFunction || feature?.fallbackFunction;

      if (fallback) {
        this.emit("fallback_executed", {
          feature: featureName,
          reason: "feature_disabled",
          timestamp: new Date(),
        });
        return await fallback();
      } else {
        throw new Error(
          `Feature ${featureName} is disabled and no fallback provided`,
        );
      }
    }
  }

  /**
   * Get current degradation state
   */
  getCurrentState(): DegradationState {
    return { ...this.currentState };
  }

  /**
   * Manually trigger degradation
   */
  triggerDegradation(level: "degraded" | "critical", reason: string): void {
    this.applyDegradation(level, reason);
  }

  /**
   * Manually restore normal operation
   */
  restoreNormalOperation(): void {
    this.applyDegradation("normal", "Manual restoration");
  }

  /**
   * Update degradation configuration
   */
  updateConfig(newConfig: Partial<DegradationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit("config_updated", {
      config: this.config,
      timestamp: new Date(),
    });
  }

  private initializeFeatures(): void {
    // Register core features with their degradation levels
    const coreFeatures: FeatureConfig[] = [
      {
        name: "real_time_streaming",
        priority: 1,
        degradationLevel: "critical",
        fallbackFunction: () => ({
          message: "Real-time streaming temporarily unavailable",
        }),
      },
      {
        name: "historical_data_queries",
        priority: 2,
        degradationLevel: "degraded",
        fallbackFunction: () => ({
          message: "Historical data queries limited",
        }),
      },
      {
        name: "complex_analytics",
        priority: 3,
        degradationLevel: "degraded",
        fallbackFunction: () => ({
          message: "Complex analytics temporarily disabled",
        }),
      },
      {
        name: "order_book_snapshots",
        priority: 4,
        degradationLevel: "degraded",
        fallbackFunction: () => ({
          message: "Order book snapshots reduced frequency",
        }),
      },
      {
        name: "ohlcv_aggregation",
        priority: 5,
        degradationLevel: "critical",
        fallbackFunction: () => ({
          message: "OHLCV aggregation temporarily disabled",
        }),
      },
      {
        name: "detailed_metrics",
        priority: 6,
        degradationLevel: "degraded",
        fallbackFunction: () => ({
          message: "Detailed metrics collection reduced",
        }),
      },
      {
        name: "admin_operations",
        priority: 7,
        degradationLevel: "critical",
        fallbackFunction: () => ({
          message: "Admin operations temporarily restricted",
        }),
      },
    ];

    coreFeatures.forEach((feature) => this.registerFeature(feature));
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkSystemHealth();
    }, 10000); // Check every 10 seconds
  }

  private async checkSystemHealth(): Promise<void> {
    try {
      const systemMetrics = await this.getSystemMetrics();
      const degradationLevel = this.calculateDegradationLevel(systemMetrics);

      if (degradationLevel !== this.currentState.level) {
        const reason = this.getDegradationReason(systemMetrics);
        this.applyDegradation(degradationLevel, reason);
      }
    } catch (error) {
      console.error("Error checking system health for degradation:", error);
    }
  }

  private async getSystemMetrics(): Promise<{
    cpuUsage: number;
    memoryUsage: number;
    connectionCount: number;
    errorRate: number;
    averageLatency: number;
  }> {
    // Get memory usage
    const memUsage = process.memoryUsage();
    const memoryUsage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // Get CPU usage (simplified - in production you'd use a proper CPU monitoring library)
    const cpuUsage = process.cpuUsage();
    const cpuPercent =
      ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime()) * 100;

    // Get connection count and other metrics from services
    let connectionCount = 0;
    let errorRate = 0;
    let averageLatency = 0;

    try {
      const { webSocketService } = await import("../routes/websocket.routes");
      const { metricsService } = await import("./metrics.service");

      const wsStats = webSocketService.getConnectionStats();
      const metricsSnapshot = metricsService.getMetricsSnapshot();

      connectionCount = wsStats.totalConnections;
      errorRate = metricsSnapshot.errors.totalErrorRate;
      averageLatency = metricsSnapshot.latency.dataGenerationToClient.avg;
    } catch (error) {
      // Services might not be available during startup
      console.warn(
        "Could not get service metrics for degradation check:",
        error,
      );
    }

    return {
      cpuUsage: Math.min(cpuPercent, 100), // Cap at 100%
      memoryUsage,
      connectionCount,
      errorRate,
      averageLatency,
    };
  }

  private calculateDegradationLevel(metrics: {
    cpuUsage: number;
    memoryUsage: number;
    connectionCount: number;
    errorRate: number;
    averageLatency: number;
  }): "normal" | "degraded" | "critical" {
    // Critical conditions
    if (
      metrics.cpuUsage > this.config.cpuThreshold + 15 ||
      metrics.memoryUsage > this.config.memoryThreshold + 10 ||
      metrics.errorRate > this.config.errorRateThreshold * 2 ||
      metrics.averageLatency > this.config.latencyThreshold * 3
    ) {
      return "critical";
    }

    // Degraded conditions
    if (
      metrics.cpuUsage > this.config.cpuThreshold ||
      metrics.memoryUsage > this.config.memoryThreshold ||
      metrics.connectionCount > this.config.connectionThreshold ||
      metrics.errorRate > this.config.errorRateThreshold ||
      metrics.averageLatency > this.config.latencyThreshold
    ) {
      return "degraded";
    }

    return "normal";
  }

  private getDegradationReason(metrics: {
    cpuUsage: number;
    memoryUsage: number;
    connectionCount: number;
    errorRate: number;
    averageLatency: number;
  }): string {
    const reasons: string[] = [];

    if (metrics.cpuUsage > this.config.cpuThreshold) {
      reasons.push(`High CPU usage: ${metrics.cpuUsage.toFixed(1)}%`);
    }
    if (metrics.memoryUsage > this.config.memoryThreshold) {
      reasons.push(`High memory usage: ${metrics.memoryUsage.toFixed(1)}%`);
    }
    if (metrics.connectionCount > this.config.connectionThreshold) {
      reasons.push(`High connection count: ${metrics.connectionCount}`);
    }
    if (metrics.errorRate > this.config.errorRateThreshold) {
      reasons.push(`High error rate: ${metrics.errorRate.toFixed(1)}%`);
    }
    if (metrics.averageLatency > this.config.latencyThreshold) {
      reasons.push(`High latency: ${metrics.averageLatency.toFixed(1)}ms`);
    }

    return reasons.length > 0
      ? reasons.join(", ")
      : "System metrics within normal range";
  }

  private applyDegradation(
    level: "normal" | "degraded" | "critical",
    reason: string,
  ): void {
    const previousLevel = this.currentState.level;

    // Reset to all features enabled
    this.currentState.activeFeatures = Array.from(this.features.keys());
    this.currentState.disabledFeatures = [];

    // Apply degradation based on level
    if (level === "degraded") {
      this.disableFeaturesAtLevel("degraded");
    } else if (level === "critical") {
      this.disableFeaturesAtLevel("degraded");
      this.disableFeaturesAtLevel("critical");
    }

    this.currentState.level = level;
    this.currentState.reason = reason;
    this.currentState.timestamp = new Date();

    // Emit events
    if (previousLevel !== level) {
      this.emit("degradation_level_changed", {
        previousLevel,
        newLevel: level,
        reason,
        activeFeatures: this.currentState.activeFeatures,
        disabledFeatures: this.currentState.disabledFeatures,
        timestamp: new Date(),
      });

      console.log(
        `System degradation level changed from ${previousLevel} to ${level}: ${reason}`,
      );
    }
  }

  private disableFeaturesAtLevel(level: "degraded" | "critical"): void {
    // Sort features by priority (higher priority features are disabled last)
    const featuresToDisable = Array.from(this.features.entries())
      .filter(([_, config]) => config.degradationLevel === level)
      .sort(([_, a], [__, b]) => b.priority - a.priority) // Higher priority number = disabled first
      .map(([name, _]) => name);

    for (const featureName of featuresToDisable) {
      const index = this.currentState.activeFeatures.indexOf(featureName);
      if (index > -1) {
        this.currentState.activeFeatures.splice(index, 1);
        this.currentState.disabledFeatures.push(featureName);
      }
    }
  }

  /**
   * Get feature configuration
   */
  getFeatureConfig(featureName: string): FeatureConfig | undefined {
    return this.features.get(featureName);
  }

  /**
   * Get all registered features
   */
  getAllFeatures(): FeatureConfig[] {
    return Array.from(this.features.values());
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.removeAllListeners();
  }
}

// Global graceful degradation service instance
export const gracefulDegradationService = new GracefulDegradationService();
