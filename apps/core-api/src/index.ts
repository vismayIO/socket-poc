import { Elysia } from "elysia";
import { auth } from "../auth";
import { startAuthCalloutService } from "../lib/nats-auth-callout";
import { cors } from "@elysiajs/cors";
import { TradeGenerationService } from "./services/trade-generation.service";
import { websocketRoutes } from "./routes/websocket.routes";
import {
  marketDataRoutes,
  historicalDataRoutes,
} from "./routes/market-data.routes";
import { adminRoutes } from "./routes/admin.routes";
import { metricsMiddleware } from "./middleware/metrics.middleware";
import { monitoringService } from "./services/monitoring.service";
import { healthCheckService } from "./services/health-check.service";
import { gracefulDegradationService } from "./services/graceful-degradation.service";
import { performanceOptimizationService } from "./services/performance-optimization.service";
import { horizontalScalingService } from "./services/horizontal-scaling.service";

// Start the auth callout service
startAuthCalloutService().catch((error) => {
  console.error("Failed to start auth callout service:", error);
  console.log("Note: Make sure NATS is running and NATS_ISSUER_SEED is set");
});

// Initialize trade generation service
const tradeGenerationService = new TradeGenerationService();

// Start trade generation service
tradeGenerationService
  .initialize()
  .then(() => {
    console.log("✅ Trade generation service initialized");

    // Start generating trades for default symbols
    const defaultSymbols = ["AAPL", "GOOGL", "TSLA", "MSFT", "AMZN"];
    tradeGenerationService
      .startGeneration(defaultSymbols)
      .then(() => {
        console.log(
          `✅ Trade generation started for symbols: ${defaultSymbols.join(", ")}`,
        );
      })
      .catch((error) => {
        console.error("❌ Failed to start trade generation:", error);
      });
  })
  .catch((error) => {
    console.error("❌ Failed to initialize trade generation service:", error);
  });

const app = new Elysia()
  .use(cors())
  .use(metricsMiddleware)
  .use(websocketRoutes)
  .use(marketDataRoutes)
  .use(historicalDataRoutes)
  .use(adminRoutes)
  .mount(auth.handler)
  .get("/api/nats/info", () => {
    // Return NATS connection info for clients
    return {
      wsUrl: process.env.NATS_WS_URL || "ws://localhost:8080",
      // Connection instructions
      instructions:
        "Use your Better Auth bearer token as the password when connecting",
    };
  })
  .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

// Start resilience and monitoring services
healthCheckService.start();
console.log("✅ Health check service started");

// Register this instance with the scaling service
const instanceId = `instance-${process.pid}-${Date.now()}`;
horizontalScalingService.registerInstance(instanceId);
console.log(`✅ Instance ${instanceId} registered with scaling service`);

// Update instance metrics periodically
setInterval(() => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  horizontalScalingService.updateInstanceMetrics(instanceId, {
    cpuUsage:
      ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime()) * 100,
    memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
    connectionCount: 0, // This would be updated by WebSocket service
    healthy: true,
  });
}, 30000); // Update every 30 seconds

// Set up monitoring event listeners
monitoringService.on("alert_created", (alert) => {
  console.warn(`🚨 Alert created: ${alert.message}`);
});

monitoringService.on("alert_resolved", (alert) => {
  console.info(`✅ Alert resolved: ${alert.message}`);
});

monitoringService.on("health_check_failed", (healthCheck) => {
  console.error(
    `❌ Health check failed: ${healthCheck.name} - ${healthCheck.message}`,
  );
});

// Set up graceful degradation event listeners
gracefulDegradationService.on("degradation_level_changed", (event) => {
  console.warn(
    `⚠️ System degradation level changed from ${event.previousLevel} to ${event.newLevel}: ${event.reason}`,
  );
});

gracefulDegradationService.on("fallback_executed", (event) => {
  console.info(
    `🔄 Fallback executed for feature ${event.feature}: ${event.reason}`,
  );
});

// Set up performance optimization event listeners
performanceOptimizationService.on("optimization_applied", (optimization) => {
  console.info(`⚡ Performance optimization applied: ${optimization.name}`);
});

performanceOptimizationService.on("performance_alert", (alert) => {
  console.warn(`📊 Performance alert: ${alert.type} - ${alert.value}`);
});

// Set up scaling event listeners
horizontalScalingService.on("scale_up", (event) => {
  console.info(
    `📈 Scaled up by ${event.instanceCount} instances (total: ${event.totalInstances})`,
  );
});

horizontalScalingService.on("scale_down", (event) => {
  console.info(
    `📉 Scaled down by ${event.instanceCount} instances (total: ${event.totalInstances})`,
  );
});

horizontalScalingService.on("instance_unhealthy", (event) => {
  console.warn(`🚨 Instance ${event.instanceId} became unhealthy`);
});

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");

  // Remove instance from scaling service
  horizontalScalingService.removeInstance(instanceId);

  // Cleanup services
  healthCheckService.destroy();
  monitoringService.destroy();
  gracefulDegradationService.destroy();
  performanceOptimizationService.destroy();
  horizontalScalingService.destroy();

  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");

  // Remove instance from scaling service
  horizontalScalingService.removeInstance(instanceId);

  // Cleanup services
  healthCheckService.destroy();
  monitoringService.destroy();
  gracefulDegradationService.destroy();
  performanceOptimizationService.destroy();
  horizontalScalingService.destroy();

  process.exit(0);
});
