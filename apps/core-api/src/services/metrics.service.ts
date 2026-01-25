import { EventEmitter } from "events";

export interface MetricPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

export interface LatencyMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  labels?: Record<string, string>;
}

export interface ThroughputMetric {
  operation: string;
  count: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface ErrorMetric {
  operation: string;
  error: string;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface MetricsSnapshot {
  timestamp: Date;
  throughput: {
    tradesPerSecond: number;
    messagesPerSecond: number;
    wsConnectionsPerSecond: number;
    dbOperationsPerSecond: number;
  };
  latency: {
    dataGenerationToClient: {
      p50: number;
      p95: number;
      p99: number;
      avg: number;
    };
    dbOperations: {
      p50: number;
      p95: number;
      p99: number;
      avg: number;
    };
    wsMessageDelivery: {
      p50: number;
      p95: number;
      p99: number;
      avg: number;
    };
  };
  errors: {
    totalErrorRate: number;
    dbErrorRate: number;
    wsErrorRate: number;
    generationErrorRate: number;
  };
  connections: {
    activeWebSockets: number;
    totalSubscriptions: number;
    connectionHealth: number; // percentage of healthy connections
  };
}

export class MetricsService extends EventEmitter {
  private latencyMetrics: LatencyMetric[] = [];
  private throughputMetrics: ThroughputMetric[] = [];
  private errorMetrics: ErrorMetric[] = [];
  private connectionMetrics: MetricPoint[] = [];

  private readonly maxMetricsAge = 24 * 60 * 60 * 1000; // 24 hours
  private readonly cleanupInterval = 60 * 60 * 1000; // 1 hour
  private cleanupTimer?: NodeJS.Timeout;

  // Real-time counters
  private counters = new Map<string, number>();
  private lastCounterReset = Date.now();
  private readonly counterResetInterval = 60 * 1000; // 1 minute

  constructor() {
    super();
    this.startCleanupTimer();
    this.startCounterReset();
  }

  /**
   * Record latency metric for critical operations
   */
  recordLatency(
    operation: string,
    startTime: number,
    success: boolean = true,
    labels?: Record<string, string>,
  ): void {
    const duration = Date.now() - startTime;
    const metric: LatencyMetric = {
      operation,
      duration,
      timestamp: new Date(),
      success,
      labels,
    };

    this.latencyMetrics.push(metric);
    this.emit("latency", metric);

    // Track critical path latencies
    if (operation === "data_generation_to_client" && duration > 25) {
      this.emit("sla_violation", {
        type: "latency",
        operation,
        threshold: 25,
        actual: duration,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Record throughput metric
   */
  recordThroughput(
    operation: string,
    count: number = 1,
    labels?: Record<string, string>,
  ): void {
    const metric: ThroughputMetric = {
      operation,
      count,
      timestamp: new Date(),
      labels,
    };

    this.throughputMetrics.push(metric);
    this.incrementCounter(operation, count);
    this.emit("throughput", metric);
  }

  /**
   * Record error metric
   */
  recordError(
    operation: string,
    error: string | Error,
    labels?: Record<string, string>,
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const metric: ErrorMetric = {
      operation,
      error: errorMessage,
      timestamp: new Date(),
      labels,
    };

    this.errorMetrics.push(metric);
    this.incrementCounter(`${operation}_errors`);
    this.emit("error_metric", metric);
  }

  /**
   * Record connection health metric
   */
  recordConnectionHealth(
    activeConnections: number,
    totalSubscriptions: number,
    healthyConnections: number,
    labels?: Record<string, string>,
  ): void {
    const timestamp = new Date();

    this.connectionMetrics.push({
      timestamp,
      value: activeConnections,
      labels: { ...labels, type: "active_connections" },
    });

    this.connectionMetrics.push({
      timestamp,
      value: totalSubscriptions,
      labels: { ...labels, type: "total_subscriptions" },
    });

    this.connectionMetrics.push({
      timestamp,
      value: healthyConnections,
      labels: { ...labels, type: "healthy_connections" },
    });

    this.emit("connection_health", {
      activeConnections,
      totalSubscriptions,
      healthyConnections,
      timestamp,
    });
  }

  /**
   * Get comprehensive metrics snapshot
   */
  getMetricsSnapshot(timeRangeMs: number = 5 * 60 * 1000): MetricsSnapshot {
    const now = Date.now();
    const since = now - timeRangeMs;

    // Filter metrics by time range
    const recentLatency = this.latencyMetrics.filter(
      (m) => m.timestamp.getTime() >= since,
    );
    const recentThroughput = this.throughputMetrics.filter(
      (m) => m.timestamp.getTime() >= since,
    );
    const recentErrors = this.errorMetrics.filter(
      (m) => m.timestamp.getTime() >= since,
    );
    const recentConnections = this.connectionMetrics.filter(
      (m) => m.timestamp.getTime() >= since,
    );

    // Calculate throughput rates
    const timeRangeSeconds = timeRangeMs / 1000;
    const throughput = {
      tradesPerSecond: this.calculateThroughputRate(
        recentThroughput,
        "trade_generated",
        timeRangeSeconds,
      ),
      messagesPerSecond: this.calculateThroughputRate(
        recentThroughput,
        "message_sent",
        timeRangeSeconds,
      ),
      wsConnectionsPerSecond: this.calculateThroughputRate(
        recentThroughput,
        "ws_connection",
        timeRangeSeconds,
      ),
      dbOperationsPerSecond: this.calculateThroughputRate(
        recentThroughput,
        "db_operation",
        timeRangeSeconds,
      ),
    };

    // Calculate latency percentiles
    const latency = {
      dataGenerationToClient: this.calculateLatencyPercentiles(
        recentLatency.filter(
          (m) => m.operation === "data_generation_to_client",
        ),
      ),
      dbOperations: this.calculateLatencyPercentiles(
        recentLatency.filter((m) => m.operation.startsWith("db_")),
      ),
      wsMessageDelivery: this.calculateLatencyPercentiles(
        recentLatency.filter((m) => m.operation === "ws_message_delivery"),
      ),
    };

    // Calculate error rates
    const totalOperations = recentThroughput.length + recentErrors.length;
    const errors = {
      totalErrorRate:
        totalOperations > 0 ? (recentErrors.length / totalOperations) * 100 : 0,
      dbErrorRate: this.calculateErrorRate(
        recentErrors,
        "db_",
        recentThroughput,
      ),
      wsErrorRate: this.calculateErrorRate(
        recentErrors,
        "ws_",
        recentThroughput,
      ),
      generationErrorRate: this.calculateErrorRate(
        recentErrors,
        "generation_",
        recentThroughput,
      ),
    };

    // Calculate connection health
    const latestConnections =
      this.getLatestConnectionMetrics(recentConnections);
    const connections = {
      activeWebSockets: latestConnections.activeConnections || 0,
      totalSubscriptions: latestConnections.totalSubscriptions || 0,
      connectionHealth:
        latestConnections.activeConnections > 0
          ? (latestConnections.healthyConnections /
              latestConnections.activeConnections) *
            100
          : 100,
    };

    return {
      timestamp: new Date(),
      throughput,
      latency,
      errors,
      connections,
    };
  }

  /**
   * Get real-time counter values
   */
  getCounters(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  /**
   * Get historical metrics for specific operation
   */
  getHistoricalMetrics(
    operation: string,
    timeRangeMs: number = 60 * 60 * 1000,
  ): {
    latency: LatencyMetric[];
    throughput: ThroughputMetric[];
    errors: ErrorMetric[];
  } {
    const since = Date.now() - timeRangeMs;

    return {
      latency: this.latencyMetrics.filter(
        (m) => m.operation === operation && m.timestamp.getTime() >= since,
      ),
      throughput: this.throughputMetrics.filter(
        (m) => m.operation === operation && m.timestamp.getTime() >= since,
      ),
      errors: this.errorMetrics.filter(
        (m) => m.operation === operation && m.timestamp.getTime() >= since,
      ),
    };
  }

  /**
   * Get metrics summary for monitoring dashboard
   */
  getMetricsSummary(): {
    currentRates: Record<string, number>;
    alertingMetrics: any[];
    systemHealth: "healthy" | "warning" | "critical";
  } {
    const snapshot = this.getMetricsSnapshot();
    const counters = this.getCounters();

    const currentRates = {
      tradesPerSecond: snapshot.throughput.tradesPerSecond,
      messagesPerSecond: snapshot.throughput.messagesPerSecond,
      errorRate: snapshot.errors.totalErrorRate,
      avgLatency: snapshot.latency.dataGenerationToClient.avg,
      activeConnections: snapshot.connections.activeWebSockets,
    };

    const alertingMetrics = [];

    // Check SLA violations
    if (snapshot.latency.dataGenerationToClient.p95 > 25) {
      alertingMetrics.push({
        type: "latency_sla_violation",
        message: `P95 latency ${snapshot.latency.dataGenerationToClient.p95}ms exceeds 25ms SLA`,
        severity: "warning",
        value: snapshot.latency.dataGenerationToClient.p95,
        threshold: 25,
      });
    }

    if (snapshot.errors.totalErrorRate > 5) {
      alertingMetrics.push({
        type: "high_error_rate",
        message: `Error rate ${snapshot.errors.totalErrorRate.toFixed(2)}% exceeds 5% threshold`,
        severity: "critical",
        value: snapshot.errors.totalErrorRate,
        threshold: 5,
      });
    }

    if (snapshot.connections.connectionHealth < 90) {
      alertingMetrics.push({
        type: "connection_health_degraded",
        message: `Connection health ${snapshot.connections.connectionHealth.toFixed(1)}% below 90%`,
        severity: "warning",
        value: snapshot.connections.connectionHealth,
        threshold: 90,
      });
    }

    // Determine system health
    let systemHealth: "healthy" | "warning" | "critical" = "healthy";
    if (alertingMetrics.some((m) => m.severity === "critical")) {
      systemHealth = "critical";
    } else if (alertingMetrics.length > 0) {
      systemHealth = "warning";
    }

    return {
      currentRates,
      alertingMetrics,
      systemHealth,
    };
  }

  /**
   * Clear old metrics to prevent memory leaks
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.maxMetricsAge;

    this.latencyMetrics = this.latencyMetrics.filter(
      (m) => m.timestamp.getTime() >= cutoff,
    );
    this.throughputMetrics = this.throughputMetrics.filter(
      (m) => m.timestamp.getTime() >= cutoff,
    );
    this.errorMetrics = this.errorMetrics.filter(
      (m) => m.timestamp.getTime() >= cutoff,
    );
    this.connectionMetrics = this.connectionMetrics.filter(
      (m) => m.timestamp.getTime() >= cutoff,
    );

    this.emit("metrics_cleaned", {
      timestamp: new Date(),
      cutoff: new Date(cutoff),
    });
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, this.cleanupInterval);
  }

  private startCounterReset(): void {
    setInterval(() => {
      // Reset counters every minute for rate calculations
      this.counters.clear();
      this.lastCounterReset = Date.now();
    }, this.counterResetInterval);
  }

  private incrementCounter(key: string, value: number = 1): void {
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  private calculateThroughputRate(
    metrics: ThroughputMetric[],
    operation: string,
    timeRangeSeconds: number,
  ): number {
    const operationMetrics = metrics.filter((m) => m.operation === operation);
    const totalCount = operationMetrics.reduce((sum, m) => sum + m.count, 0);
    return totalCount / timeRangeSeconds;
  }

  private calculateLatencyPercentiles(metrics: LatencyMetric[]): {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  } {
    if (metrics.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const durations = metrics.map((m) => m.duration).sort((a, b) => a - b);
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;

    return {
      p50: this.getPercentile(durations, 50),
      p95: this.getPercentile(durations, 95),
      p99: this.getPercentile(durations, 99),
      avg: Math.round(avg * 100) / 100,
    };
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private calculateErrorRate(
    errors: ErrorMetric[],
    operationPrefix: string,
    throughputMetrics: ThroughputMetric[],
  ): number {
    const operationErrors = errors.filter((e) =>
      e.operation.startsWith(operationPrefix),
    );
    const operationThroughput = throughputMetrics.filter((t) =>
      t.operation.startsWith(operationPrefix),
    );

    const totalOperations =
      operationThroughput.reduce((sum, t) => sum + t.count, 0) +
      operationErrors.length;
    return totalOperations > 0
      ? (operationErrors.length / totalOperations) * 100
      : 0;
  }

  private getLatestConnectionMetrics(metrics: MetricPoint[]): {
    activeConnections: number;
    totalSubscriptions: number;
    healthyConnections: number;
  } {
    const latest = {
      activeConnections: 0,
      totalSubscriptions: 0,
      healthyConnections: 0,
    };

    // Get the most recent value for each metric type
    const activeConnectionsMetric = metrics
      .filter((m) => m.labels?.type === "active_connections")
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    const totalSubscriptionsMetric = metrics
      .filter((m) => m.labels?.type === "total_subscriptions")
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    const healthyConnectionsMetric = metrics
      .filter((m) => m.labels?.type === "healthy_connections")
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    if (activeConnectionsMetric)
      latest.activeConnections = activeConnectionsMetric.value;
    if (totalSubscriptionsMetric)
      latest.totalSubscriptions = totalSubscriptionsMetric.value;
    if (healthyConnectionsMetric)
      latest.healthyConnections = healthyConnectionsMetric.value;

    return latest;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.removeAllListeners();
  }
}

// Global metrics service instance
export const metricsService = new MetricsService();
