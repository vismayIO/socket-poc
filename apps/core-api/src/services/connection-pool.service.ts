import { Pool, PoolClient, PoolConfig } from "pg";
import { EventEmitter } from "events";

export interface ConnectionPoolStats {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  maxConnections: number;
  connectionTimeouts: number;
  connectionErrors: number;
}

export interface ConnectionPoolConfig extends PoolConfig {
  // Additional configuration options
  healthCheckInterval?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
  maxRetries?: number;
}

export class ConnectionPoolService extends EventEmitter {
  private pool: Pool;
  private stats: ConnectionPoolStats = {
    totalConnections: 0,
    idleConnections: 0,
    waitingClients: 0,
    maxConnections: 0,
    connectionTimeouts: 0,
    connectionErrors: 0,
  };
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: ConnectionPoolConfig) {
    super();

    const poolConfig: PoolConfig = {
      // Default optimized settings for high-frequency trading
      max: 20, // Maximum number of connections
      min: 5, // Minimum number of connections
      idleTimeoutMillis: 30000, // 30 seconds
      connectionTimeoutMillis: 5000, // 5 seconds
      acquireTimeoutMillis: 10000, // 10 seconds
      ...config,
    };

    this.pool = new Pool(poolConfig);
    this.stats.maxConnections = poolConfig.max || 10;

    this.setupEventListeners();
    this.startHealthCheck(config.healthCheckInterval || 30000);
  }

  /**
   * Execute a query with automatic connection management
   */
  async query<T = any>(
    text: string,
    params?: any[],
  ): Promise<{ rows: T[]; rowCount: number }> {
    const startTime = Date.now();
    let client: PoolClient | undefined;

    try {
      client = await this.pool.connect();
      const result = await client.query(text, params);

      this.emit("query_executed", {
        duration: Date.now() - startTime,
        rowCount: result.rowCount,
        success: true,
      });

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      this.stats.connectionErrors++;
      this.emit("query_error", {
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");

      this.emit("transaction_completed", {
        success: true,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      this.stats.connectionErrors++;

      this.emit("transaction_failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      });

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a batch of queries efficiently
   */
  async batchQuery<T = any>(
    queries: Array<{ text: string; params?: any[] }>,
  ): Promise<Array<{ rows: T[]; rowCount: number }>> {
    return this.transaction(async (client) => {
      const results = [];

      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push({
          rows: result.rows,
          rowCount: result.rowCount || 0,
        });
      }

      return results;
    });
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionPoolStats {
    return {
      ...this.stats,
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
    };
  }

  /**
   * Get detailed pool information
   */
  getPoolInfo(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    maxConnections: number;
    options: any;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      maxConnections: this.stats.maxConnections,
      options: this.pool.options,
    };
  }

  /**
   * Perform health check on the connection pool
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    message: string;
    stats: ConnectionPoolStats;
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      await this.query("SELECT 1 as health_check");
      const responseTime = Date.now() - startTime;
      const stats = this.getStats();

      const healthy = responseTime < 1000 && stats.connectionErrors < 10;

      return {
        healthy,
        message: healthy
          ? "Connection pool is healthy"
          : "Connection pool performance degraded",
        stats,
        responseTime,
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Connection pool health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        stats: this.getStats(),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Optimize pool settings based on current load
   */
  async optimizePool(): Promise<void> {
    const stats = this.getStats();
    const poolInfo = this.getPoolInfo();

    // If we're consistently at max capacity, consider scaling
    if (
      stats.waitingClients > 0 &&
      stats.totalConnections >= stats.maxConnections
    ) {
      this.emit("pool_at_capacity", {
        stats,
        recommendation: "Consider increasing max connections",
        timestamp: new Date(),
      });
    }

    // If we have too many idle connections, consider reducing
    if (stats.idleConnections > stats.maxConnections * 0.7) {
      this.emit("pool_over_provisioned", {
        stats,
        recommendation: "Consider reducing max connections",
        timestamp: new Date(),
      });
    }
  }

  /**
   * Drain the pool and close all connections
   */
  async drain(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    await this.pool.end();
    this.emit("pool_drained", {
      timestamp: new Date(),
    });
  }

  private setupEventListeners(): void {
    this.pool.on("connect", (client) => {
      this.emit("connection_created", {
        totalConnections: this.pool.totalCount,
        timestamp: new Date(),
      });
    });

    this.pool.on("acquire", (client) => {
      this.emit("connection_acquired", {
        idleConnections: this.pool.idleCount,
        timestamp: new Date(),
      });
    });

    this.pool.on("release", (client) => {
      this.emit("connection_released", {
        idleConnections: this.pool.idleCount,
        timestamp: new Date(),
      });
    });

    this.pool.on("remove", (client) => {
      this.emit("connection_removed", {
        totalConnections: this.pool.totalCount,
        timestamp: new Date(),
      });
    });

    this.pool.on("error", (error, client) => {
      this.stats.connectionErrors++;
      this.emit("connection_error", {
        error: error.message,
        totalErrors: this.stats.connectionErrors,
        timestamp: new Date(),
      });
    });
  }

  private startHealthCheck(interval: number): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
        await this.optimizePool();
      } catch (error) {
        console.error("Connection pool health check failed:", error);
      }
    }, interval);
  }
}

/**
 * High-performance database service with optimized connection pooling
 */
export class OptimizedDatabaseService {
  private connectionPool: ConnectionPoolService;

  constructor(config: ConnectionPoolConfig) {
    this.connectionPool = new ConnectionPoolService({
      // Optimized settings for high-frequency trading
      max: 25, // Higher connection limit
      min: 10, // Higher minimum connections
      idleTimeoutMillis: 60000, // 1 minute
      connectionTimeoutMillis: 3000, // 3 seconds
      acquireTimeoutMillis: 5000, // 5 seconds
      statement_timeout: 30000, // 30 seconds
      query_timeout: 15000, // 15 seconds
      ...config,
    });

    this.setupOptimizations();
  }

  /**
   * Execute optimized bulk insert for high-frequency data
   */
  async bulkInsert(
    tableName: string,
    columns: string[],
    data: any[][],
    batchSize: number = 1000,
  ): Promise<number> {
    let totalInserted = 0;

    // Process data in batches to avoid memory issues
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);

      // Build optimized INSERT query with multiple VALUES
      const placeholders = batch
        .map((_, index) => {
          const rowPlaceholders = columns
            .map((_, colIndex) => `$${index * columns.length + colIndex + 1}`)
            .join(", ");
          return `(${rowPlaceholders})`;
        })
        .join(", ");

      const query = `
        INSERT INTO ${tableName} (${columns.join(", ")})
        VALUES ${placeholders}
        ON CONFLICT DO NOTHING
      `;

      const flatParams = batch.flat();

      try {
        const result = await this.connectionPool.query(query, flatParams);
        totalInserted += result.rowCount;
      } catch (error) {
        console.error(`Bulk insert batch failed for ${tableName}:`, error);
        throw error;
      }
    }

    return totalInserted;
  }

  /**
   * Execute optimized queries with prepared statements
   */
  async executeOptimizedQuery<T = any>(
    queryName: string,
    query: string,
    params?: any[],
  ): Promise<{ rows: T[]; rowCount: number }> {
    // Add query hints for PostgreSQL optimization
    const optimizedQuery = this.addQueryHints(query);

    return this.connectionPool.query(optimizedQuery, params);
  }

  /**
   * Execute read-only queries with optimizations
   */
  async executeReadQuery<T = any>(
    query: string,
    params?: any[],
  ): Promise<{ rows: T[]; rowCount: number }> {
    // Add read-only optimizations
    const optimizedQuery = `
      SET LOCAL statement_timeout = '10s';
      SET LOCAL lock_timeout = '5s';
      ${query}
    `;

    return this.connectionPool.query(optimizedQuery, params);
  }

  /**
   * Get database performance statistics
   */
  async getPerformanceStats(): Promise<{
    connectionPool: ConnectionPoolStats;
    queryStats: any;
    indexUsage: any;
    tableStats: any;
  }> {
    const connectionPool = this.connectionPool.getStats();

    // Get query performance statistics
    const queryStatsResult = await this.connectionPool.query(`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements 
      ORDER BY total_time DESC 
      LIMIT 10
    `);

    // Get index usage statistics
    const indexUsageResult = await this.connectionPool.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes 
      ORDER BY idx_scan DESC 
      LIMIT 10
    `);

    // Get table statistics
    const tableStatsResult = await this.connectionPool.query(`
      SELECT 
        schemaname,
        tablename,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch,
        n_tup_ins,
        n_tup_upd,
        n_tup_del
      FROM pg_stat_user_tables 
      ORDER BY seq_scan + idx_scan DESC 
      LIMIT 10
    `);

    return {
      connectionPool,
      queryStats: queryStatsResult.rows,
      indexUsage: indexUsageResult.rows,
      tableStats: tableStatsResult.rows,
    };
  }

  /**
   * Optimize database settings for high-frequency operations
   */
  async optimizeDatabase(): Promise<void> {
    const optimizationQueries = [
      // Increase work memory for complex queries
      "SET work_mem = '256MB'",

      // Optimize for high-frequency inserts
      "SET synchronous_commit = 'off'",

      // Increase shared buffers (should be done at server level)
      // "SET shared_buffers = '1GB'",

      // Optimize checkpoint settings
      "SET checkpoint_completion_target = 0.9",

      // Increase WAL buffers
      "SET wal_buffers = '16MB'",

      // Optimize random page cost for SSD
      "SET random_page_cost = 1.1",
    ];

    for (const query of optimizationQueries) {
      try {
        await this.connectionPool.query(query);
      } catch (error) {
        console.warn(`Database optimization query failed: ${query}`, error);
      }
    }
  }

  /**
   * Create optimized indexes for high-frequency queries
   */
  async createOptimizedIndexes(): Promise<void> {
    const indexQueries = [
      // Optimized index for stock trades with timestamp
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_trade_symbol_timestamp 
       ON stock_trade (symbol, timestamp DESC) 
       WHERE timestamp > NOW() - INTERVAL '24 hours'`,

      // Partial index for recent OHLCV data
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ohlcv_symbol_interval_timestamp 
       ON ohlcv_data (symbol, interval_type, timestamp DESC) 
       WHERE timestamp > NOW() - INTERVAL '7 days'`,

      // Index for order book snapshots
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orderbook_symbol_side_timestamp 
       ON order_book_snapshot (symbol, side, timestamp DESC) 
       WHERE timestamp > NOW() - INTERVAL '1 hour'`,

      // Covering index for symbol configuration
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_symbol_config_active 
       ON symbol_config (symbol) 
       INCLUDE (base_price, volatility, is_active) 
       WHERE is_active = true`,
    ];

    for (const query of indexQueries) {
      try {
        await this.connectionPool.query(query);
        console.log("Created optimized index");
      } catch (error) {
        console.warn("Index creation failed (may already exist):", error);
      }
    }
  }

  private addQueryHints(query: string): string {
    // Add PostgreSQL-specific query hints for optimization
    if (query.toLowerCase().includes("select")) {
      // Add hints for SELECT queries
      return `/*+ SeqScan(false) */ ${query}`;
    }

    return query;
  }

  private setupOptimizations(): void {
    // Set up connection pool event listeners for optimization
    this.connectionPool.on("pool_at_capacity", (event) => {
      console.warn("Database connection pool at capacity:", event);
    });

    this.connectionPool.on("connection_error", (event) => {
      console.error("Database connection error:", event);
    });

    // Perform initial optimizations
    setTimeout(async () => {
      try {
        await this.optimizeDatabase();
        await this.createOptimizedIndexes();
        console.log("Database optimizations applied");
      } catch (error) {
        console.error("Failed to apply database optimizations:", error);
      }
    }, 5000); // Wait 5 seconds after startup
  }

  /**
   * Get connection pool service
   */
  getConnectionPool(): ConnectionPoolService {
    return this.connectionPool;
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.connectionPool.drain();
  }
}

// Global optimized database service instance
export const optimizedDatabaseService = new OptimizedDatabaseService({
  host: process.env.DATABASE_HOST || "localhost",
  port: parseInt(process.env.DATABASE_PORT || "5432"),
  database: process.env.DATABASE_NAME || "trading_db",
  user: process.env.DATABASE_USER || "postgres",
  password: process.env.DATABASE_PASSWORD || "password",
});
