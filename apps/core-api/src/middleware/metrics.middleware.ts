import { Elysia } from "elysia";
import { metricsService } from "../services/metrics.service";

export interface RequestMetrics {
  startTime: number;
  operation: string;
  method: string;
  path: string;
  userId?: string;
}

/**
 * Metrics middleware for tracking API performance
 */
export const metricsMiddleware = new Elysia({ name: "metrics" })
  .derive(({ request, path }) => {
    const startTime = Date.now();
    const operation = `api_${request.method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;

    return {
      metrics: {
        startTime,
        operation,
        method: request.method,
        path,
      } as RequestMetrics,
    };
  })
  .onAfterHandle(({ metrics, set }) => {
    const duration = Date.now() - metrics.startTime;
    const success = !set.status || (set.status >= 200 && set.status < 400);

    // Record latency
    metricsService.recordLatency(
      metrics.operation,
      metrics.startTime,
      success,
      {
        method: metrics.method,
        path: metrics.path,
        status: set.status?.toString() || "200",
      },
    );

    // Record throughput
    metricsService.recordThroughput("api_request", 1, {
      method: metrics.method,
      path: metrics.path,
      status: set.status?.toString() || "200",
    });

    // Record database operation if applicable
    if (metrics.path.includes("/api/v1/")) {
      metricsService.recordThroughput("db_operation", 1, {
        operation: metrics.operation,
      });
    }
  })
  .onError(({ error, metrics, set }) => {
    // Record error
    metricsService.recordError(metrics.operation, error, {
      method: metrics.method,
      path: metrics.path,
      status: set.status?.toString() || "500",
    });

    // Still record latency for failed requests
    metricsService.recordLatency(metrics.operation, metrics.startTime, false, {
      method: metrics.method,
      path: metrics.path,
      status: set.status?.toString() || "500",
    });
  });

/**
 * WebSocket metrics tracking utilities
 */
export class WebSocketMetrics {
  private static connectionStartTimes = new Map<string, number>();

  static recordConnectionStart(clientId: string): void {
    const startTime = Date.now();
    this.connectionStartTimes.set(clientId, startTime);

    metricsService.recordThroughput("ws_connection", 1, {
      type: "connect",
      clientId,
    });
  }

  static recordConnectionEnd(clientId: string): void {
    const startTime = this.connectionStartTimes.get(clientId);
    if (startTime) {
      const duration = Date.now() - startTime;
      metricsService.recordLatency("ws_connection_duration", startTime, true, {
        clientId,
      });
      this.connectionStartTimes.delete(clientId);
    }

    metricsService.recordThroughput("ws_connection", 1, {
      type: "disconnect",
      clientId,
    });
  }

  static recordMessageSent(
    clientId: string,
    messageType: string,
    messageSize: number,
  ): void {
    const startTime = Date.now();

    metricsService.recordThroughput("message_sent", 1, {
      clientId,
      messageType,
      size: messageSize.toString(),
    });

    // Track message delivery latency (this would be completed when client acknowledges)
    metricsService.recordLatency("ws_message_delivery", startTime, true, {
      clientId,
      messageType,
    });
  }

  static recordMessageError(clientId: string, error: string): void {
    metricsService.recordError("ws_message_delivery", error, {
      clientId,
    });
  }

  static recordSubscriptionChange(
    clientId: string,
    action: "subscribe" | "unsubscribe",
    subscriptionCount: number,
  ): void {
    metricsService.recordThroughput(`ws_${action}`, 1, {
      clientId,
      subscriptionCount: subscriptionCount.toString(),
    });
  }
}

/**
 * Database metrics tracking utilities
 */
export class DatabaseMetrics {
  static recordQuery(
    operation: string,
    startTime: number,
    success: boolean,
    rowCount?: number,
  ): void {
    metricsService.recordLatency(`db_${operation}`, startTime, success, {
      operation,
      rowCount: rowCount?.toString(),
    });

    metricsService.recordThroughput("db_operation", 1, {
      operation,
      success: success.toString(),
    });

    if (!success) {
      metricsService.recordError(`db_${operation}`, "Query failed", {
        operation,
      });
    }
  }

  static recordTransaction(
    operation: string,
    startTime: number,
    success: boolean,
    operationCount: number,
  ): void {
    metricsService.recordLatency(
      `db_transaction_${operation}`,
      startTime,
      success,
      {
        operation,
        operationCount: operationCount.toString(),
      },
    );

    if (!success) {
      metricsService.recordError(
        `db_transaction_${operation}`,
        "Transaction failed",
        {
          operation,
        },
      );
    }
  }
}

/**
 * Trade generation metrics tracking
 */
export class TradeGenerationMetrics {
  static recordTradeGenerated(symbol: string, processingTime: number): void {
    const startTime = Date.now() - processingTime;

    metricsService.recordLatency("trade_generation", startTime, true, {
      symbol,
    });

    metricsService.recordThroughput("trade_generated", 1, { symbol });
  }

  static recordDataGenerationToClientLatency(
    symbol: string,
    startTime: number,
  ): void {
    metricsService.recordLatency("data_generation_to_client", startTime, true, {
      symbol,
    });
  }

  static recordGenerationError(symbol: string, error: string): void {
    metricsService.recordError("generation_error", error, { symbol });
  }

  static recordOHLCVAggregation(
    symbol: string,
    interval: string,
    recordCount: number,
    processingTime: number,
  ): void {
    const startTime = Date.now() - processingTime;

    metricsService.recordLatency("ohlcv_aggregation", startTime, true, {
      symbol,
      interval,
      recordCount: recordCount.toString(),
    });
  }
}
