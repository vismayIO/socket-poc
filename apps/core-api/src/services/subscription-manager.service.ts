import { WebSocketClient, Subscription } from "./websocket.service";
import { RateLimiterService } from "./rate-limiter.service";

export interface SubscriptionLimits {
  maxSubscriptionsPerClient: number;
  maxSymbolsPerSubscription: number;
  allowedDataTypes: string[];
  requireAuthentication: boolean;
  rateLimits: {
    subscriptionsPerMinute: number;
    messagesPerMinute: number;
  };
}

export interface SubscriptionStats {
  totalSubscriptions: number;
  subscriptionsByType: Record<string, number>;
  subscriptionsBySymbol: Record<string, number>;
  averageSubscriptionsPerClient: number;
  topSymbols: Array<{ symbol: string; count: number }>;
}

export class SubscriptionManagerService {
  private rateLimiter: RateLimiterService;
  private limits: SubscriptionLimits;
  private subscriptionHistory = new Map<
    string,
    Array<{ timestamp: Date; action: string; subscription: Subscription }>
  >();

  constructor(limits?: Partial<SubscriptionLimits>) {
    this.rateLimiter = new RateLimiterService();

    this.limits = {
      maxSubscriptionsPerClient: limits?.maxSubscriptionsPerClient || 50,
      maxSymbolsPerSubscription: limits?.maxSymbolsPerSubscription || 20,
      allowedDataTypes: limits?.allowedDataTypes || [
        "trades",
        "quotes",
        "orderbook",
        "ohlcv",
      ],
      requireAuthentication: limits?.requireAuthentication || false,
      rateLimits: {
        subscriptionsPerMinute:
          limits?.rateLimits?.subscriptionsPerMinute || 30,
        messagesPerMinute: limits?.rateLimits?.messagesPerMinute || 1000,
      },
    };

    // Configure rate limiters
    this.rateLimiter.configure("subscription", {
      windowMs: 60000, // 1 minute
      maxRequests: this.limits.rateLimits.subscriptionsPerMinute,
    });

    this.rateLimiter.configure("message", {
      windowMs: 60000, // 1 minute
      maxRequests: this.limits.rateLimits.messagesPerMinute,
    });
  }

  /**
   * Validate and process subscription request
   */
  validateSubscription(
    client: WebSocketClient,
    subscriptions: Subscription[],
  ): {
    valid: boolean;
    errors: string[];
    allowedSubscriptions: Subscription[];
  } {
    const errors: string[] = [];
    const allowedSubscriptions: Subscription[] = [];

    // Check authentication requirement
    if (this.limits.requireAuthentication && !client.authenticated) {
      errors.push("Authentication required for subscriptions");
      return { valid: false, errors, allowedSubscriptions };
    }

    // Check rate limiting
    const rateLimitInfo = this.rateLimiter.checkLimit(
      client.id,
      "subscription",
    );
    if (rateLimitInfo.isBlocked) {
      errors.push(
        `Rate limit exceeded. Try again in ${Math.ceil(rateLimitInfo.msBeforeNext / 1000)} seconds`,
      );
      return { valid: false, errors, allowedSubscriptions };
    }

    // Check total subscription limit
    const totalAfterAdd = client.subscriptions.length + subscriptions.length;
    if (totalAfterAdd > this.limits.maxSubscriptionsPerClient) {
      errors.push(
        `Maximum ${this.limits.maxSubscriptionsPerClient} subscriptions per client allowed`,
      );
      return { valid: false, errors, allowedSubscriptions };
    }

    // Validate each subscription
    for (const subscription of subscriptions) {
      const subscriptionErrors = this.validateSingleSubscription(subscription);

      if (subscriptionErrors.length === 0) {
        allowedSubscriptions.push(subscription);
      } else {
        errors.push(...subscriptionErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      allowedSubscriptions,
    };
  }

  /**
   * Validate a single subscription
   */
  private validateSingleSubscription(subscription: Subscription): string[] {
    const errors: string[] = [];

    // Check data type
    if (!this.limits.allowedDataTypes.includes(subscription.type)) {
      errors.push(
        `Invalid subscription type: ${subscription.type}. Allowed: ${this.limits.allowedDataTypes.join(", ")}`,
      );
    }

    // Check symbols array
    if (
      !Array.isArray(subscription.symbols) ||
      subscription.symbols.length === 0
    ) {
      errors.push("Subscription must include at least one symbol");
    } else if (
      subscription.symbols.length > this.limits.maxSymbolsPerSubscription
    ) {
      errors.push(
        `Maximum ${this.limits.maxSymbolsPerSubscription} symbols per subscription allowed`,
      );
    }

    // Validate symbols format
    for (const symbol of subscription.symbols) {
      if (typeof symbol !== "string" || symbol.length === 0) {
        errors.push(`Invalid symbol format: ${symbol}`);
      } else if (!/^[A-Z]{1,5}$/.test(symbol)) {
        errors.push(
          `Invalid symbol format: ${symbol}. Must be 1-5 uppercase letters`,
        );
      }
    }

    // Validate interval for OHLCV subscriptions
    if (subscription.type === "ohlcv") {
      if (
        subscription.interval &&
        !["1s", "1m", "5m", "1h", "1d"].includes(subscription.interval)
      ) {
        errors.push(
          `Invalid interval: ${subscription.interval}. Allowed: 1s, 1m, 5m, 1h, 1d`,
        );
      }
    }

    return errors;
  }

  /**
   * Check message rate limiting for a client
   */
  checkMessageRateLimit(clientId: string): {
    allowed: boolean;
    remainingMessages: number;
    resetTime: number;
  } {
    const rateLimitInfo = this.rateLimiter.checkLimit(clientId, "message");

    return {
      allowed: !rateLimitInfo.isBlocked,
      remainingMessages: rateLimitInfo.remainingPoints,
      resetTime: rateLimitInfo.msBeforeNext,
    };
  }

  /**
   * Record subscription activity for monitoring
   */
  recordSubscriptionActivity(
    clientId: string,
    action: "subscribe" | "unsubscribe",
    subscription: Subscription,
  ): void {
    if (!this.subscriptionHistory.has(clientId)) {
      this.subscriptionHistory.set(clientId, []);
    }

    const history = this.subscriptionHistory.get(clientId)!;
    history.push({
      timestamp: new Date(),
      action,
      subscription,
    });

    // Keep only last 100 activities per client
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Get subscription statistics
   */
  getSubscriptionStats(
    clients: Map<string, WebSocketClient>,
  ): SubscriptionStats {
    const subscriptionsByType: Record<string, number> = {};
    const subscriptionsBySymbol: Record<string, number> = {};
    let totalSubscriptions = 0;

    // Aggregate statistics from all clients
    for (const client of clients.values()) {
      for (const subscription of client.subscriptions) {
        totalSubscriptions++;

        // Count by type
        subscriptionsByType[subscription.type] =
          (subscriptionsByType[subscription.type] || 0) + 1;

        // Count by symbol
        for (const symbol of subscription.symbols) {
          subscriptionsBySymbol[symbol] =
            (subscriptionsBySymbol[symbol] || 0) + 1;
        }
      }
    }

    // Calculate average subscriptions per client
    const averageSubscriptionsPerClient =
      clients.size > 0 ? totalSubscriptions / clients.size : 0;

    // Get top symbols
    const topSymbols = Object.entries(subscriptionsBySymbol)
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSubscriptions,
      subscriptionsByType,
      subscriptionsBySymbol,
      averageSubscriptionsPerClient,
      topSymbols,
    };
  }

  /**
   * Get client subscription history
   */
  getClientHistory(
    clientId: string,
  ): Array<{ timestamp: Date; action: string; subscription: Subscription }> {
    return this.subscriptionHistory.get(clientId) || [];
  }

  /**
   * Clean up client history when client disconnects
   */
  cleanupClientHistory(clientId: string): void {
    this.subscriptionHistory.delete(clientId);
  }

  /**
   * Update subscription limits
   */
  updateLimits(newLimits: Partial<SubscriptionLimits>): void {
    this.limits = { ...this.limits, ...newLimits };

    // Update rate limiter configurations
    if (newLimits.rateLimits) {
      if (newLimits.rateLimits.subscriptionsPerMinute) {
        this.rateLimiter.configure("subscription", {
          windowMs: 60000,
          maxRequests: newLimits.rateLimits.subscriptionsPerMinute,
        });
      }

      if (newLimits.rateLimits.messagesPerMinute) {
        this.rateLimiter.configure("message", {
          windowMs: 60000,
          maxRequests: newLimits.rateLimits.messagesPerMinute,
        });
      }
    }
  }

  /**
   * Get current limits configuration
   */
  getLimits(): SubscriptionLimits {
    return { ...this.limits };
  }

  /**
   * Get rate limiter statistics
   */
  getRateLimiterStats(): any {
    return this.rateLimiter.getStats();
  }

  /**
   * Reset rate limits for a client
   */
  resetClientRateLimits(clientId: string): void {
    this.rateLimiter.reset(`${clientId}:subscription`);
    this.rateLimiter.reset(`${clientId}:message`);
  }
}
