export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsInWindow: number;
  remainingPoints: number;
  msBeforeNext: number;
  isBlocked: boolean;
}

export class RateLimiterService {
  private requestCounts = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private configs = new Map<string, RateLimitConfig>();

  constructor() {
    // Clean up expired entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Configure rate limiting for a specific key pattern
   */
  configure(keyPattern: string, config: RateLimitConfig): void {
    this.configs.set(keyPattern, config);
  }

  /**
   * Check if a request should be rate limited
   */
  checkLimit(key: string, keyPattern: string = "default"): RateLimitInfo {
    const config = this.configs.get(keyPattern) || {
      windowMs: 60000, // 1 minute default
      maxRequests: 100, // 100 requests per minute default
    };

    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get or create request count for this key
    let requestData = this.requestCounts.get(key);

    if (!requestData || requestData.resetTime <= now) {
      // Create new window
      requestData = {
        count: 0,
        resetTime: now + config.windowMs,
      };
      this.requestCounts.set(key, requestData);
    }

    // Increment request count
    requestData.count++;

    const isBlocked = requestData.count > config.maxRequests;
    const remainingPoints = Math.max(0, config.maxRequests - requestData.count);
    const msBeforeNext = Math.max(0, requestData.resetTime - now);

    return {
      totalHits: requestData.count,
      totalHitsInWindow: requestData.count,
      remainingPoints,
      msBeforeNext,
      isBlocked,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.requestCounts.delete(key);
  }

  /**
   * Get current rate limit status for a key
   */
  getStatus(key: string, keyPattern: string = "default"): RateLimitInfo {
    const config = this.configs.get(keyPattern) || {
      windowMs: 60000,
      maxRequests: 100,
    };

    const requestData = this.requestCounts.get(key);
    const now = Date.now();

    if (!requestData || requestData.resetTime <= now) {
      return {
        totalHits: 0,
        totalHitsInWindow: 0,
        remainingPoints: config.maxRequests,
        msBeforeNext: 0,
        isBlocked: false,
      };
    }

    const isBlocked = requestData.count > config.maxRequests;
    const remainingPoints = Math.max(0, config.maxRequests - requestData.count);
    const msBeforeNext = Math.max(0, requestData.resetTime - now);

    return {
      totalHits: requestData.count,
      totalHitsInWindow: requestData.count,
      remainingPoints,
      msBeforeNext,
      isBlocked,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, data] of this.requestCounts.entries()) {
      if (data.resetTime <= now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.requestCounts.delete(key);
    }

    if (expiredKeys.length > 0) {
      console.log(
        `Cleaned up ${expiredKeys.length} expired rate limit entries`,
      );
    }
  }

  /**
   * Get statistics about rate limiting
   */
  getStats(): {
    totalKeys: number;
    totalConfigs: number;
    activeWindows: number;
  } {
    const now = Date.now();
    const activeWindows = Array.from(this.requestCounts.values()).filter(
      (data) => data.resetTime > now,
    ).length;

    return {
      totalKeys: this.requestCounts.size,
      totalConfigs: this.configs.size,
      activeWindows,
    };
  }
}
