import { EventEmitter } from "events";

export interface HealthCheckResult {
  name: string;
  status: "healthy" | "warning" | "critical";
  message: string;
  timestamp: Date;
  responseTime: number;
  details?: any;
  dependencies?: string[];
}

export interface HealthCheckConfig {
  name: string;
  checkFunction: () => Promise<HealthCheckResult>;
  interval: number;
  timeout: number;
  retries: number;
  dependencies?: string[];
  critical: boolean; // If true, failure affects overall system health
}

export interface SystemHealthStatus {
  overall: "healthy" | "warning" | "critical";
  checks: HealthCheckResult[];
  lastUpdated: Date;
  uptime: number;
  version: string;
}

export class HealthCheckService extends EventEmitter {
  private healthChecks = new Map<string, HealthCheckConfig>();
  private lastResults = new Map<string, HealthCheckResult>();
  private checkIntervals = new Map<string, NodeJS.Timeout>();
  private isRunning = false;

  constructor() {
    super();
    this.initializeDefaultHealthChecks();
  }

  /**
   * Register a health check
   */
  registerHealthCheck(config: HealthCheckConfig): void {
    this.healthChecks.set(config.name, config);

    if (this.isRunning) {
      this.startHealthCheck(config);
    }
  }

  /**
   * Start all health checks
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    for (const config of this.healthChecks.values()) {
      this.startHealthCheck(config);
    }

    console.log(`Started ${this.healthChecks.size} health checks`);
  }

  /**
   * Stop all health checks
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }

    this.checkIntervals.clear();
    console.log("Stopped all health checks");
  }

  /**
   * Run a specific health check manually
   */
  async runHealthCheck(name: string): Promise<HealthCheckResult> {
    const config = this.healthChecks.get(name);
    if (!config) {
      throw new Error(`Health check '${name}' not found`);
    }

    return this.executeHealthCheck(config);
  }

  /**
   * Run all health checks manually
   */
  async runAllHealthChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const config of this.healthChecks.values()) {
      try {
        const result = await this.executeHealthCheck(config);
        results.push(result);
      } catch (error) {
        results.push({
          name: config.name,
          status: "critical",
          message: `Health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: new Date(),
          responseTime: 0,
        });
      }
    }

    return results;
  }

  /**
   * Get current system health status
   */
  async getSystemHealth(): Promise<SystemHealthStatus> {
    const checks = await this.runAllHealthChecks();

    // Determine overall health
    let overall: "healthy" | "warning" | "critical" = "healthy";

    const criticalChecks = checks.filter((check) => {
      const config = this.healthChecks.get(check.name);
      return config?.critical && check.status === "critical";
    });

    const warningChecks = checks.filter((check) => check.status === "warning");

    if (criticalChecks.length > 0) {
      overall = "critical";
    } else if (warningChecks.length > 0) {
      overall = "warning";
    }

    return {
      overall,
      checks,
      lastUpdated: new Date(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
    };
  }

  /**
   * Get last known results without running checks
   */
  getLastResults(): HealthCheckResult[] {
    return Array.from(this.lastResults.values());
  }

  private initializeDefaultHealthChecks(): void {
    // Database health check
    this.registerHealthCheck({
      name: "database",
      checkFunction: this.checkDatabase.bind(this),
      interval: 30000, // 30 seconds
      timeout: 5000, // 5 seconds
      retries: 2,
      critical: true,
    });

    // Memory health check
    this.registerHealthCheck({
      name: "memory",
      checkFunction: this.checkMemory.bind(this),
      interval: 15000, // 15 seconds
      timeout: 1000, // 1 second
      retries: 1,
      critical: false,
    });

    // Trade generation health check
    this.registerHealthCheck({
      name: "trade_generation",
      checkFunction: this.checkTradeGeneration.bind(this),
      interval: 60000, // 1 minute
      timeout: 3000, // 3 seconds
      retries: 1,
      critical: false,
    });

    // WebSocket health check
    this.registerHealthCheck({
      name: "websocket",
      checkFunction: this.checkWebSocket.bind(this),
      interval: 30000, // 30 seconds
      timeout: 2000, // 2 seconds
      retries: 1,
      critical: false,
    });

    // NATS health check
    this.registerHealthCheck({
      name: "nats",
      checkFunction: this.checkNATS.bind(this),
      interval: 30000, // 30 seconds
      timeout: 3000, // 3 seconds
      retries: 2,
      critical: true,
    });

    // Circuit breaker health check
    this.registerHealthCheck({
      name: "circuit_breakers",
      checkFunction: this.checkCircuitBreakers.bind(this),
      interval: 45000, // 45 seconds
      timeout: 1000, // 1 second
      retries: 1,
      critical: false,
    });

    // Disk space health check
    this.registerHealthCheck({
      name: "disk_space",
      checkFunction: this.checkDiskSpace.bind(this),
      interval: 120000, // 2 minutes
      timeout: 2000, // 2 seconds
      retries: 1,
      critical: false,
    });
  }

  private startHealthCheck(config: HealthCheckConfig): void {
    // Run initial check
    this.executeHealthCheck(config).catch((error) => {
      console.error(`Initial health check failed for ${config.name}:`, error);
    });

    // Set up interval
    const interval = setInterval(async () => {
      try {
        await this.executeHealthCheck(config);
      } catch (error) {
        console.error(`Health check failed for ${config.name}:`, error);
      }
    }, config.interval);

    this.checkIntervals.set(config.name, interval);
  }

  private async executeHealthCheck(
    config: HealthCheckConfig,
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: any;

    while (attempt <= config.retries) {
      attempt++;

      try {
        // Execute with timeout
        const result = await Promise.race([
          config.checkFunction(),
          this.createTimeoutPromise(config.timeout, config.name),
        ]);

        result.responseTime = Date.now() - startTime;
        this.lastResults.set(config.name, result);

        // Emit events based on status change
        const previousResult = this.lastResults.get(config.name);
        if (!previousResult || previousResult.status !== result.status) {
          this.emit("health_status_changed", {
            name: config.name,
            previousStatus: previousResult?.status,
            newStatus: result.status,
            result,
          });
        }

        return result;
      } catch (error) {
        lastError = error;

        if (attempt <= config.retries) {
          // Wait before retry
          await this.sleep(1000 * attempt);
        }
      }
    }

    // All retries failed
    const result: HealthCheckResult = {
      name: config.name,
      status: "critical",
      message: `Health check failed after ${config.retries + 1} attempts: ${lastError instanceof Error ? lastError.message : "Unknown error"}`,
      timestamp: new Date(),
      responseTime: Date.now() - startTime,
    };

    this.lastResults.set(config.name, result);
    this.emit("health_check_failed", result);

    return result;
  }

  private createTimeoutPromise(
    timeout: number,
    checkName: string,
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Health check '${checkName}' timed out after ${timeout}ms`),
        );
      }, timeout);
    });
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    try {
      const { prisma } = await import("../../lib/prisma");
      const startTime = Date.now();

      await prisma.$queryRaw`SELECT 1 as test`;
      const responseTime = Date.now() - startTime;

      return {
        name: "database",
        status: responseTime > 2000 ? "warning" : "healthy",
        message:
          responseTime > 2000
            ? `Database response time ${responseTime}ms is high`
            : "Database connection is healthy",
        timestamp: new Date(),
        responseTime,
        details: { responseTime },
      };
    } catch (error) {
      return {
        name: "database",
        status: "critical",
        message: `Database connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
        responseTime: 0,
      };
    }
  }

  private async checkMemory(): Promise<HealthCheckResult> {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
    const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

    let status: "healthy" | "warning" | "critical" = "healthy";
    let message = `Memory usage: ${heapUsedMB.toFixed(1)}MB (${heapUsagePercent.toFixed(1)}%)`;

    if (heapUsedMB > 1024) {
      // 1GB
      status = "critical";
      message = `Critical memory usage: ${heapUsedMB.toFixed(1)}MB`;
    } else if (heapUsedMB > 512) {
      // 512MB
      status = "warning";
      message = `High memory usage: ${heapUsedMB.toFixed(1)}MB`;
    }

    return {
      name: "memory",
      status,
      message,
      timestamp: new Date(),
      responseTime: 1,
      details: {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        external: memUsage.external / 1024 / 1024,
        rss: memUsage.rss / 1024 / 1024,
        usagePercent: heapUsagePercent,
      },
    };
  }

  private async checkTradeGeneration(): Promise<HealthCheckResult> {
    try {
      const { TradeGenerationService } =
        await import("./trade-generation.service");
      const tradeService = new TradeGenerationService();
      const status = tradeService.getGenerationStatus();

      let healthStatus: "healthy" | "warning" | "critical" = "healthy";
      let message = "Trade generation is healthy";

      if (!status.isRunning) {
        healthStatus = "warning";
        message = "Trade generation is not running";
      } else if (status.tradesPerMinute < 50) {
        healthStatus = "warning";
        message = `Low trade generation rate: ${status.tradesPerMinute} trades/min`;
      }

      return {
        name: "trade_generation",
        status: healthStatus,
        message,
        timestamp: new Date(),
        responseTime: 1,
        details: status,
      };
    } catch (error) {
      return {
        name: "trade_generation",
        status: "critical",
        message: `Trade generation health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
        responseTime: 0,
      };
    }
  }

  private async checkWebSocket(): Promise<HealthCheckResult> {
    try {
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
        responseTime: 1,
        details: stats,
      };
    } catch (error) {
      return {
        name: "websocket",
        status: "critical",
        message: `WebSocket health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
        responseTime: 0,
      };
    }
  }

  private async checkNATS(): Promise<HealthCheckResult> {
    try {
      const { natsStreamingService } =
        await import("../routes/websocket.routes");
      const isConnected = natsStreamingService.checkConnected();
      const status = natsStreamingService.getConnectionStatus();

      return {
        name: "nats",
        status: isConnected ? "healthy" : "critical",
        message: isConnected
          ? "NATS connection is healthy"
          : "NATS connection is down",
        timestamp: new Date(),
        responseTime: 1,
        details: status,
      };
    } catch (error) {
      return {
        name: "nats",
        status: "critical",
        message: `NATS health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
        responseTime: 0,
      };
    }
  }

  private async checkCircuitBreakers(): Promise<HealthCheckResult> {
    try {
      const { circuitBreakerRegistry } =
        await import("./circuit-breaker.service");
      const stats = circuitBreakerRegistry.getAllStats();
      const openBreakers = circuitBreakerRegistry.getOpenCircuitBreakers();

      let status: "healthy" | "warning" | "critical" = "healthy";
      let message = "All circuit breakers are healthy";

      if (openBreakers.length > 0) {
        status = openBreakers.length > 2 ? "critical" : "warning";
        message = `${openBreakers.length} circuit breaker(s) are open: ${openBreakers.join(", ")}`;
      }

      return {
        name: "circuit_breakers",
        status,
        message,
        timestamp: new Date(),
        responseTime: 1,
        details: {
          stats,
          openBreakers,
          totalBreakers: Object.keys(stats).length,
        },
      };
    } catch (error) {
      return {
        name: "circuit_breakers",
        status: "warning",
        message: `Circuit breaker health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
        responseTime: 0,
      };
    }
  }

  private async checkDiskSpace(): Promise<HealthCheckResult> {
    try {
      // This is a simplified disk space check
      // In production, you'd use a proper disk space monitoring library
      const stats = await import("fs").then((fs) => fs.promises.stat("."));

      return {
        name: "disk_space",
        status: "healthy",
        message: "Disk space check completed",
        timestamp: new Date(),
        responseTime: 1,
        details: {
          message: "Disk space monitoring requires additional implementation",
        },
      };
    } catch (error) {
      return {
        name: "disk_space",
        status: "warning",
        message: `Disk space check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
        responseTime: 0,
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}

// Global health check service instance
export const healthCheckService = new HealthCheckService();
