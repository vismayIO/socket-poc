import { Elysia } from "elysia";
import { TradeGenerationService } from "../services/trade-generation.service";
import { SymbolConfigService } from "../services/symbol-config.service";
import {
  webSocketService,
  natsStreamingService,
  messageRouterService,
} from "./websocket.routes";
import { prisma } from "../../lib/prisma";
import { metricsService } from "../services/metrics.service";
import { monitoringService } from "../services/monitoring.service";
import { healthCheckService } from "../services/health-check.service";
import { gracefulDegradationService } from "../services/graceful-degradation.service";
import { circuitBreakerRegistry } from "../services/circuit-breaker.service";
import { resilienceService } from "../services/retry.service";
import { performanceOptimizationService } from "../services/performance-optimization.service";
import { horizontalScalingService } from "../services/horizontal-scaling.service";
import { optimizedDatabaseService } from "../services/connection-pool.service";

// Create service instances
const tradeGenerationService = new TradeGenerationService();
const symbolConfigService = new SymbolConfigService();

export const adminRoutes = new Elysia({ prefix: "/api/v1/admin" })
  // POST /api/v1/admin/generation/start - Start data generation for symbols
  .post("/generation/start", async ({ body }) => {
    try {
      const { symbols } = body as { symbols?: string[] };
      await tradeGenerationService.startGeneration(symbols);

      return {
        success: true,
        message: "Trade generation started",
        data: {
          symbols: symbols || "all",
          startTime: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/generation/stop - Stop data generation
  .post("/generation/stop", async ({ body }) => {
    try {
      const { symbols } = body as { symbols?: string[] };
      await tradeGenerationService.stopGeneration(symbols);

      return {
        success: true,
        message: "Trade generation stopped",
        data: {
          symbols: symbols || "all",
          stopTime: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/status - System health and performance metrics
  .get("/status", async () => {
    try {
      const generationStatus = tradeGenerationService.getGenerationStatus();
      const routerStatus = messageRouterService.getStatus();
      const wsStats = webSocketService.getConnectionStats();

      // Get database statistics
      const [tradeCount, ohlcvCount, symbolCount] = await Promise.all([
        prisma.stockTrade.count(),
        prisma.ohlcvData.count(),
        prisma.symbolConfig.count(),
      ]);

      // Get recent performance metrics
      const recentTrades = await prisma.stockTrade.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 60000), // Last minute
          },
        },
      });

      const systemStatus = {
        generation: generationStatus,
        messaging: {
          natsStatus: routerStatus.natsStatus,
          routingActive: routerStatus.isRouting,
          webSocketStats: routerStatus.webSocketStats,
        },
        websockets: {
          totalConnections: wsStats.totalConnections,
          authenticatedConnections: wsStats.authenticatedConnections,
          totalSubscriptions: wsStats.totalSubscriptions,
          channelCount: wsStats.channelCount,
          averageSubscriptionsPerClient: wsStats.averageSubscriptionsPerClient,
        },
        database: {
          totalTrades: tradeCount,
          totalOHLCVRecords: ohlcvCount,
          totalSymbols: symbolCount,
          recentTradesPerMinute: recentTrades,
        },
        system: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform,
        },
        monitoring: {
          healthStatus: monitoringService.getHealthStatus(),
          activeAlerts: monitoringService.getActiveAlerts(),
          metricsSnapshot: metricsService.getMetricsSnapshot(),
        },
      };

      return {
        success: true,
        data: systemStatus,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get system status",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/metrics - Detailed performance and throughput metrics
  .get("/metrics", async ({ query }) => {
    try {
      const timeRange = (query.range as string) || "1h"; // "1m", "5m", "1h", "24h"
      const format = (query.format as string) || "json"; // "json" or "prometheus"

      // Calculate time range
      const timeRangeMs =
        {
          "1m": 60 * 1000,
          "5m": 5 * 60 * 1000,
          "1h": 60 * 60 * 1000,
          "24h": 24 * 60 * 60 * 1000,
        }[timeRange] || 60 * 60 * 1000;

      const since = new Date(Date.now() - timeRangeMs);

      // Get detailed metrics from database
      const [tradeMetrics, ohlcvMetrics, symbolActivity, volumeMetrics] =
        await Promise.all([
          // Trade metrics
          prisma.stockTrade.groupBy({
            by: ["symbol"],
            where: { timestamp: { gte: since } },
            _count: { id: true },
            _avg: { price: true, quantity: true },
            _sum: { quantity: true },
            _min: { timestamp: true },
            _max: { timestamp: true },
          }),

          // OHLCV metrics
          prisma.ohlcvData.groupBy({
            by: ["symbol", "intervalType"],
            where: { timestamp: { gte: since } },
            _count: { id: true },
            _sum: { volume: true, tradeCount: true },
            _avg: { openPrice: true, closePrice: true },
          }),

          // Symbol activity
          prisma.stockTrade.groupBy({
            by: ["symbol"],
            where: { timestamp: { gte: since } },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 10,
          }),

          // Volume metrics
          prisma.stockTrade.aggregate({
            where: { timestamp: { gte: since } },
            _sum: { quantity: true },
            _count: { id: true },
            _avg: { quantity: true },
          }),
        ]);

      // Calculate throughput metrics
      const totalTrades = volumeMetrics._count.id || 0;
      const totalVolume = volumeMetrics._sum.quantity || 0;
      const avgTradeSize = volumeMetrics._avg.quantity || 0;
      const tradesPerSecond = totalTrades / (timeRangeMs / 1000);
      const volumePerSecond = totalVolume / (timeRangeMs / 1000);

      // Get system performance metrics
      const generationStatus = tradeGenerationService.getGenerationStatus();
      const wsStats = webSocketService.getConnectionStats();
      const memUsage = process.memoryUsage();

      const metrics = {
        timeRange,
        period: {
          start: since.toISOString(),
          end: new Date().toISOString(),
          durationMs: timeRangeMs,
        },
        throughput: {
          tradesPerSecond: Math.round(tradesPerSecond * 100) / 100,
          volumePerSecond: Math.round(volumePerSecond * 100) / 100,
          totalTrades,
          totalVolume,
          avgTradeSize: Math.round(avgTradeSize * 100) / 100,
        },
        generation: {
          isRunning: generationStatus.isRunning,
          activeSymbols: generationStatus.activeSymbols.length,
          tradesPerMinute: generationStatus.tradesPerMinute,
          totalGenerated: generationStatus.totalTradesGenerated,
          uptime: generationStatus.startTime
            ? Date.now() - new Date(generationStatus.startTime).getTime()
            : 0,
        },
        symbols: {
          byTradeCount: tradeMetrics.map((t) => ({
            symbol: t.symbol,
            trades: t._count.id,
            avgPrice: Math.round((t._avg.price || 0) * 100) / 100,
            totalVolume: t._sum.quantity || 0,
            timeSpan: {
              first: t._min.timestamp,
              last: t._max.timestamp,
            },
          })),
          topActive: symbolActivity.map((s) => ({
            symbol: s.symbol,
            trades: s._count.id,
          })),
        },
        ohlcv: {
          byInterval: ohlcvMetrics.map((o) => ({
            symbol: o.symbol,
            interval: o.intervalType,
            records: o._count.id,
            totalVolume: o._sum.volume?.toString() || "0",
            totalTrades: o._sum.tradeCount || 0,
            avgPrice: Math.round((o._avg.openPrice || 0) * 100) / 100,
          })),
        },
        websockets: {
          connections: wsStats.totalConnections,
          subscriptions: wsStats.totalSubscriptions,
          channelCount: wsStats.channelCount,
          averageSubscriptionsPerClient: wsStats.averageSubscriptionsPerClient,
        },
        system: {
          memory: {
            used: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100, // MB
            total: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100, // MB
            external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100, // MB
            rss: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100, // MB
          },
          uptime: Math.round(process.uptime()),
          cpu: {
            usage: process.cpuUsage(),
          },
        },
      };

      // Handle Prometheus format
      if (format === "prometheus") {
        const prometheusMetrics = [
          `# HELP trades_per_second Number of trades per second`,
          `# TYPE trades_per_second gauge`,
          `trades_per_second ${metrics.throughput.tradesPerSecond}`,
          ``,
          `# HELP total_trades Total number of trades`,
          `# TYPE total_trades counter`,
          `total_trades ${metrics.throughput.totalTrades}`,
          ``,
          `# HELP active_websocket_connections Number of active WebSocket connections`,
          `# TYPE active_websocket_connections gauge`,
          `active_websocket_connections ${metrics.websockets.connections}`,
          ``,
          `# HELP memory_usage_mb Memory usage in megabytes`,
          `# TYPE memory_usage_mb gauge`,
          `memory_usage_mb{type="heap_used"} ${metrics.system.memory.used}`,
          `memory_usage_mb{type="heap_total"} ${metrics.system.memory.total}`,
          `memory_usage_mb{type="rss"} ${metrics.system.memory.rss}`,
          ``,
          `# HELP system_uptime_seconds System uptime in seconds`,
          `# TYPE system_uptime_seconds counter`,
          `system_uptime_seconds ${metrics.system.uptime}`,
          ``,
        ].join("\n");

        return new Response(prometheusMetrics, {
          headers: {
            "Content-Type": "text/plain; version=0.0.4",
          },
        });
      }

      return {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get metrics",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/symbols/init - Initialize or refresh symbol configurations
  .post("/symbols/init", async ({ body }) => {
    try {
      const { force } = body as { force?: boolean };

      if (force) {
        // Clear existing symbols if force is true
        await prisma.symbolConfig.deleteMany();
      }

      await symbolConfigService.initializeSymbols();
      const symbols = await symbolConfigService.getAllActiveSymbols();

      return {
        success: true,
        message: "Symbols initialized successfully",
        data: {
          count: symbols.length,
          symbols: symbols.map((s) => ({
            symbol: s.symbol,
            basePrice: s.basePrice,
            sector: s.sector,
          })),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize symbols",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // PUT /api/v1/admin/symbols/:symbol - Update symbol configuration
  .put("/symbols/:symbol", async ({ params, body }) => {
    try {
      const { symbol } = params;
      const updates = body as Partial<{
        basePrice: number;
        volatility: number;
        trendStrength: number;
        minSpread: number;
        maxSpread: number;
      }>;

      await symbolConfigService.updateSymbolConfig(
        symbol.toUpperCase(),
        updates,
      );
      const updatedSymbol = await symbolConfigService.getSymbolConfig(
        symbol.toUpperCase(),
      );

      return {
        success: true,
        message: `Symbol ${symbol.toUpperCase()} updated successfully`,
        data: updatedSymbol,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update symbol",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // DELETE /api/v1/admin/data/cleanup - Clean up old data
  .delete("/data/cleanup", async ({ query }) => {
    try {
      const olderThan = (query.olderThan as string) || "7d"; // "1h", "1d", "7d", "30d"
      const dataTypes = (query.types as string)?.split(",") || [
        "trades",
        "ohlcv",
      ];

      // Calculate cutoff date
      const timeMap = {
        "1h": 60 * 60 * 1000,
        "1d": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      };

      const cutoffTime = new Date(
        Date.now() -
          (timeMap[olderThan as keyof typeof timeMap] || timeMap["7d"]),
      );

      const results: any = {};

      if (dataTypes.includes("trades")) {
        const deletedTrades = await prisma.stockTrade.deleteMany({
          where: {
            timestamp: { lt: cutoffTime },
          },
        });
        results.trades = { deleted: deletedTrades.count };
      }

      if (dataTypes.includes("ohlcv")) {
        const deletedOHLCV = await prisma.ohlcvData.deleteMany({
          where: {
            timestamp: { lt: cutoffTime },
          },
        });
        results.ohlcv = { deleted: deletedOHLCV.count };
      }

      if (dataTypes.includes("orderbook")) {
        const deletedOrderBook = await prisma.orderBookSnapshot.deleteMany({
          where: {
            timestamp: { lt: cutoffTime },
          },
        });
        results.orderbook = { deleted: deletedOrderBook.count };
      }

      return {
        success: true,
        message: `Data cleanup completed for records older than ${olderThan}`,
        data: {
          cutoffTime: cutoffTime.toISOString(),
          results,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to cleanup data",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/health - Health check endpoint
  .get("/health", async () => {
    try {
      // Test database connection
      const dbTest = await prisma.$queryRaw`SELECT 1 as test`;

      // Test services
      const generationStatus = tradeGenerationService.getGenerationStatus();
      const wsStats = webSocketService.getConnectionStats();

      const health = {
        status: "healthy",
        checks: {
          database: { status: "healthy", response_time: "< 10ms" },
          generation: {
            status: generationStatus.isRunning ? "running" : "stopped",
            active_symbols: generationStatus.activeSymbols.length,
          },
          websockets: {
            status: "healthy",
            total_connections: wsStats.totalConnections,
          },
          memory: {
            status:
              process.memoryUsage().heapUsed < 1024 * 1024 * 1024
                ? "healthy"
                : "warning", // 1GB threshold
            usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          },
        },
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };

      return {
        success: true,
        data: health,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Health check failed",
        data: {
          status: "unhealthy",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/metrics/detailed - Real-time detailed metrics
  .get("/metrics/detailed", async ({ query }) => {
    try {
      const timeRange = parseInt((query.timeRange as string) || "300000"); // 5 minutes default
      const snapshot = metricsService.getMetricsSnapshot(timeRange);
      const summary = metricsService.getMetricsSummary();
      const counters = metricsService.getCounters();

      return {
        success: true,
        data: {
          snapshot,
          summary,
          counters,
          timeRange,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get detailed metrics",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/monitoring/alerts - Get monitoring alerts
  .get("/monitoring/alerts", async ({ query }) => {
    try {
      const includeResolved = (query.includeResolved as string) === "true";
      const limit = parseInt((query.limit as string) || "50");

      const alerts = includeResolved
        ? monitoringService.getAllAlerts(limit)
        : monitoringService.getActiveAlerts();

      return {
        success: true,
        data: {
          alerts,
          totalActive: monitoringService.getActiveAlerts().length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get alerts",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/monitoring/health - Get health check status
  .get("/monitoring/health", async () => {
    try {
      const healthStatus = monitoringService.getHealthStatus();

      return {
        success: true,
        data: healthStatus,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get health status",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/monitoring/health/check - Trigger manual health check
  .post("/monitoring/health/check", async () => {
    try {
      await monitoringService.triggerHealthChecks();
      const healthStatus = monitoringService.getHealthStatus();

      return {
        success: true,
        message: "Health checks triggered successfully",
        data: healthStatus,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to trigger health checks",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/metrics/historical/:operation - Get historical metrics for operation
  .get("/metrics/historical/:operation", async ({ params, query }) => {
    try {
      const { operation } = params;
      const timeRange = parseInt((query.timeRange as string) || "3600000"); // 1 hour default

      const historicalMetrics = metricsService.getHistoricalMetrics(
        operation,
        timeRange,
      );

      return {
        success: true,
        data: {
          operation,
          timeRange,
          metrics: historicalMetrics,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get historical metrics",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // PUT /api/v1/admin/monitoring/config - Update monitoring configuration
  .put("/monitoring/config", async ({ body }) => {
    try {
      const config = body as any;
      monitoringService.updateConfig(config);

      return {
        success: true,
        message: "Monitoring configuration updated",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update monitoring config",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // DELETE /api/v1/admin/monitoring/alerts/cleanup - Clear old resolved alerts
  .delete("/monitoring/alerts/cleanup", async ({ query }) => {
    try {
      const olderThanHours = parseInt((query.olderThanHours as string) || "24");
      const olderThanMs = olderThanHours * 60 * 60 * 1000;

      monitoringService.clearOldAlerts(olderThanMs);

      return {
        success: true,
        message: `Cleared resolved alerts older than ${olderThanHours} hours`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to cleanup alerts",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/resilience/circuit-breakers - Get circuit breaker status
  .get("/resilience/circuit-breakers", async () => {
    try {
      const stats = circuitBreakerRegistry.getAllStats();
      const openBreakers = circuitBreakerRegistry.getOpenCircuitBreakers();

      return {
        success: true,
        data: {
          stats,
          openBreakers,
          totalBreakers: Object.keys(stats).length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get circuit breaker status",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/resilience/circuit-breakers/:name/reset - Reset circuit breaker
  .post("/resilience/circuit-breakers/:name/reset", async ({ params }) => {
    try {
      const { name } = params;
      const circuitBreaker = circuitBreakerRegistry.getCircuitBreaker(name);
      circuitBreaker.reset();

      return {
        success: true,
        message: `Circuit breaker ${name} reset successfully`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to reset circuit breaker",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/resilience/stats - Get comprehensive resilience statistics
  .get("/resilience/stats", async () => {
    try {
      const resilienceStats = resilienceService.getResilienceStats();

      return {
        success: true,
        data: resilienceStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get resilience stats",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/degradation/status - Get graceful degradation status
  .get("/degradation/status", async () => {
    try {
      const currentState = gracefulDegradationService.getCurrentState();
      const allFeatures = gracefulDegradationService.getAllFeatures();

      return {
        success: true,
        data: {
          currentState,
          allFeatures,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get degradation status",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/degradation/trigger - Manually trigger degradation
  .post("/degradation/trigger", async ({ body }) => {
    try {
      const { level, reason } = body as {
        level: "degraded" | "critical";
        reason: string;
      };

      gracefulDegradationService.triggerDegradation(level, reason);

      return {
        success: true,
        message: `Degradation level set to ${level}`,
        data: gracefulDegradationService.getCurrentState(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to trigger degradation",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/degradation/restore - Restore normal operation
  .post("/degradation/restore", async () => {
    try {
      gracefulDegradationService.restoreNormalOperation();

      return {
        success: true,
        message: "Normal operation restored",
        data: gracefulDegradationService.getCurrentState(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to restore normal operation",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/health/comprehensive - Get comprehensive health status
  .get("/health/comprehensive", async () => {
    try {
      const systemHealth = await healthCheckService.getSystemHealth();

      return {
        success: true,
        data: systemHealth,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get comprehensive health status",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/performance/analysis - Get performance analysis
  .get("/performance/analysis", async () => {
    try {
      const performanceReport =
        await performanceOptimizationService.analyzePerformance();

      return {
        success: true,
        data: performanceReport,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze performance",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/performance/optimize - Apply performance optimizations
  .post("/performance/optimize", async () => {
    try {
      const appliedOptimizations =
        await performanceOptimizationService.applyOptimizations();

      return {
        success: true,
        message: `Applied ${appliedOptimizations.length} optimizations`,
        data: {
          appliedOptimizations,
          optimizationHistory:
            performanceOptimizationService.getOptimizationHistory(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to apply optimizations",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/performance/gc - Force garbage collection
  .post("/performance/gc", async () => {
    try {
      const memoryBefore = process.memoryUsage();
      const gcForced = performanceOptimizationService.forceGarbageCollection();
      const memoryAfter = process.memoryUsage();

      return {
        success: true,
        message: gcForced
          ? "Garbage collection forced"
          : "Garbage collection not available",
        data: {
          gcForced,
          memoryBefore: {
            heapUsed: Math.round(memoryBefore.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryBefore.heapTotal / 1024 / 1024),
          },
          memoryAfter: {
            heapUsed: Math.round(memoryAfter.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryAfter.heapTotal / 1024 / 1024),
          },
          memorySaved: Math.round(
            (memoryBefore.heapUsed - memoryAfter.heapUsed) / 1024 / 1024,
          ),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to force garbage collection",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/scaling/status - Get horizontal scaling status
  .get("/scaling/status", async () => {
    try {
      const scalingMetrics = horizontalScalingService.getScalingMetrics();
      const allInstances = horizontalScalingService.getAllInstances();
      const healthyInstances = horizontalScalingService.getHealthyInstances();

      return {
        success: true,
        data: {
          scalingMetrics,
          instances: {
            all: allInstances,
            healthy: healthyInstances,
            total: allInstances.length,
            healthyCount: healthyInstances.length,
          },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get scaling status",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/scaling/trigger - Manually trigger scaling
  .post("/scaling/trigger", async () => {
    try {
      const scalingDecision = await horizontalScalingService.triggerScaling();

      return {
        success: true,
        data: scalingDecision,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to trigger scaling",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/scaling/prepare-load - Prepare for expected load
  .post("/scaling/prepare-load", async ({ body }) => {
    try {
      const { expectedConnections, expectedThroughput } = body as {
        expectedConnections: number;
        expectedThroughput: number;
      };

      await horizontalScalingService.prepareForLoad(
        expectedConnections,
        expectedThroughput,
      );
      const loadAnalysis = horizontalScalingService.canHandleLoad(
        expectedConnections,
        expectedThroughput,
      );

      return {
        success: true,
        message: "Load preparation completed",
        data: {
          expectedConnections,
          expectedThroughput,
          loadAnalysis,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to prepare for load",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/admin/database/performance - Get database performance stats
  .get("/database/performance", async () => {
    try {
      const performanceStats =
        await optimizedDatabaseService.getPerformanceStats();
      const poolInfo = optimizedDatabaseService
        .getConnectionPool()
        .getPoolInfo();

      return {
        success: true,
        data: {
          performanceStats,
          poolInfo,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get database performance stats",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // POST /api/v1/admin/database/optimize - Optimize database performance
  .post("/database/optimize", async () => {
    try {
      await optimizedDatabaseService.optimizeDatabase();
      await optimizedDatabaseService.createOptimizedIndexes();

      return {
        success: true,
        message: "Database optimization completed",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to optimize database",
        timestamp: new Date().toISOString(),
      };
    }
  });
