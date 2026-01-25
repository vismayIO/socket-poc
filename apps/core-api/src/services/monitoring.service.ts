import { EventEmitter } from "events";
import { metricsService, MetricsSnapshot } from "./metrics.service";

export interface Alert {
  id: string;
  type:
    | "latency"
    | "throughput"
    | "error_rate"
    | "connection_health"
    | "system_resource";
  severity: "info" | "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved?: Date;
  labels?: Record<string, string>;
}

export interface HealthCheck {
  name: string;
  status: "healthy" | "warning" | "critical";
  message: string;
  timestamp: Date;
  responseTime?: number;
  details?: any;
}

export interface MonitoringConfig {
  alerting: {
    latencyThresholds: {
      p95Warning: number;
      p95Critical: number;
      p99Critical: number;
    };
    throughputThresholds: {
      minTradesPerSecond: number;
      maxErrorRate: number;
    };
    connectionThresholds: {
      minHealthPercentage: number;
      maxConnectionsWarning: number;
    };
  };
  healthChecks: {
    interval: number;
    timeout: number;
  };
}

export class MonitoringService extends EventEmitter {
  private alerts = new Map<string, Alert>();
  private healthChecks = new Map<string, HealthCheck>();
  private config: MonitoringConfig;
  private monitoringInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config?: Partial<MonitoringConfig>) {
    super();

    this.config = {
      alerting: {
        latencyThresholds: {
          p95Warning: 25, // 25ms SLA
          p95Critical: 50,
          p99Critical: 100,
        },
        throughputThresholds: {
          minTradesPerSecond: 10, // Minimum expected throughput
          maxErrorRate: 5, // 5% error rate threshold
        },
        connectionThresholds: {
          minHealthPercentage: 90,
          maxConnectionsWarning: 1000,
        },
      },
      healthChecks: {
        interval: 30000, // 30 seconds
        timeout: 5000, // 5 seconds
      },
      ...config,
    };

    this.startMonitoring();
    this.startHealthChecks();
  }

  /**
   * Start continuous monitoring and alerting
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkMetricsAndAlert();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Start health check monitoring
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, this.config.healthChecks.interval);

    // Run initial health checks
    this.runHealthChecks();
  }

  /**
   * Check current metrics and generate alerts
   */
  private checkMetricsAndAlert(): void {
    const snapshot = metricsService.getMetricsSnapshot();

    // Check latency thresholds
    this.checkLatencyAlerts(snapshot);

    // Check throughput thresholds
    this.checkThroughputAlerts(snapshot);

    // Check error rate thresholds
    this.checkErrorRateAlerts(snapshot);

    // Check connection health
    this.checkConnectionHealthAlerts(snapshot);

    // Resolve alerts that are no longer active
    this.resolveInactiveAlerts(snapshot);
  }

  private checkLatencyAlerts(snapshot: MetricsSnapshot): void {
    const { dataGenerationToClient } = snapshot.latency;

    // P95 latency warning
    if (
      dataGenerationToClient.p95 >
      this.config.alerting.latencyThresholds.p95Warning
    ) {
      const severity =
        dataGenerationToClient.p95 >
        this.config.alerting.latencyThresholds.p95Critical
          ? "critical"
          : "warning";

      this.createOrUpdateAlert({
        id: "latency_p95_high",
        type: "latency",
        severity,
        message: `P95 latency ${dataGenerationToClient.p95.toFixed(2)}ms exceeds ${this.config.alerting.latencyThresholds.p95Warning}ms threshold`,
        value: dataGenerationToClient.p95,
        threshold: this.config.alerting.latencyThresholds.p95Warning,
        timestamp: new Date(),
        labels: {
          metric: "p95_latency",
          operation: "data_generation_to_client",
        },
      });
    }

    // P99 latency critical
    if (
      dataGenerationToClient.p99 >
      this.config.alerting.latencyThresholds.p99Critical
    ) {
      this.createOrUpdateAlert({
        id: "latency_p99_critical",
        type: "latency",
        severity: "critical",
        message: `P99 latency ${dataGenerationToClient.p99.toFixed(2)}ms exceeds ${this.config.alerting.latencyThresholds.p99Critical}ms critical threshold`,
        value: dataGenerationToClient.p99,
        threshold: this.config.alerting.latencyThresholds.p99Critical,
        timestamp: new Date(),
        labels: {
          metric: "p99_latency",
          operation: "data_generation_to_client",
        },
      });
    }
  }

  private checkThroughputAlerts(snapshot: MetricsSnapshot): void {
    const { tradesPerSecond } = snapshot.throughput;

    if (
      tradesPerSecond <
      this.config.alerting.throughputThresholds.minTradesPerSecond
    ) {
      this.createOrUpdateAlert({
        id: "throughput_low",
        type: "throughput",
        severity: "warning",
        message: `Trade throughput ${tradesPerSecond.toFixed(2)} TPS below minimum ${this.config.alerting.throughputThresholds.minTradesPerSecond} TPS`,
        value: tradesPerSecond,
        threshold: this.config.alerting.throughputThresholds.minTradesPerSecond,
        timestamp: new Date(),
        labels: { metric: "trades_per_second" },
      });
    }
  }

  private checkErrorRateAlerts(snapshot: MetricsSnapshot): void {
    const { totalErrorRate } = snapshot.errors;

    if (
      totalErrorRate > this.config.alerting.throughputThresholds.maxErrorRate
    ) {
      this.createOrUpdateAlert({
        id: "error_rate_high",
        type: "error_rate",
        severity: totalErrorRate > 10 ? "critical" : "warning",
        message: `Error rate ${totalErrorRate.toFixed(2)}% exceeds ${this.config.alerting.throughputThresholds.maxErrorRate}% threshold`,
        value: totalErrorRate,
        threshold: this.config.alerting.throughputThresholds.maxErrorRate,
        timestamp: new Date(),
        labels: { metric: "total_error_rate" },
      });
    }
  }

  private checkConnectionHealthAlerts(snapshot: MetricsSnapshot): void {
    const { connectionHealth, activeWebSockets } = snapshot.connections;

    if (
      connectionHealth <
      this.config.alerting.connectionThresholds.minHealthPercentage
    ) {
      this.createOrUpdateAlert({
        id: "connection_health_low",
        type: "connection_health",
        severity: connectionHealth < 80 ? "critical" : "warning",
        message: `Connection health ${connectionHealth.toFixed(1)}% below ${this.config.alerting.connectionThresholds.minHealthPercentage}% threshold`,
        value: connectionHealth,
        threshold:
          this.config.alerting.connectionThresholds.minHealthPercentage,
        timestamp: new Date(),
        labels: { metric: "connection_health" },
      });
    }

    if (
      activeWebSockets >
      this.config.alerting.connectionThresholds.maxConnectionsWarning
    ) {
      this.createOrUpdateAlert({
        id: "connection_count_high",
        type: "connection_health",
        severity: "warning",
        message: `Active WebSocket connections ${activeWebSockets} exceeds warning threshold ${this.config.alerting.connectionThresholds.maxConnectionsWarning}`,
        value: activeWebSockets,
        threshold:
          this.config.alerting.connectionThresholds.maxConnectionsWarning,
        timestamp: new Date(),
        labels: { metric: "active_websockets" },
      });
    }
  }

  private resolveInactiveAlerts(snapshot: MetricsSnapshot): void {
    const now = new Date();

    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.resolved) continue;

      let shouldResolve = false;

      switch (alertId) {
        case "latency_p95_high":
          shouldResolve =
            snapshot.latency.dataGenerationToClient.p95 <=
            this.config.alerting.latencyThresholds.p95Warning;
          break;
        case "latency_p99_critical":
          shouldResolve =
            snapshot.latency.dataGenerationToClient.p99 <=
            this.config.alerting.latencyThresholds.p99Critical;
          break;
        case "throughput_low":
          shouldResolve =
            snapshot.throughput.tradesPerSecond >=
            this.config.alerting.throughputThresholds.minTradesPerSecond;
          break;
        case "error_rate_high":
          shouldResolve =
            snapshot.errors.totalErrorRate <=
            this.config.alerting.throughputThresholds.maxErrorRate;
          break;
        case "connection_health_low":
          shouldResolve =
            snapshot.connections.connectionHealth >=
            this.config.alerting.connectionThresholds.minHealthPercentage;
          break;
        case "connection_count_high":
          shouldResolve =
            snapshot.connections.activeWebSockets <=
            this.config.alerting.connectionThresholds.maxConnectionsWarning;
          break;
      }

      if (shouldResolve) {
        alert.resolved = now;
        this.emit("alert_resolved", alert);
      }
    }
  }

  private createOrUpdateAlert(
    alertData: Omit<Alert, "id"> & { id: string },
  ): void {
    const existingAlert = this.alerts.get(alertData.id);

    if (existingAlert && !existingAlert.resolved) {
      // Update existing alert
      existingAlert.value = alertData.value;
      existingAlert.timestamp = alertData.timestamp;
      existingAlert.message = alertData.message;
    } else {
      // Create new alert
      const alert: Alert = { ...alertData };
      this.alerts.set(alert.id, alert);
      this.emit("alert_created", alert);
    }
  }

  /**
   * Run comprehensive health checks
   */
  private async runHealthChecks(): Promise<void> {
    const checks = [
      this.checkDatabaseHealth(),
      this.checkMemoryHealth(),
      this.checkTradeGenerationHealth(),
      this.checkWebSocketHealth(),
      this.checkNATSHealth(),
    ];

    const results = await Promise.allSettled(checks);

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const healthCheck = result.value;
        this.healthChecks.set(healthCheck.name, healthCheck);

        if (healthCheck.status !== "healthy") {
          this.emit("health_check_failed", healthCheck);
        }
      } else {
        console.error(`Health check ${index} failed:`, result.reason);
      }
    });
  }

  private async checkDatabaseHealth(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Import prisma dynamically to avoid circular dependencies
      const { prisma } = await import("../../lib/prisma");

      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      return {
        name: "database",
        status: responseTime > 1000 ? "warning" : "healthy",
        message:
          responseTime > 1000
            ? `Database response time ${responseTime}ms is high`
            : "Database is healthy",
        timestamp: new Date(),
        responseTime,
      };
    } catch (error) {
      return {
        name: "database",
        status: "critical",
        message: `Database connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async checkMemoryHealth(): Promise<HealthCheck> {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

    let status: "healthy" | "warning" | "critical" = "healthy";
    let message = `Memory usage: ${heapUsedMB.toFixed(1)}MB (${heapUsagePercent.toFixed(1)}%)`;

    if (heapUsedMB > 1024) {
      // 1GB
      status = "critical";
      message = `High memory usage: ${heapUsedMB.toFixed(1)}MB`;
    } else if (heapUsedMB > 512) {
      // 512MB
      status = "warning";
      message = `Elevated memory usage: ${heapUsedMB.toFixed(1)}MB`;
    }

    return {
      name: "memory",
      status,
      message,
      timestamp: new Date(),
      details: {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        external: memUsage.external / 1024 / 1024,
        rss: memUsage.rss / 1024 / 1024,
      },
    };
  }

  private async checkTradeGenerationHealth(): Promise<HealthCheck> {
    try {
      // Import dynamically to avoid circular dependencies
      const { TradeGenerationService } =
        await import("./trade-generation.service");
      const tradeService = new TradeGenerationService();
      const status = tradeService.getGenerationStatus();

      let healthStatus: "healthy" | "warning" | "critical" = "healthy";
      let message = "Trade generation is healthy";

      if (!status.isRunning) {
        healthStatus = "warning";
        message = "Trade generation is not running";
      } else if (status.tradesPerMinute < 100) {
        healthStatus = "warning";
        message = `Low trade generation rate: ${status.tradesPerMinute} trades/min`;
      }

      return {
        name: "trade_generation",
        status: healthStatus,
        message,
        timestamp: new Date(),
        details: status,
      };
    } catch (error) {
      return {
        name: "trade_generation",
        status: "critical",
        message: `Trade generation health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      };
    }
  }

  private async checkWebSocketHealth(): Promise<HealthCheck> {
    try {
      // Import dynamically to avoid circular dependencies
      const { webSocketService } = await import("../routes/websocket.routes");
      const stats = webSocketService.getConnectionStats();

      let status: "healthy" | "warning" | "critical" = "healthy";
      let message = `WebSocket service healthy: ${stats.totalConnections} connections`;

      if (stats.totalConnections > 1000) {
        status = "warning";
        message = `High connection count: ${stats.totalConnections}`;
      }

      return {
        name: "websocket",
        status,
        message,
        timestamp: new Date(),
        details: stats,
      };
    } catch (error) {
      return {
        name: "websocket",
        status: "critical",
        message: `WebSocket health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      };
    }
  }

  private async checkNATSHealth(): Promise<HealthCheck> {
    try {
      // Import dynamically to avoid circular dependencies
      const { natsStreamingService } =
        await import("../routes/websocket.routes");
      const isConnected = natsStreamingService.checkConnected();

      return {
        name: "nats",
        status: isConnected ? "healthy" : "critical",
        message: isConnected
          ? "NATS connection is healthy"
          : "NATS connection is down",
        timestamp: new Date(),
        details: { connected: isConnected },
      };
    } catch (error) {
      return {
        name: "nats",
        status: "critical",
        message: `NATS health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter((alert) => !alert.resolved);
  }

  /**
   * Get all alerts (including resolved)
   */
  getAllAlerts(limit: number = 100): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get current health status
   */
  getHealthStatus(): {
    overall: "healthy" | "warning" | "critical";
    checks: HealthCheck[];
    lastUpdated: Date;
  } {
    const checks = Array.from(this.healthChecks.values());

    let overall: "healthy" | "warning" | "critical" = "healthy";

    if (checks.some((check) => check.status === "critical")) {
      overall = "critical";
    } else if (checks.some((check) => check.status === "warning")) {
      overall = "warning";
    }

    return {
      overall,
      checks,
      lastUpdated: new Date(),
    };
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      alerting: {
        ...this.config.alerting,
        ...newConfig.alerting,
      },
      healthChecks: {
        ...this.config.healthChecks,
        ...newConfig.healthChecks,
      },
    };

    this.emit("config_updated", this.config);
  }

  /**
   * Manually trigger health checks
   */
  async triggerHealthChecks(): Promise<void> {
    await this.runHealthChecks();
  }

  /**
   * Clear resolved alerts older than specified time
   */
  clearOldAlerts(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThanMs;

    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.resolved && alert.resolved.getTime() < cutoff) {
        this.alerts.delete(alertId);
      }
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.removeAllListeners();
  }
}

// Global monitoring service instance
export const monitoringService = new MonitoringService();
