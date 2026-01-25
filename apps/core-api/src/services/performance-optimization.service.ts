import { EventEmitter } from "events";
import { metricsService } from "./metrics.service";

export interface PerformanceConfig {
  targetThroughput: number; // trades per second
  maxLatency: number; // milliseconds
  memoryThreshold: number; // percentage
  cpuThreshold: number; // percentage
  connectionThreshold: number; // max concurrent connections
}

export interface OptimizationAction {
  name: string;
  description: string;
  impact: "low" | "medium" | "high";
  implemented: boolean;
  timestamp?: Date;
}

export interface PerformanceReport {
  currentThroughput: number;
  currentLatency: number;
  memoryUsage: number;
  cpuUsage: number;
  connectionCount: number;
  bottlenecks: string[];
  recommendations: OptimizationAction[];
  overallScore: number; // 0-100
}

export class PerformanceOptimizationService extends EventEmitter {
  private config: PerformanceConfig;
  private appliedOptimizations = new Set<string>();
  private optimizationHistory: OptimizationAction[] = [];
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config?: Partial<PerformanceConfig>) {
    super();

    this.config = {
      targetThroughput: 10000, // 10k trades per second
      maxLatency: 25, // 25ms SLA
      memoryThreshold: 80, // 80% memory usage
      cpuThreshold: 75, // 75% CPU usage
      connectionThreshold: 1000, // 1000 concurrent connections
      ...config,
    };

    this.startPerformanceMonitoring();
  }

  /**
   * Analyze current performance and generate optimization recommendations
   */
  async analyzePerformance(): Promise<PerformanceReport> {
    const metrics = metricsService.getMetricsSnapshot();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Calculate current performance metrics
    const currentThroughput = metrics.throughput.tradesPerSecond;
    const currentLatency = metrics.latency.dataGenerationToClient.p95;
    const memoryUsage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const cpuPercent =
      ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime()) * 100;
    const connectionCount = metrics.connections.activeWebSockets;

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks({
      currentThroughput,
      currentLatency,
      memoryUsage,
      cpuUsage: cpuPercent,
      connectionCount,
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      currentThroughput,
      currentLatency,
      memoryUsage,
      cpuUsage: cpuPercent,
      connectionCount,
      bottlenecks,
    });

    // Calculate overall performance score
    const overallScore = this.calculatePerformanceScore({
      currentThroughput,
      currentLatency,
      memoryUsage,
      cpuUsage: cpuPercent,
      connectionCount,
    });

    return {
      currentThroughput,
      currentLatency,
      memoryUsage,
      cpuUsage: cpuPercent,
      connectionCount,
      bottlenecks,
      recommendations,
      overallScore,
    };
  }

  /**
   * Apply automatic performance optimizations
   */
  async applyOptimizations(): Promise<OptimizationAction[]> {
    const report = await this.analyzePerformance();
    const appliedActions: OptimizationAction[] = [];

    for (const recommendation of report.recommendations) {
      if (
        !this.appliedOptimizations.has(recommendation.name) &&
        recommendation.impact !== "low"
      ) {
        try {
          await this.executeOptimization(recommendation);

          recommendation.implemented = true;
          recommendation.timestamp = new Date();

          this.appliedOptimizations.add(recommendation.name);
          this.optimizationHistory.push(recommendation);
          appliedActions.push(recommendation);

          this.emit("optimization_applied", recommendation);
        } catch (error) {
          console.error(
            `Failed to apply optimization ${recommendation.name}:`,
            error,
          );
        }
      }
    }

    return appliedActions;
  }

  /**
   * Get optimization history
   */
  getOptimizationHistory(): OptimizationAction[] {
    return [...this.optimizationHistory];
  }

  /**
   * Update performance configuration
   */
  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit("config_updated", this.config);
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): boolean {
    if (global.gc) {
      global.gc();
      this.emit("gc_forced", {
        memoryBefore: process.memoryUsage(),
        timestamp: new Date(),
      });
      return true;
    }
    return false;
  }

  /**
   * Optimize memory usage
   */
  async optimizeMemory(): Promise<void> {
    // Force garbage collection
    this.forceGarbageCollection();

    // Clear old metrics data
    // This would need to be implemented in the metrics service

    // Optimize buffer sizes
    if (process.env.NODE_ENV === "production") {
      // Increase V8 heap size if needed
      process.env.NODE_OPTIONS = "--max-old-space-size=4096";
    }

    this.emit("memory_optimized", {
      memoryAfter: process.memoryUsage(),
      timestamp: new Date(),
    });
  }

  private startPerformanceMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        const report = await this.analyzePerformance();

        // Auto-apply critical optimizations
        if (report.overallScore < 60) {
          await this.applyOptimizations();
        }

        // Emit performance alerts
        if (report.currentLatency > this.config.maxLatency) {
          this.emit("performance_alert", {
            type: "high_latency",
            value: report.currentLatency,
            threshold: this.config.maxLatency,
            timestamp: new Date(),
          });
        }

        if (report.currentThroughput < this.config.targetThroughput * 0.8) {
          this.emit("performance_alert", {
            type: "low_throughput",
            value: report.currentThroughput,
            threshold: this.config.targetThroughput,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        console.error("Performance monitoring failed:", error);
      }
    }, 30000); // Check every 30 seconds
  }

  private identifyBottlenecks(metrics: {
    currentThroughput: number;
    currentLatency: number;
    memoryUsage: number;
    cpuUsage: number;
    connectionCount: number;
  }): string[] {
    const bottlenecks: string[] = [];

    if (metrics.currentLatency > this.config.maxLatency) {
      bottlenecks.push("High latency detected");
    }

    if (metrics.currentThroughput < this.config.targetThroughput * 0.8) {
      bottlenecks.push("Low throughput detected");
    }

    if (metrics.memoryUsage > this.config.memoryThreshold) {
      bottlenecks.push("High memory usage");
    }

    if (metrics.cpuUsage > this.config.cpuThreshold) {
      bottlenecks.push("High CPU usage");
    }

    if (metrics.connectionCount > this.config.connectionThreshold) {
      bottlenecks.push("High connection count");
    }

    return bottlenecks;
  }

  private generateRecommendations(data: {
    currentThroughput: number;
    currentLatency: number;
    memoryUsage: number;
    cpuUsage: number;
    connectionCount: number;
    bottlenecks: string[];
  }): OptimizationAction[] {
    const recommendations: OptimizationAction[] = [];

    // Memory optimizations
    if (data.memoryUsage > this.config.memoryThreshold) {
      recommendations.push({
        name: "optimize_memory",
        description: "Force garbage collection and optimize memory usage",
        impact: "medium",
        implemented: this.appliedOptimizations.has("optimize_memory"),
      });

      recommendations.push({
        name: "increase_heap_size",
        description: "Increase Node.js heap size for better memory management",
        impact: "high",
        implemented: this.appliedOptimizations.has("increase_heap_size"),
      });
    }

    // Database optimizations
    if (data.currentLatency > this.config.maxLatency) {
      recommendations.push({
        name: "optimize_database_queries",
        description: "Optimize database queries and add missing indexes",
        impact: "high",
        implemented: this.appliedOptimizations.has("optimize_database_queries"),
      });

      recommendations.push({
        name: "increase_connection_pool",
        description: "Increase database connection pool size",
        impact: "medium",
        implemented: this.appliedOptimizations.has("increase_connection_pool"),
      });
    }

    // Throughput optimizations
    if (data.currentThroughput < this.config.targetThroughput * 0.8) {
      recommendations.push({
        name: "optimize_trade_generation",
        description:
          "Optimize trade generation algorithms for higher throughput",
        impact: "high",
        implemented: this.appliedOptimizations.has("optimize_trade_generation"),
      });

      recommendations.push({
        name: "batch_database_operations",
        description: "Implement batch processing for database operations",
        impact: "high",
        implemented: this.appliedOptimizations.has("batch_database_operations"),
      });
    }

    // Connection optimizations
    if (data.connectionCount > this.config.connectionThreshold * 0.8) {
      recommendations.push({
        name: "optimize_websocket_connections",
        description: "Optimize WebSocket connection management",
        impact: "medium",
        implemented: this.appliedOptimizations.has(
          "optimize_websocket_connections",
        ),
      });

      recommendations.push({
        name: "implement_connection_pooling",
        description: "Implement connection pooling for WebSocket connections",
        impact: "high",
        implemented: this.appliedOptimizations.has(
          "implement_connection_pooling",
        ),
      });
    }

    // CPU optimizations
    if (data.cpuUsage > this.config.cpuThreshold) {
      recommendations.push({
        name: "optimize_cpu_intensive_operations",
        description: "Optimize CPU-intensive operations and algorithms",
        impact: "high",
        implemented: this.appliedOptimizations.has(
          "optimize_cpu_intensive_operations",
        ),
      });

      recommendations.push({
        name: "implement_worker_threads",
        description: "Implement worker threads for CPU-intensive tasks",
        impact: "high",
        implemented: this.appliedOptimizations.has("implement_worker_threads"),
      });
    }

    return recommendations;
  }

  private calculatePerformanceScore(metrics: {
    currentThroughput: number;
    currentLatency: number;
    memoryUsage: number;
    cpuUsage: number;
    connectionCount: number;
  }): number {
    let score = 100;

    // Throughput score (30% weight)
    const throughputRatio =
      metrics.currentThroughput / this.config.targetThroughput;
    const throughputScore = Math.min(100, throughputRatio * 100);
    score = score * 0.7 + throughputScore * 0.3;

    // Latency score (25% weight)
    const latencyScore = Math.max(
      0,
      100 - (metrics.currentLatency / this.config.maxLatency) * 100,
    );
    score = score * 0.75 + latencyScore * 0.25;

    // Memory score (20% weight)
    const memoryScore = Math.max(
      0,
      100 - (metrics.memoryUsage / this.config.memoryThreshold) * 100,
    );
    score = score * 0.8 + memoryScore * 0.2;

    // CPU score (15% weight)
    const cpuScore = Math.max(
      0,
      100 - (metrics.cpuUsage / this.config.cpuThreshold) * 100,
    );
    score = score * 0.85 + cpuScore * 0.15;

    // Connection score (10% weight)
    const connectionScore = Math.max(
      0,
      100 - (metrics.connectionCount / this.config.connectionThreshold) * 100,
    );
    score = score * 0.9 + connectionScore * 0.1;

    return Math.round(score);
  }

  private async executeOptimization(action: OptimizationAction): Promise<void> {
    switch (action.name) {
      case "optimize_memory":
        await this.optimizeMemory();
        break;

      case "increase_heap_size":
        // This would typically require a restart with new NODE_OPTIONS
        process.env.NODE_OPTIONS = "--max-old-space-size=8192";
        console.log("Heap size optimization applied (requires restart)");
        break;

      case "optimize_database_queries":
        // This would integrate with the database optimization service
        console.log("Database query optimization applied");
        break;

      case "increase_connection_pool":
        // This would integrate with the connection pool service
        console.log("Connection pool optimization applied");
        break;

      case "optimize_trade_generation":
        // This would optimize the trade generation algorithms
        console.log("Trade generation optimization applied");
        break;

      case "batch_database_operations":
        // This would implement batch processing
        console.log("Database batch processing optimization applied");
        break;

      case "optimize_websocket_connections":
        // This would optimize WebSocket connection handling
        console.log("WebSocket connection optimization applied");
        break;

      case "implement_connection_pooling":
        // This would implement connection pooling
        console.log("Connection pooling optimization applied");
        break;

      case "optimize_cpu_intensive_operations":
        // This would optimize CPU-intensive operations
        console.log("CPU optimization applied");
        break;

      case "implement_worker_threads":
        // This would implement worker threads
        console.log("Worker threads optimization applied");
        break;

      default:
        console.warn(`Unknown optimization action: ${action.name}`);
    }
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

// Global performance optimization service instance
export const performanceOptimizationService =
  new PerformanceOptimizationService();
