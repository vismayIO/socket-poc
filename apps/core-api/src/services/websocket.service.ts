import { ServerWebSocket } from "bun";
import { SubscriptionManagerService } from "./subscription-manager.service";
import { WebSocketMetrics } from "../middleware/metrics.middleware";
import { metricsService } from "./metrics.service";

export interface Subscription {
  type: "trades" | "quotes" | "orderbook" | "ohlcv";
  symbols: string[];
  interval?: "1s" | "1m" | "5m" | "1h" | "1d";
}

export interface WebSocketClient {
  id: string;
  socket: ServerWebSocket<any>;
  subscriptions: Subscription[];
  authenticated: boolean;
  userId?: string;
  connectedAt: Date;
  lastActivity: Date;
}

export interface StreamingMessage {
  type: string;
  channel: string;
  data: any;
  timestamp: Date;
}

export class WebSocketService {
  private clients = new Map<string, WebSocketClient>();
  private subscriptionIndex = new Map<string, Set<string>>(); // channel -> client IDs
  private compressionEnabled = true;
  private subscriptionManager: SubscriptionManagerService;

  constructor() {
    this.subscriptionManager = new SubscriptionManagerService({
      maxSubscriptionsPerClient: 50,
      maxSymbolsPerSubscription: 20,
      requireAuthentication: false, // Set to true in production
      rateLimits: {
        subscriptionsPerMinute: 30,
        messagesPerMinute: 1000,
      },
    });

    // Start connection health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Register a new WebSocket client
   */
  addClient(
    clientId: string,
    socket: ServerWebSocket<any>,
    userId?: string,
  ): void {
    const client: WebSocketClient = {
      id: clientId,
      socket,
      subscriptions: [],
      authenticated: !!userId,
      userId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.clients.set(clientId, client);
    console.log(
      `WebSocket client connected: ${clientId} (total: ${this.clients.size})`,
    );

    // Record metrics
    WebSocketMetrics.recordConnectionStart(clientId);
    metricsService.recordConnectionHealth(
      this.clients.size,
      this.getTotalSubscriptions(),
      this.getHealthyConnectionCount(),
    );

    // Send welcome message
    this.sendToClient(clientId, {
      type: "connection",
      data: {
        clientId,
        authenticated: client.authenticated,
        serverTime: new Date().toISOString(),
        compressionEnabled: this.compressionEnabled,
      },
    });
  }

  /**
   * Remove a WebSocket client and clean up subscriptions
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all subscription indexes
    for (const subscription of client.subscriptions) {
      this.removeFromSubscriptionIndex(subscription, clientId);
    }

    // Clean up subscription manager history
    this.subscriptionManager.cleanupClientHistory(clientId);

    this.clients.delete(clientId);
    console.log(
      `WebSocket client disconnected: ${clientId} (total: ${this.clients.size})`,
    );

    // Record metrics
    WebSocketMetrics.recordConnectionEnd(clientId);
    metricsService.recordConnectionHealth(
      this.clients.size,
      this.getTotalSubscriptions(),
      this.getHealthyConnectionCount(),
    );
  }

  /**
   * Handle client subscription requests with validation and rate limiting
   */
  subscribe(clientId: string, subscriptions: Subscription[]): void {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`Subscription request from unknown client: ${clientId}`);
      return;
    }

    // Update last activity
    client.lastActivity = new Date();

    // Validate subscriptions using subscription manager
    const validation = this.subscriptionManager.validateSubscription(
      client,
      subscriptions,
    );

    if (!validation.valid) {
      // Send error response
      this.sendToClient(clientId, {
        type: "subscription_error",
        data: {
          errors: validation.errors,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Add validated subscriptions
    for (const subscription of validation.allowedSubscriptions) {
      // Check if already subscribed
      const existing = client.subscriptions.find(
        (s) =>
          s.type === subscription.type &&
          JSON.stringify(s.symbols.sort()) ===
            JSON.stringify(subscription.symbols.sort()),
      );

      if (!existing) {
        client.subscriptions.push(subscription);
        this.addToSubscriptionIndex(subscription, clientId);

        // Record subscription activity
        this.subscriptionManager.recordSubscriptionActivity(
          clientId,
          "subscribe",
          subscription,
        );

        // Record subscription metrics
        WebSocketMetrics.recordSubscriptionChange(
          clientId,
          "subscribe",
          client.subscriptions.length,
        );
      }
    }

    // Send confirmation
    this.sendToClient(clientId, {
      type: "subscription_confirmed",
      data: {
        subscriptions: validation.allowedSubscriptions,
        totalSubscriptions: client.subscriptions.length,
        limits: this.subscriptionManager.getLimits(),
        timestamp: new Date().toISOString(),
      },
    });

    console.log(
      `Client ${clientId} subscribed to ${validation.allowedSubscriptions.length} channels (total: ${client.subscriptions.length})`,
    );
  }

  /**
   * Handle client unsubscription requests
   */
  unsubscribe(clientId: string, subscriptions: Subscription[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = new Date();

    // Remove subscriptions
    for (const subscription of subscriptions) {
      const index = client.subscriptions.findIndex(
        (s) =>
          s.type === subscription.type &&
          JSON.stringify(s.symbols.sort()) ===
            JSON.stringify(subscription.symbols.sort()),
      );

      if (index !== -1) {
        const removedSub = client.subscriptions.splice(index, 1)[0];
        this.removeFromSubscriptionIndex(removedSub, clientId);

        // Record unsubscription activity
        this.subscriptionManager.recordSubscriptionActivity(
          clientId,
          "unsubscribe",
          removedSub,
        );

        // Record subscription metrics
        WebSocketMetrics.recordSubscriptionChange(
          clientId,
          "unsubscribe",
          client.subscriptions.length,
        );
      }
    }

    // Send confirmation
    this.sendToClient(clientId, {
      type: "unsubscription_confirmed",
      data: {
        subscriptions: client.subscriptions,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Broadcast message to all subscribed clients with rate limiting
   */
  broadcast(channel: string, data: any): void {
    const subscribedClients = this.subscriptionIndex.get(channel);
    if (!subscribedClients || subscribedClients.size === 0) {
      return;
    }

    const message: StreamingMessage = {
      type: "data",
      channel,
      data,
      timestamp: new Date(),
    };

    let successCount = 0;
    let errorCount = 0;
    let rateLimitedCount = 0;

    for (const clientId of subscribedClients) {
      try {
        // Check message rate limit for client
        const rateLimitCheck =
          this.subscriptionManager.checkMessageRateLimit(clientId);

        if (!rateLimitCheck.allowed) {
          rateLimitedCount++;
          // Optionally send rate limit warning to client
          this.sendToClient(clientId, {
            type: "rate_limit_warning",
            data: {
              message: "Message rate limit exceeded",
              remainingMessages: rateLimitCheck.remainingMessages,
              resetTime: rateLimitCheck.resetTime,
            },
          });
          continue;
        }

        this.sendToClient(clientId, message);
        successCount++;

        // Record message metrics
        const messageSize = JSON.stringify(message).length;
        WebSocketMetrics.recordMessageSent(clientId, message.type, messageSize);
      } catch (error) {
        errorCount++;
        console.error(`Failed to send message to client ${clientId}:`, error);

        // Record message error
        WebSocketMetrics.recordMessageError(
          clientId,
          error instanceof Error ? error.message : "Unknown error",
        );

        // Remove failed client
        this.removeClient(clientId);
      }
    }

    if (errorCount > 0 || rateLimitedCount > 0) {
      console.warn(
        `Broadcast to ${channel}: ${successCount} success, ${errorCount} errors, ${rateLimitedCount} rate limited`,
      );
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const payload = JSON.stringify(message);

      if (this.compressionEnabled && payload.length > 1024) {
        // For large messages, let WebSocket handle compression
        client.socket.send(payload);
      } else {
        client.socket.send(payload);
      }
    } catch (error) {
      console.error(`Failed to send message to client ${clientId}:`, error);
      this.removeClient(clientId);
    }
  }

  /**
   * Add subscription to index for efficient broadcasting
   */
  private addToSubscriptionIndex(
    subscription: Subscription,
    clientId: string,
  ): void {
    for (const symbol of subscription.symbols) {
      const channel = this.getChannelName(
        subscription.type,
        symbol,
        subscription.interval,
      );

      if (!this.subscriptionIndex.has(channel)) {
        this.subscriptionIndex.set(channel, new Set());
      }

      this.subscriptionIndex.get(channel)!.add(clientId);
    }
  }

  /**
   * Remove subscription from index
   */
  private removeFromSubscriptionIndex(
    subscription: Subscription,
    clientId: string,
  ): void {
    for (const symbol of subscription.symbols) {
      const channel = this.getChannelName(
        subscription.type,
        symbol,
        subscription.interval,
      );
      const clients = this.subscriptionIndex.get(channel);

      if (clients) {
        clients.delete(clientId);
        if (clients.size === 0) {
          this.subscriptionIndex.delete(channel);
        }
      }
    }
  }

  /**
   * Generate channel name for subscription indexing
   */
  private getChannelName(
    type: string,
    symbol: string,
    interval?: string,
  ): string {
    return interval ? `${type}:${symbol}:${interval}` : `${type}:${symbol}`;
  }

  /**
   * Get comprehensive connection and subscription statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    authenticatedConnections: number;
    totalSubscriptions: number;
    channelCount: number;
    averageSubscriptionsPerClient: number;
    subscriptionStats: any;
    rateLimiterStats: any;
  } {
    const totalConnections = this.clients.size;
    const authenticatedConnections = Array.from(this.clients.values()).filter(
      (client) => client.authenticated,
    ).length;

    const totalSubscriptions = Array.from(this.clients.values()).reduce(
      (sum, client) => sum + client.subscriptions.length,
      0,
    );

    const channelCount = this.subscriptionIndex.size;
    const averageSubscriptionsPerClient =
      totalConnections > 0 ? totalSubscriptions / totalConnections : 0;

    // Get detailed subscription statistics
    const subscriptionStats = this.subscriptionManager.getSubscriptionStats(
      this.clients,
    );
    const rateLimiterStats = this.subscriptionManager.getRateLimiterStats();

    return {
      totalConnections,
      authenticatedConnections,
      totalSubscriptions,
      channelCount,
      averageSubscriptionsPerClient,
      subscriptionStats,
      rateLimiterStats,
    };
  }

  /**
   * Start health monitoring for connections
   */
  private startHealthMonitoring(): void {
    setInterval(() => {
      const now = new Date();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceActivity = now.getTime() - client.lastActivity.getTime();

        if (timeSinceActivity > staleThreshold) {
          console.log(`Removing stale client: ${clientId}`);
          this.removeClient(clientId);
        } else {
          // Send ping to keep connection alive
          try {
            client.socket.ping();
          } catch (error) {
            console.log(`Failed to ping client ${clientId}, removing`);
            this.removeClient(clientId);
          }
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Handle client authentication
   */
  authenticateClient(clientId: string, userId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    client.authenticated = true;
    client.userId = userId;
    client.lastActivity = new Date();

    this.sendToClient(clientId, {
      type: "authentication",
      data: {
        authenticated: true,
        userId,
        timestamp: new Date().toISOString(),
      },
    });

    return true;
  }

  /**
   * Get client information
   */
  getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all clients for a specific user
   */
  getClientsByUser(userId: string): WebSocketClient[] {
    return Array.from(this.clients.values()).filter(
      (client) => client.userId === userId,
    );
  }

  /**
   * Get subscription manager instance
   */
  getSubscriptionManager(): SubscriptionManagerService {
    return this.subscriptionManager;
  }

  /**
   * Update subscription limits
   */
  updateSubscriptionLimits(limits: any): void {
    this.subscriptionManager.updateLimits(limits);
  }

  /**
   * Reset rate limits for a client
   */
  resetClientRateLimits(clientId: string): void {
    this.subscriptionManager.resetClientRateLimits(clientId);
  }

  /**
   * Get total subscriptions count
   */
  private getTotalSubscriptions(): number {
    return Array.from(this.clients.values()).reduce(
      (sum, client) => sum + client.subscriptions.length,
      0,
    );
  }

  /**
   * Get healthy connection count (connections that are responsive)
   */
  private getHealthyConnectionCount(): number {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    return Array.from(this.clients.values()).filter((client) => {
      const timeSinceActivity = now.getTime() - client.lastActivity.getTime();
      return timeSinceActivity <= staleThreshold;
    }).length;
  }
}
