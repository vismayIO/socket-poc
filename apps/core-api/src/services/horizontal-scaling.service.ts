import { EventEmitter } from "events";

export interface ScalingConfig {
  minInstances: number;
  maxInstances: number;
  targetCpuUtilization: number;
  targetMemoryUtilization: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownPeriod: number; // milliseconds
}

export interface InstanceInfo {
  id: string;
  status: "starting" | "running" | "stopping" | "stopped";
  cpuUsage: number;
  memoryUsage: number;
  connectionCount: number;
  startTime: Date;
  lastHealthCheck: Date;
  healthy: boolean;
}

export interface ScalingMetrics {
  currentInstances: number;
  targetInstances: number;
  averageCpuUsage: number;
  averageMemoryUsage: number;
  totalConnections: number;
  lastScalingAction?: Date;
  scalingReason?: string;
}

export interface LoadBalancerConfig {
  algorithm: "round_robin" | "least_connections" | "weighted_round_robin";
  healthCheckInterval: number;
  healthCheckTimeout: number;
  maxFailedHealthChecks: number;
}

export class HorizontalScalingService extends EventEmitter {
  private config: ScalingConfig;
  private instances = new Map<string, InstanceInfo>();
  private currentInstanceIndex = 0;
  private lastScalingAction?: Date;
  private scalingCooldown = false;
  private monitoringInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config?: Partial<ScalingConfig>) {
    super();

    this.config = {
      minInstances: 2,
      maxInstances: 10,
      targetCpuUtilization: 70,
      targetMemoryUtilization: 80,
      scaleUpThreshold: 80,
      scaleDownThreshold: 30,
      cooldownPeriod: 300000, // 5 minutes
      ...config,
    };

    this.startMonitoring();
    this.startHealthChecks();
  }

  /**
   * Register a new instance
   */
  registerInstance(instanceId: string): void {
    const instance: InstanceInfo = {
      id: instanceId,
      status: "starting",
      cpuUsage: 0,
      memoryUsage: 0,
      connectionCount: 0,
      startTime: new Date(),
      lastHealthCheck: new Date(),
      healthy: false,
    };

    this.instances.set(instanceId, instance);

    this.emit("instance_registered", {
      instanceId,
      totalInstances: this.instances.size,
      timestamp: new Date(),
    });
  }

  /**
   * Update instance metrics
   */
  updateInstanceMetrics(
    instanceId: string,
    metrics: {
      cpuUsage: number;
      memoryUsage: number;
      connectionCount: number;
      healthy: boolean;
    },
  ): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    instance.cpuUsage = metrics.cpuUsage;
    instance.memoryUsage = metrics.memoryUsage;
    instance.connectionCount = metrics.connectionCount;
    instance.healthy = metrics.healthy;
    instance.lastHealthCheck = new Date();
    instance.status = metrics.healthy ? "running" : "stopping";

    this.instances.set(instanceId, instance);
  }

  /**
   * Remove an instance
   */
  removeInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = "stopped";
      this.instances.delete(instanceId);

      this.emit("instance_removed", {
        instanceId,
        totalInstances: this.instances.size,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get the next instance for load balancing
   */
  getNextInstance(
    algorithm: "round_robin" | "least_connections" = "round_robin",
  ): InstanceInfo | null {
    const healthyInstances = Array.from(this.instances.values()).filter(
      (instance) => instance.healthy && instance.status === "running",
    );

    if (healthyInstances.length === 0) {
      return null;
    }

    switch (algorithm) {
      case "round_robin":
        const instance =
          healthyInstances[this.currentInstanceIndex % healthyInstances.length];
        this.currentInstanceIndex++;
        return instance;

      case "least_connections":
        return healthyInstances.reduce((least, current) =>
          current.connectionCount < least.connectionCount ? current : least,
        );

      default:
        return healthyInstances[0];
    }
  }

  /**
   * Get current scaling metrics
   */
  getScalingMetrics(): ScalingMetrics {
    const runningInstances = Array.from(this.instances.values()).filter(
      (instance) => instance.status === "running",
    );

    const averageCpuUsage =
      runningInstances.length > 0
        ? runningInstances.reduce(
            (sum, instance) => sum + instance.cpuUsage,
            0,
          ) / runningInstances.length
        : 0;

    const averageMemoryUsage =
      runningInstances.length > 0
        ? runningInstances.reduce(
            (sum, instance) => sum + instance.memoryUsage,
            0,
          ) / runningInstances.length
        : 0;

    const totalConnections = runningInstances.reduce(
      (sum, instance) => sum + instance.connectionCount,
      0,
    );

    const targetInstances = this.calculateTargetInstances(
      averageCpuUsage,
      averageMemoryUsage,
    );

    return {
      currentInstances: runningInstances.length,
      targetInstances,
      averageCpuUsage,
      averageMemoryUsage,
      totalConnections,
      lastScalingAction: this.lastScalingAction,
    };
  }

  /**
   * Manually trigger scaling decision
   */
  async triggerScaling(): Promise<{
    action: "scale_up" | "scale_down" | "no_action";
    reason: string;
    targetInstances: number;
  }> {
    const metrics = this.getScalingMetrics();

    if (this.scalingCooldown) {
      return {
        action: "no_action",
        reason: "Scaling is in cooldown period",
        targetInstances: metrics.currentInstances,
      };
    }

    // Determine scaling action
    if (
      metrics.currentInstances < metrics.targetInstances &&
      metrics.currentInstances < this.config.maxInstances
    ) {
      await this.scaleUp(metrics.targetInstances - metrics.currentInstances);
      return {
        action: "scale_up",
        reason: `CPU: ${metrics.averageCpuUsage.toFixed(1)}%, Memory: ${metrics.averageMemoryUsage.toFixed(1)}%`,
        targetInstances: metrics.targetInstances,
      };
    }

    if (
      metrics.currentInstances > metrics.targetInstances &&
      metrics.currentInstances > this.config.minInstances
    ) {
      await this.scaleDown(metrics.currentInstances - metrics.targetInstances);
      return {
        action: "scale_down",
        reason: `CPU: ${metrics.averageCpuUsage.toFixed(1)}%, Memory: ${metrics.averageMemoryUsage.toFixed(1)}%`,
        targetInstances: metrics.targetInstances,
      };
    }

    return {
      action: "no_action",
      reason: "Current instance count is optimal",
      targetInstances: metrics.currentInstances,
    };
  }

  /**
   * Get all instance information
   */
  getAllInstances(): InstanceInfo[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get healthy instances only
   */
  getHealthyInstances(): InstanceInfo[] {
    return Array.from(this.instances.values()).filter(
      (instance) => instance.healthy && instance.status === "running",
    );
  }

  /**
   * Check if the service can handle the current load
   */
  canHandleLoad(
    expectedConnections: number,
    expectedThroughput: number,
  ): {
    canHandle: boolean;
    recommendedInstances: number;
    currentCapacity: number;
  } {
    const healthyInstances = this.getHealthyInstances();
    const currentCapacity = healthyInstances.length * 1000; // Assume 1000 connections per instance

    const recommendedInstances = Math.ceil(expectedConnections / 1000);
    const canHandle = currentCapacity >= expectedConnections;

    return {
      canHandle,
      recommendedInstances: Math.max(
        recommendedInstances,
        this.config.minInstances,
      ),
      currentCapacity,
    };
  }

  /**
   * Prepare for expected load
   */
  async prepareForLoad(
    expectedConnections: number,
    expectedThroughput: number,
  ): Promise<void> {
    const loadAnalysis = this.canHandleLoad(
      expectedConnections,
      expectedThroughput,
    );

    if (!loadAnalysis.canHandle) {
      const instancesToAdd =
        loadAnalysis.recommendedInstances - this.getHealthyInstances().length;

      if (instancesToAdd > 0) {
        await this.scaleUp(instancesToAdd);

        this.emit("load_preparation", {
          expectedConnections,
          expectedThroughput,
          instancesToAdd,
          timestamp: new Date(),
        });
      }
    }
  }

  private calculateTargetInstances(
    avgCpuUsage: number,
    avgMemoryUsage: number,
  ): number {
    // Calculate target instances based on CPU and memory usage
    const cpuBasedInstances = Math.ceil(
      avgCpuUsage / this.config.targetCpuUtilization,
    );
    const memoryBasedInstances = Math.ceil(
      avgMemoryUsage / this.config.targetMemoryUtilization,
    );

    // Use the higher of the two calculations
    const targetInstances = Math.max(cpuBasedInstances, memoryBasedInstances);

    // Ensure within min/max bounds
    return Math.max(
      this.config.minInstances,
      Math.min(targetInstances, this.config.maxInstances),
    );
  }

  private async scaleUp(instanceCount: number): Promise<void> {
    console.log(`Scaling up by ${instanceCount} instances`);

    // In a real implementation, this would trigger container orchestration
    // For now, we'll simulate the scaling action
    for (let i = 0; i < instanceCount; i++) {
      const instanceId = `instance-${Date.now()}-${i}`;
      this.registerInstance(instanceId);

      // Simulate instance startup
      setTimeout(() => {
        this.updateInstanceMetrics(instanceId, {
          cpuUsage: 20,
          memoryUsage: 30,
          connectionCount: 0,
          healthy: true,
        });
      }, 5000); // 5 second startup time
    }

    this.lastScalingAction = new Date();
    this.startCooldownPeriod();

    this.emit("scale_up", {
      instanceCount,
      totalInstances: this.instances.size,
      timestamp: new Date(),
    });
  }

  private async scaleDown(instanceCount: number): Promise<void> {
    console.log(`Scaling down by ${instanceCount} instances`);

    // Select instances to remove (prefer least loaded instances)
    const instancesToRemove = Array.from(this.instances.values())
      .filter((instance) => instance.healthy && instance.status === "running")
      .sort((a, b) => a.connectionCount - b.connectionCount)
      .slice(0, instanceCount);

    for (const instance of instancesToRemove) {
      // Gracefully drain connections before removing
      instance.status = "stopping";

      // In a real implementation, this would gracefully stop the instance
      setTimeout(() => {
        this.removeInstance(instance.id);
      }, 30000); // 30 second drain time
    }

    this.lastScalingAction = new Date();
    this.startCooldownPeriod();

    this.emit("scale_down", {
      instanceCount,
      totalInstances: this.instances.size,
      timestamp: new Date(),
    });
  }

  private startCooldownPeriod(): void {
    this.scalingCooldown = true;

    setTimeout(() => {
      this.scalingCooldown = false;
      this.emit("cooldown_ended", {
        timestamp: new Date(),
      });
    }, this.config.cooldownPeriod);
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        const scalingDecision = await this.triggerScaling();

        if (scalingDecision.action !== "no_action") {
          console.log(
            `Scaling decision: ${scalingDecision.action} - ${scalingDecision.reason}`,
          );
        }
      } catch (error) {
        console.error("Scaling monitoring failed:", error);
      }
    }, 60000); // Check every minute
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      const now = new Date();
      const healthCheckTimeout = 60000; // 1 minute

      for (const [instanceId, instance] of this.instances.entries()) {
        const timeSinceLastCheck =
          now.getTime() - instance.lastHealthCheck.getTime();

        if (timeSinceLastCheck > healthCheckTimeout && instance.healthy) {
          console.warn(`Instance ${instanceId} failed health check`);
          instance.healthy = false;
          instance.status = "stopping";

          this.emit("instance_unhealthy", {
            instanceId,
            timeSinceLastCheck,
            timestamp: now,
          });
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get load balancing statistics
   */
  getLoadBalancingStats(): {
    totalRequests: number;
    requestsPerInstance: Record<string, number>;
    averageResponseTime: number;
    errorRate: number;
  } {
    // This would be implemented with actual load balancing metrics
    return {
      totalRequests: 0,
      requestsPerInstance: {},
      averageResponseTime: 0,
      errorRate: 0,
    };
  }

  /**
   * Update scaling configuration
   */
  updateConfig(newConfig: Partial<ScalingConfig>): void {
    this.config = { ...this.config, ...newConfig };

    this.emit("config_updated", {
      config: this.config,
      timestamp: new Date(),
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.removeAllListeners();
  }
}

/**
 * Stateless session manager for horizontal scaling
 */
export class StatelessSessionManager {
  private sessionStore = new Map<string, any>();
  private sessionTimeout = 30 * 60 * 1000; // 30 minutes

  /**
   * Store session data (should be moved to Redis in production)
   */
  setSession(sessionId: string, data: any): void {
    this.sessionStore.set(sessionId, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieve session data
   */
  getSession(sessionId: string): any | null {
    const session = this.sessionStore.get(sessionId);

    if (!session) return null;

    // Check if session has expired
    if (Date.now() - session.timestamp > this.sessionTimeout) {
      this.sessionStore.delete(sessionId);
      return null;
    }

    return session.data;
  }

  /**
   * Remove session data
   */
  removeSession(sessionId: string): void {
    this.sessionStore.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessionStore.entries()) {
      if (now - session.timestamp > this.sessionTimeout) {
        this.sessionStore.delete(sessionId);
      }
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  } {
    const now = Date.now();
    let activeSessions = 0;
    let expiredSessions = 0;

    for (const session of this.sessionStore.values()) {
      if (now - session.timestamp > this.sessionTimeout) {
        expiredSessions++;
      } else {
        activeSessions++;
      }
    }

    return {
      totalSessions: this.sessionStore.size,
      activeSessions,
      expiredSessions,
    };
  }
}

// Global horizontal scaling service instance
export const horizontalScalingService = new HorizontalScalingService();

// Global stateless session manager instance
export const statelessSessionManager = new StatelessSessionManager();
