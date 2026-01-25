import { EventEmitter } from "events";

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

export interface RetryStats {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttempts: number;
  lastRetryTime?: Date;
}

export class RetryService extends EventEmitter {
  private stats: RetryStats = {
    totalAttempts: 0,
    successfulRetries: 0,
    failedRetries: 0,
    averageAttempts: 0,
  };

  /**
   * Execute operation with exponential backoff retry
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<T> {
    const finalConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      retryCondition: (error) => this.isRetryableError(error),
      ...config,
    };

    let lastError: any;
    let attempt = 0;

    while (attempt < finalConfig.maxAttempts) {
      attempt++;
      this.stats.totalAttempts++;

      try {
        const result = await operation();

        if (attempt > 1) {
          this.stats.successfulRetries++;
          this.emit("retry_success", {
            attempt,
            totalAttempts: this.stats.totalAttempts,
            timestamp: new Date(),
          });
        }

        this.updateAverageAttempts();
        return result;
      } catch (error) {
        lastError = error;
        this.stats.lastRetryTime = new Date();

        // Check if we should retry this error
        if (!finalConfig.retryCondition!(error)) {
          this.stats.failedRetries++;
          this.emit("retry_failed_non_retryable", {
            attempt,
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date(),
          });
          throw error;
        }

        // If this is the last attempt, don't wait
        if (attempt >= finalConfig.maxAttempts) {
          this.stats.failedRetries++;
          this.emit("retry_exhausted", {
            totalAttempts: attempt,
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date(),
          });
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, finalConfig);

        this.emit("retry_attempt", {
          attempt,
          delay,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date(),
        });

        // Call onRetry callback if provided
        if (finalConfig.onRetry) {
          finalConfig.onRetry(attempt, error);
        }

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    this.updateAverageAttempts();
    throw lastError;
  }

  /**
   * Execute operation with circuit breaker and retry
   */
  async executeWithCircuitBreakerAndRetry<T>(
    operation: () => Promise<T>,
    circuitBreakerName: string,
    retryConfig: Partial<RetryConfig> = {},
  ): Promise<T> {
    const { circuitBreakerRegistry } =
      await import("./circuit-breaker.service");
    const circuitBreaker =
      circuitBreakerRegistry.getCircuitBreaker(circuitBreakerName);

    return this.executeWithRetry(() => circuitBreaker.execute(operation), {
      ...retryConfig,
      retryCondition: (error) => {
        // Don't retry if circuit breaker is open
        if (error.message?.includes("Circuit breaker is OPEN")) {
          return false;
        }
        return this.isRetryableError(error);
      },
    });
  }

  /**
   * Get retry statistics
   */
  getStats(): RetryStats {
    return { ...this.stats };
  }

  /**
   * Reset retry statistics
   */
  resetStats(): void {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
    };
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    // Calculate exponential backoff delay
    let delay =
      config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);

    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  private isRetryableError(error: any): boolean {
    if (!error) return false;

    // Network errors are generally retryable
    if (
      error.code === "ECONNRESET" ||
      error.code === "ECONNREFUSED" ||
      error.code === "ETIMEDOUT" ||
      error.code === "ENOTFOUND"
    ) {
      return true;
    }

    // HTTP status codes that are retryable
    if (error.status) {
      const retryableStatuses = [408, 429, 500, 502, 503, 504];
      return retryableStatuses.includes(error.status);
    }

    // Database connection errors
    if (
      error.message?.includes("connection") ||
      error.message?.includes("timeout") ||
      error.message?.includes("ECONNRESET")
    ) {
      return true;
    }

    // NATS specific errors
    if (
      error.message?.includes("NATS") &&
      (error.message?.includes("connection") ||
        error.message?.includes("timeout"))
    ) {
      return true;
    }

    return false;
  }

  private updateAverageAttempts(): void {
    if (this.stats.successfulRetries + this.stats.failedRetries > 0) {
      this.stats.averageAttempts =
        this.stats.totalAttempts /
        (this.stats.successfulRetries + this.stats.failedRetries);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Resilience service combining circuit breaker and retry patterns
 */
export class ResilienceService {
  private retryService = new RetryService();

  /**
   * Execute database operation with resilience patterns
   */
  async executeDatabaseOperation<T>(
    operation: () => Promise<T>,
    operationName: string = "database",
  ): Promise<T> {
    return this.retryService.executeWithCircuitBreakerAndRetry(
      operation,
      `db_${operationName}`,
      {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitter: true,
        onRetry: (attempt, error) => {
          console.warn(
            `Database operation ${operationName} retry attempt ${attempt}: ${error.message}`,
          );
        },
      },
    );
  }

  /**
   * Execute NATS operation with resilience patterns
   */
  async executeNATSOperation<T>(
    operation: () => Promise<T>,
    operationName: string = "nats",
  ): Promise<T> {
    return this.retryService.executeWithCircuitBreakerAndRetry(
      operation,
      `nats_${operationName}`,
      {
        maxAttempts: 5,
        baseDelay: 500,
        maxDelay: 10000,
        backoffMultiplier: 1.5,
        jitter: true,
        onRetry: (attempt, error) => {
          console.warn(
            `NATS operation ${operationName} retry attempt ${attempt}: ${error.message}`,
          );
        },
      },
    );
  }

  /**
   * Execute WebSocket operation with resilience patterns
   */
  async executeWebSocketOperation<T>(
    operation: () => Promise<T>,
    operationName: string = "websocket",
  ): Promise<T> {
    return this.retryService.executeWithCircuitBreakerAndRetry(
      operation,
      `ws_${operationName}`,
      {
        maxAttempts: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: false, // WebSocket operations need to be fast
        onRetry: (attempt, error) => {
          console.warn(
            `WebSocket operation ${operationName} retry attempt ${attempt}: ${error.message}`,
          );
        },
      },
    );
  }

  /**
   * Execute external API operation with resilience patterns
   */
  async executeExternalAPIOperation<T>(
    operation: () => Promise<T>,
    operationName: string = "external_api",
  ): Promise<T> {
    return this.retryService.executeWithCircuitBreakerAndRetry(
      operation,
      `api_${operationName}`,
      {
        maxAttempts: 4,
        baseDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: true,
        onRetry: (attempt, error) => {
          console.warn(
            `External API operation ${operationName} retry attempt ${attempt}: ${error.message}`,
          );
        },
      },
    );
  }

  /**
   * Get comprehensive resilience statistics
   */
  getResilienceStats(): {
    retry: RetryStats;
    circuitBreakers: Record<string, any>;
  } {
    const { circuitBreakerRegistry } = require("./circuit-breaker.service");

    return {
      retry: this.retryService.getStats(),
      circuitBreakers: circuitBreakerRegistry.getAllStats(),
    };
  }

  /**
   * Reset all resilience statistics
   */
  resetStats(): void {
    this.retryService.resetStats();
    const { circuitBreakerRegistry } = require("./circuit-breaker.service");
    circuitBreakerRegistry.resetAll();
  }
}

// Global resilience service instance
export const resilienceService = new ResilienceService();
