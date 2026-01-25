import { EventEmitter } from "events";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  halfOpenMaxCalls: number;
  name: string;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextAttemptTime?: Date;
}

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private totalCalls = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private halfOpenCalls = 0;

  constructor(private config: CircuitBreakerConfig) {
    super();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        this.moveToHalfOpen();
      } else {
        throw new Error(
          `Circuit breaker is OPEN for ${this.config.name}. Next attempt at ${this.nextAttemptTime?.toISOString()}`,
        );
      }
    }

    if (
      this.state === "HALF_OPEN" &&
      this.halfOpenCalls >= this.config.halfOpenMaxCalls
    ) {
      throw new Error(
        `Circuit breaker is HALF_OPEN and max calls exceeded for ${this.config.name}`,
      );
    }

    this.totalCalls++;
    if (this.state === "HALF_OPEN") {
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute operation with fallback
   */
  async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.execute(operation);
    } catch (error) {
      this.emit("fallback_executed", {
        circuitBreaker: this.config.name,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      });
      return await fallback();
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;

    this.emit("reset", {
      circuitBreaker: this.config.name,
      timestamp: new Date(),
    });
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.state = "OPEN";
    this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);

    this.emit("forced_open", {
      circuitBreaker: this.config.name,
      timestamp: new Date(),
    });
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = new Date();

    if (this.state === "HALF_OPEN") {
      // If we've had enough successful calls in half-open state, close the circuit
      if (this.successCount >= this.config.halfOpenMaxCalls) {
        this.moveToClosed();
      }
    } else if (this.state === "CLOSED") {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }

    this.emit("success", {
      circuitBreaker: this.config.name,
      state: this.state,
      successCount: this.successCount,
      timestamp: new Date(),
    });
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === "HALF_OPEN") {
      // Any failure in half-open state moves back to open
      this.moveToOpen();
    } else if (
      this.state === "CLOSED" &&
      this.failureCount >= this.config.failureThreshold
    ) {
      // Too many failures in closed state, move to open
      this.moveToOpen();
    }

    this.emit("failure", {
      circuitBreaker: this.config.name,
      state: this.state,
      failureCount: this.failureCount,
      timestamp: new Date(),
    });
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) return false;
    return Date.now() >= this.nextAttemptTime.getTime();
  }

  private moveToOpen(): void {
    this.state = "OPEN";
    this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);
    this.halfOpenCalls = 0;

    this.emit("state_change", {
      circuitBreaker: this.config.name,
      newState: "OPEN",
      nextAttemptTime: this.nextAttemptTime,
      timestamp: new Date(),
    });
  }

  private moveToHalfOpen(): void {
    this.state = "HALF_OPEN";
    this.halfOpenCalls = 0;
    this.successCount = 0; // Reset success count for half-open evaluation

    this.emit("state_change", {
      circuitBreaker: this.config.name,
      newState: "HALF_OPEN",
      timestamp: new Date(),
    });
  }

  private moveToClosed(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.nextAttemptTime = undefined;

    this.emit("state_change", {
      circuitBreaker: this.config.name,
      newState: "CLOSED",
      timestamp: new Date(),
    });
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  /**
   * Create or get circuit breaker for a service
   */
  getCircuitBreaker(
    name: string,
    config?: Partial<CircuitBreakerConfig>,
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        recoveryTimeout: 60000, // 1 minute
        monitoringPeriod: 10000, // 10 seconds
        halfOpenMaxCalls: 3,
        name,
      };

      const finalConfig = { ...defaultConfig, ...config };
      const circuitBreaker = new CircuitBreaker(finalConfig);

      // Set up event logging
      circuitBreaker.on("state_change", (event) => {
        console.log(
          `Circuit breaker ${event.circuitBreaker} changed to ${event.newState}`,
        );
      });

      circuitBreaker.on("failure", (event) => {
        console.warn(
          `Circuit breaker ${event.circuitBreaker} failure count: ${event.failureCount}`,
        );
      });

      this.circuitBreakers.set(name, circuitBreaker);
    }

    return this.circuitBreakers.get(name)!;
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};

    for (const [name, circuitBreaker] of this.circuitBreakers) {
      stats[name] = circuitBreaker.getStats();
    }

    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
  }

  /**
   * Get circuit breakers in open state
   */
  getOpenCircuitBreakers(): string[] {
    const openBreakers: string[] = [];

    for (const [name, circuitBreaker] of this.circuitBreakers) {
      if (circuitBreaker.getStats().state === "OPEN") {
        openBreakers.push(name);
      }
    }

    return openBreakers;
  }
}

// Global circuit breaker registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
