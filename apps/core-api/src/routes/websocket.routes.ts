import { Elysia } from "elysia";
import { WebSocketService, Subscription } from "../services/websocket.service";
import { NatsStreamingService } from "../services/nats-streaming.service";
import { MessageRouterService } from "../services/message-router.service";

// Create singleton service instances
export const webSocketService = new WebSocketService();
export const natsStreamingService = new NatsStreamingService();
export const messageRouterService = new MessageRouterService(
  natsStreamingService,
  webSocketService,
);

// Initialize NATS and message routing
let servicesInitialized = false;

async function initializeServices() {
  if (servicesInitialized) return;

  try {
    console.log("Initializing streaming services...");

    // Initialize NATS streaming
    await natsStreamingService.initialize();

    // Start message routing from NATS to WebSocket
    await messageRouterService.startRouting();

    servicesInitialized = true;
    console.log("Streaming services initialized successfully");
  } catch (error) {
    console.error("Failed to initialize streaming services:", error);
    // Don't throw here - allow the server to start even if NATS is not available
    console.log(
      "Server will continue without NATS streaming. WebSocket connections will still work for direct messaging.",
    );
  }
}

// Initialize services when module loads
initializeServices();

export const websocketRoutes = new Elysia()
  .ws("/api/v1/stream", {
    // WebSocket connection handler
    open(ws) {
      const clientId = crypto.randomUUID();

      // Store client ID in WebSocket data
      (ws as any).clientId = clientId;

      // Register client with WebSocket service
      webSocketService.addClient(clientId, ws.raw as any);
    },

    // Handle incoming messages from clients
    message(ws, message) {
      const clientId = (ws as any).clientId as string;

      try {
        const parsedMessage =
          typeof message === "string" ? JSON.parse(message) : message;

        switch (parsedMessage.type) {
          case "subscribe":
            handleSubscribe(clientId, parsedMessage.data);
            break;

          case "unsubscribe":
            handleUnsubscribe(clientId, parsedMessage.data);
            break;

          case "authenticate":
            handleAuthenticate(clientId, parsedMessage.data);
            break;

          case "ping":
            handlePing(clientId);
            break;

          default:
            console.warn(
              `Unknown message type from client ${clientId}:`,
              parsedMessage.type,
            );
            ws.send(
              JSON.stringify({
                type: "error",
                data: {
                  message: "Unknown message type",
                  receivedType: parsedMessage.type,
                },
              }),
            );
        }
      } catch (error) {
        console.error(
          `Error processing message from client ${clientId}:`,
          error,
        );
        ws.send(
          JSON.stringify({
            type: "error",
            data: {
              message: "Invalid message format",
              error: error instanceof Error ? error.message : "Unknown error",
            },
          }),
        );
      }
    },

    // Handle client disconnection
    close(ws) {
      const clientId = (ws as any).clientId as string;
      webSocketService.removeClient(clientId);
    },
  })

  // REST endpoint to get streaming service status
  .get("/api/v1/stream/status", () => {
    const routerStatus = messageRouterService.getStatus();
    return {
      success: true,
      data: routerStatus,
      timestamp: new Date().toISOString(),
    };
  })

  // REST endpoint to broadcast a message (for testing/admin purposes)
  .post("/api/v1/stream/broadcast", async ({ body }) => {
    try {
      const { channel, data } = body as { channel: string; data: any };

      if (!channel || !data) {
        return {
          success: false,
          error: "Missing required fields: channel, data",
        };
      }

      webSocketService.broadcast(channel, data);

      return {
        success: true,
        message: `Message broadcasted to channel: ${channel}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  // REST endpoint to get WebSocket connection statistics
  .get("/api/v1/stream/stats", () => {
    const stats = webSocketService.getConnectionStats();
    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    };
  })

  // REST endpoint to publish message to NATS (for testing/admin purposes)
  .post("/api/v1/stream/publish", async ({ body }) => {
    try {
      const { type, symbol, data } = body as {
        type: "trade" | "quote" | "orderbook" | "ohlcv";
        symbol: string;
        data: any;
      };

      if (!type || !symbol || !data) {
        return {
          success: false,
          error: "Missing required fields: type, symbol, data",
        };
      }

      // Publish to NATS based on type
      switch (type) {
        case "trade":
          await natsStreamingService.publishTrade(symbol, data);
          break;
        case "quote":
          await natsStreamingService.publishQuote(symbol, data);
          break;
        case "orderbook":
          await natsStreamingService.publishOrderBook(symbol, data);
          break;
        case "ohlcv":
          await natsStreamingService.publishOHLCV(
            symbol,
            data,
            data.interval || "1m",
          );
          break;
        default:
          return {
            success: false,
            error: `Invalid message type: ${type}`,
          };
      }

      return {
        success: true,
        message: `Message published to NATS: ${type}:${symbol}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  // Admin endpoint to update subscription limits
  .post("/api/v1/stream/admin/limits", async ({ body }) => {
    try {
      const limits = body as any;
      webSocketService.updateSubscriptionLimits(limits);

      return {
        success: true,
        message: "Subscription limits updated",
        newLimits: webSocketService.getSubscriptionManager().getLimits(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  // Admin endpoint to reset client rate limits
  .post("/api/v1/stream/admin/reset-limits/:clientId", async ({ params }) => {
    try {
      const { clientId } = params;
      webSocketService.resetClientRateLimits(clientId);

      return {
        success: true,
        message: `Rate limits reset for client: ${clientId}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })

  // Admin endpoint to get client subscription history
  .get("/api/v1/stream/admin/history/:clientId", async ({ params }) => {
    try {
      const { clientId } = params;
      const history = webSocketService
        .getSubscriptionManager()
        .getClientHistory(clientId);

      return {
        success: true,
        data: {
          clientId,
          history,
          totalActivities: history.length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

/**
 * Handle client subscription requests
 */
function handleSubscribe(clientId: string, data: any): void {
  try {
    const { subscriptions } = data as { subscriptions: Subscription[] };

    if (!Array.isArray(subscriptions)) {
      throw new Error("Subscriptions must be an array");
    }

    // Validate subscription format
    for (const sub of subscriptions) {
      if (!sub.type || !Array.isArray(sub.symbols)) {
        throw new Error("Invalid subscription format");
      }

      if (!["trades", "quotes", "orderbook", "ohlcv"].includes(sub.type)) {
        throw new Error(`Invalid subscription type: ${sub.type}`);
      }

      if (
        sub.type === "ohlcv" &&
        sub.interval &&
        !["1s", "1m", "5m", "1h", "1d"].includes(sub.interval)
      ) {
        throw new Error(`Invalid interval: ${sub.interval}`);
      }
    }

    webSocketService.subscribe(clientId, subscriptions);
  } catch (error) {
    console.error(`Subscription error for client ${clientId}:`, error);
    const client = webSocketService.getClient(clientId);
    if (client) {
      client.socket.send(
        JSON.stringify({
          type: "error",
          data: {
            message: "Subscription failed",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }),
      );
    }
  }
}

/**
 * Handle client unsubscription requests
 */
function handleUnsubscribe(clientId: string, data: any): void {
  try {
    const { subscriptions } = data as { subscriptions: Subscription[] };

    if (!Array.isArray(subscriptions)) {
      throw new Error("Subscriptions must be an array");
    }

    webSocketService.unsubscribe(clientId, subscriptions);
  } catch (error) {
    console.error(`Unsubscription error for client ${clientId}:`, error);
    const client = webSocketService.getClient(clientId);
    if (client) {
      client.socket.send(
        JSON.stringify({
          type: "error",
          data: {
            message: "Unsubscription failed",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }),
      );
    }
  }
}

/**
 * Handle client authentication
 */
async function handleAuthenticate(clientId: string, data: any): Promise<void> {
  try {
    const { token } = data as { token: string };

    if (!token) {
      throw new Error("Authentication token required");
    }

    // Verify token using Better Auth
    // Note: This is a simplified version - in production you'd want more robust token validation
    try {
      // For now, we'll accept any non-empty token as valid
      // In a real implementation, you'd verify the JWT token here
      const userId = `user_${Date.now()}`; // Placeholder user ID

      const success = webSocketService.authenticateClient(clientId, userId);

      if (!success) {
        throw new Error("Authentication failed");
      }
    } catch (authError) {
      throw new Error("Invalid authentication token");
    }
  } catch (error) {
    console.error(`Authentication error for client ${clientId}:`, error);
    const client = webSocketService.getClient(clientId);
    if (client) {
      client.socket.send(
        JSON.stringify({
          type: "error",
          data: {
            message: "Authentication failed",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }),
      );
    }
  }
}

/**
 * Handle ping messages for connection health
 */
function handlePing(clientId: string): void {
  const client = webSocketService.getClient(clientId);
  if (client) {
    client.lastActivity = new Date();
    client.socket.send(
      JSON.stringify({
        type: "pong",
        data: {
          timestamp: new Date().toISOString(),
        },
      }),
    );
  }
}
