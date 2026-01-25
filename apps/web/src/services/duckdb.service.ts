import * as duckdb from "@duckdb/duckdb-wasm";

export interface TradeData {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
  timestamp: Date;
  orderId?: string;
  tradeType?: string;
  executionVenue?: string;
}

export interface OrderBookData {
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  orderCount: number;
  timestamp: Date;
}

export interface OHLCVData {
  symbol: string;
  intervalType: string;
  timestamp: Date;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
  tradeCount: number;
}

export interface DataStats {
  totalTrades: number;
  symbolCount: number;
  dataRangeStart: Date | null;
  dataRangeEnd: Date | null;
  memoryUsage: number;
}

export interface DuckDBConfig {
  retentionHours: number;
  maxMemoryMB: number;
}

class DuckDBService {
  private db: duckdb.AsyncDuckDB | null = null;
  private connection: duckdb.AsyncDuckDBConnection | null = null;
  private config: DuckDBConfig;
  private isInitialized = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: DuckDBConfig = { retentionHours: 24, maxMemoryMB: 512 }) {
    this.config = config;
  }

  async initializeDatabase(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log("🦆 Initializing DuckDB WASM...");

      // Initialize DuckDB WASM
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const worker = await duckdb.createWorker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger();

      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      this.connection = await this.db.connect();

      // Configure memory limit
      await this.connection.query(
        `SET memory_limit='${this.config.maxMemoryMB}MB'`,
      );

      // Create tables with optimized schema
      await this.createTables();

      // Set up automatic cleanup
      this.setupCleanupInterval();

      this.isInitialized = true;
      console.log("✅ DuckDB WASM initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize DuckDB WASM:", error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.connection) {
      throw new Error("Database not initialized");
    }

    // Create trades table with optimized schema
    await this.connection.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id VARCHAR PRIMARY KEY,
        symbol VARCHAR NOT NULL,
        price DECIMAL(10,4) NOT NULL,
        quantity INTEGER NOT NULL,
        side VARCHAR(4) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        order_id VARCHAR,
        trade_type VARCHAR,
        execution_venue VARCHAR
      )
    `);

    // Create order book table
    await this.connection.query(`
      CREATE TABLE IF NOT EXISTS order_book (
        symbol VARCHAR NOT NULL,
        side VARCHAR(4) NOT NULL,
        price DECIMAL(10,4) NOT NULL,
        quantity INTEGER NOT NULL,
        order_count INTEGER DEFAULT 1,
        timestamp TIMESTAMP NOT NULL
      )
    `);

    // Create OHLCV table
    await this.connection.query(`
      CREATE TABLE IF NOT EXISTS ohlcv (
        symbol VARCHAR NOT NULL,
        interval_type VARCHAR NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        open_price DECIMAL(10,4) NOT NULL,
        high_price DECIMAL(10,4) NOT NULL,
        low_price DECIMAL(10,4) NOT NULL,
        close_price DECIMAL(10,4) NOT NULL,
        volume BIGINT NOT NULL,
        trade_count INTEGER DEFAULT 0,
        PRIMARY KEY (symbol, interval_type, timestamp)
      )
    `);

    // Create indexes for performance
    await this.connection.query(
      `CREATE INDEX IF NOT EXISTS idx_trades_symbol_timestamp ON trades(symbol, timestamp)`,
    );
    await this.connection.query(
      `CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)`,
    );
    await this.connection.query(
      `CREATE INDEX IF NOT EXISTS idx_orderbook_symbol_timestamp ON order_book(symbol, timestamp)`,
    );
    await this.connection.query(
      `CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_interval_timestamp ON ohlcv(symbol, interval_type, timestamp)`,
    );

    console.log("📊 Database tables created successfully");
  }

  async ingestTradeData(trades: TradeData[]): Promise<void> {
    if (!this.connection || !this.isInitialized) {
      throw new Error("Database not initialized");
    }

    if (trades.length === 0) {
      return;
    }

    try {
      // Prepare batch insert
      const values = trades
        .map(
          (trade) =>
            `('${trade.id}', '${trade.symbol}', ${trade.price}, ${trade.quantity}, '${trade.side}', '${trade.timestamp.toISOString()}', ${trade.orderId ? `'${trade.orderId}'` : "NULL"}, ${trade.tradeType ? `'${trade.tradeType}'` : "NULL"}, ${trade.executionVenue ? `'${trade.executionVenue}'` : "NULL"})`,
        )
        .join(",");

      await this.connection.query(`
        INSERT OR REPLACE INTO trades (id, symbol, price, quantity, side, timestamp, order_id, trade_type, execution_venue)
        VALUES ${values}
      `);

      console.log(`📈 Ingested ${trades.length} trades`);
    } catch (error) {
      console.error("❌ Failed to ingest trade data:", error);
      throw error;
    }
  }

  async ingestOrderBookData(orderBookData: OrderBookData[]): Promise<void> {
    if (!this.connection || !this.isInitialized) {
      throw new Error("Database not initialized");
    }

    if (orderBookData.length === 0) {
      return;
    }

    try {
      // Clear existing order book data for the symbols and timestamp
      const symbols = [...new Set(orderBookData.map((ob) => ob.symbol))];
      const symbolList = symbols.map((s) => `'${s}'`).join(",");

      await this.connection.query(`
        DELETE FROM order_book 
        WHERE symbol IN (${symbolList}) 
        AND timestamp >= '${new Date(Date.now() - 5000).toISOString()}'
      `);

      // Insert new order book data
      const values = orderBookData
        .map(
          (ob) =>
            `('${ob.symbol}', '${ob.side}', ${ob.price}, ${ob.quantity}, ${ob.orderCount}, '${ob.timestamp.toISOString()}')`,
        )
        .join(",");

      await this.connection.query(`
        INSERT INTO order_book (symbol, side, price, quantity, order_count, timestamp)
        VALUES ${values}
      `);

      console.log(`📊 Ingested ${orderBookData.length} order book entries`);
    } catch (error) {
      console.error("❌ Failed to ingest order book data:", error);
      throw error;
    }
  }

  async ingestOHLCVData(ohlcvData: OHLCVData[]): Promise<void> {
    if (!this.connection || !this.isInitialized) {
      throw new Error("Database not initialized");
    }

    if (ohlcvData.length === 0) {
      return;
    }

    try {
      const values = ohlcvData
        .map(
          (ohlcv) =>
            `('${ohlcv.symbol}', '${ohlcv.intervalType}', '${ohlcv.timestamp.toISOString()}', ${ohlcv.openPrice}, ${ohlcv.highPrice}, ${ohlcv.lowPrice}, ${ohlcv.closePrice}, ${ohlcv.volume}, ${ohlcv.tradeCount})`,
        )
        .join(",");

      await this.connection.query(`
        INSERT OR REPLACE INTO ohlcv (symbol, interval_type, timestamp, open_price, high_price, low_price, close_price, volume, trade_count)
        VALUES ${values}
      `);

      console.log(`📊 Ingested ${ohlcvData.length} OHLCV records`);
    } catch (error) {
      console.error("❌ Failed to ingest OHLCV data:", error);
      throw error;
    }
  }

  async getDataStats(): Promise<DataStats> {
    if (!this.connection || !this.isInitialized) {
      throw new Error("Database not initialized");
    }

    try {
      const result = await this.connection.query(`
        SELECT 
          COUNT(*) as total_trades,
          COUNT(DISTINCT symbol) as symbol_count,
          MIN(timestamp) as data_range_start,
          MAX(timestamp) as data_range_end
        FROM trades
      `);

      const row = result.toArray()[0];

      return {
        totalTrades: Number(row.total_trades) || 0,
        symbolCount: Number(row.symbol_count) || 0,
        dataRangeStart: row.data_range_start
          ? new Date(row.data_range_start)
          : null,
        dataRangeEnd: row.data_range_end ? new Date(row.data_range_end) : null,
        memoryUsage: 0, // TODO: Implement memory usage calculation
      };
    } catch (error) {
      console.error("❌ Failed to get data stats:", error);
      throw error;
    }
  }

  async clearOldData(
    retentionHours: number = this.config.retentionHours,
  ): Promise<void> {
    if (!this.connection || !this.isInitialized) {
      return;
    }

    try {
      const cutoffTime = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

      // Clear old trades
      const tradesResult = await this.connection.query(`
        DELETE FROM trades WHERE timestamp < '${cutoffTime.toISOString()}'
      `);

      // Clear old order book data
      const orderBookResult = await this.connection.query(`
        DELETE FROM order_book WHERE timestamp < '${cutoffTime.toISOString()}'
      `);

      // Clear old OHLCV data (keep longer retention for aggregated data)
      const ohlcvCutoff = new Date(
        Date.now() - retentionHours * 2 * 60 * 60 * 1000,
      );
      const ohlcvResult = await this.connection.query(`
        DELETE FROM ohlcv WHERE timestamp < '${ohlcvCutoff.toISOString()}'
      `);

      console.log(
        `🧹 Cleaned up old data: ${tradesResult.numRows} trades, ${orderBookResult.numRows} order book entries, ${ohlcvResult.numRows} OHLCV records`,
      );
    } catch (error) {
      console.error("❌ Failed to clear old data:", error);
    }
  }

  private setupCleanupInterval(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(
      () => {
        this.clearOldData();
      },
      60 * 60 * 1000,
    );
  }

  async executeQuery(sql: string): Promise<unknown[]> {
    if (!this.connection || !this.isInitialized) {
      throw new Error("Database not initialized");
    }

    try {
      const result = await this.connection.query(sql);
      return result.toArray();
    } catch (error) {
      console.error("❌ Failed to execute query:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }

    this.isInitialized = false;
    console.log("🦆 DuckDB WASM closed");
  }

  isReady(): boolean {
    return this.isInitialized && this.connection !== null;
  }
}

// Export singleton instance
export const duckDBService = new DuckDBService();
export default duckDBService;
