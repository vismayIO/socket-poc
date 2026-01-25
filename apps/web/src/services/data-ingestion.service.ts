import { subscribe } from "../lib/nats-client";
import type { NatsConnection } from "nats.ws";
import duckDBService, {
  type TradeData,
  type OrderBookData,
  type OHLCVData,
} from "./duckdb.service";

export interface DataIngestionConfig {
  batchSize: number;
  flushIntervalMs: number;
  enableTradeIngestion: boolean;
  enableOrderBookIngestion: boolean;
  enableOHLCVIngestion: boolean;
}

export interface IngestionStats {
  tradesIngested: number;
  orderBookEntriesIngested: number;
  ohlcvRecordsIngested: number;
  lastIngestedAt: Date | null;
  errors: number;
}

class DataIngestionService {
  private config: DataIngestionConfig;
  private isRunning = false;
  private subscriptions: Array<{ unsubscribe: () => void }> = [];

  // Batching queues
  private tradeQueue: TradeData[] = [];
  private orderBookQueue: OrderBookData[] = [];
  private ohlcvQueue: OHLCVData[] = [];

  // Flush intervals
  private flushInterval: NodeJS.Timeout | null = null;

  // Stats
  private stats: IngestionStats = {
    tradesIngested: 0,
    orderBookEntriesIngested: 0,
    ohlcvRecordsIngested: 0,
    lastIngestedAt: null,
    errors: 0,
  };

  constructor(
    config: DataIngestionConfig = {
      batchSize: 100,
      flushIntervalMs: 1000,
      enableTradeIngestion: true,
      enableOrderBookIngestion: true,
      enableOHLCVIngestion: true,
    },
  ) {
    this.config = config;
  }

  async startIngestion(_natsConnection: NatsConnection): Promise<void> {
    if (this.isRunning) {
      console.log("⚠️ Data ingestion already running");
      return;
    }

    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    console.log("🚀 Starting data ingestion service...");
    this.isRunning = true;

    try {
      // Subscribe to trade data
      if (this.config.enableTradeIngestion) {
        const tradeSub = subscribe("market.trades.*", (data, subject) => {
          this.handleTradeMessage(data, subject);
        });
        this.subscriptions.push(tradeSub);
        console.log("📈 Subscribed to trade data");
      }

      // Subscribe to order book data
      if (this.config.enableOrderBookIngestion) {
        const orderBookSub = subscribe(
          "market.orderbook.*",
          (data, subject) => {
            this.handleOrderBookMessage(data, subject);
          },
        );
        this.subscriptions.push(orderBookSub);
        console.log("📊 Subscribed to order book data");
      }

      // Subscribe to OHLCV data
      if (this.config.enableOHLCVIngestion) {
        const ohlcvSub = subscribe("market.ohlcv.*", (data, subject) => {
          this.handleOHLCVMessage(data, subject);
        });
        this.subscriptions.push(ohlcvSub);
        console.log("📊 Subscribed to OHLCV data");
      }

      // Start periodic flush
      this.startPeriodicFlush();

      console.log("✅ Data ingestion service started");
    } catch (error) {
      console.error("❌ Failed to start data ingestion:", error);
      this.stopIngestion();
      throw error;
    }
  }

  stopIngestion(): void {
    if (!this.isRunning) {
      return;
    }

    console.log("🛑 Stopping data ingestion service...");
    this.isRunning = false;

    // Unsubscribe from all NATS subjects
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = [];

    // Stop periodic flush
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining data
    this.flushAllQueues();

    console.log("✅ Data ingestion service stopped");
  }

  private handleTradeMessage(data: string, _subject: string): void {
    try {
      const tradeData = JSON.parse(data);
      const trade: TradeData = {
        id: tradeData.id || `${Date.now()}-${Math.random()}`,
        symbol: tradeData.symbol,
        price: parseFloat(tradeData.price),
        quantity: parseInt(tradeData.quantity),
        side: tradeData.side,
        timestamp: new Date(tradeData.timestamp),
        orderId: tradeData.orderId,
        tradeType: tradeData.tradeType,
        executionVenue: tradeData.executionVenue,
      };

      this.tradeQueue.push(trade);

      // Flush if batch size reached
      if (this.tradeQueue.length >= this.config.batchSize) {
        this.flushTradeQueue();
      }
    } catch (error) {
      console.error("❌ Failed to process trade message:", error);
      this.stats.errors++;
    }
  }

  private handleOrderBookMessage(data: string, _subject: string): void {
    try {
      const orderBookData = JSON.parse(data);

      // Handle both single order book entry and arrays
      const entries = Array.isArray(orderBookData)
        ? orderBookData
        : [orderBookData];

      entries.forEach((entry) => {
        const orderBook: OrderBookData = {
          symbol: entry.symbol,
          side: entry.side,
          price: parseFloat(entry.price),
          quantity: parseInt(entry.quantity),
          orderCount: parseInt(entry.orderCount) || 1,
          timestamp: new Date(entry.timestamp),
        };

        this.orderBookQueue.push(orderBook);
      });

      // Flush if batch size reached
      if (this.orderBookQueue.length >= this.config.batchSize) {
        this.flushOrderBookQueue();
      }
    } catch (error) {
      console.error("❌ Failed to process order book message:", error);
      this.stats.errors++;
    }
  }

  private handleOHLCVMessage(data: string, _subject: string): void {
    try {
      const ohlcvData = JSON.parse(data);
      const ohlcv: OHLCVData = {
        symbol: ohlcvData.symbol,
        intervalType: ohlcvData.intervalType,
        timestamp: new Date(ohlcvData.timestamp),
        openPrice: parseFloat(ohlcvData.openPrice),
        highPrice: parseFloat(ohlcvData.highPrice),
        lowPrice: parseFloat(ohlcvData.lowPrice),
        closePrice: parseFloat(ohlcvData.closePrice),
        volume: parseInt(ohlcvData.volume),
        tradeCount: parseInt(ohlcvData.tradeCount) || 0,
      };

      this.ohlcvQueue.push(ohlcv);

      // Flush if batch size reached
      if (this.ohlcvQueue.length >= this.config.batchSize) {
        this.flushOHLCVQueue();
      }
    } catch (error) {
      console.error("❌ Failed to process OHLCV message:", error);
      this.stats.errors++;
    }
  }

  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushAllQueues();
    }, this.config.flushIntervalMs);
  }

  private async flushAllQueues(): Promise<void> {
    await Promise.all([
      this.flushTradeQueue(),
      this.flushOrderBookQueue(),
      this.flushOHLCVQueue(),
    ]);
  }

  private async flushTradeQueue(): Promise<void> {
    if (this.tradeQueue.length === 0) {
      return;
    }

    const trades = [...this.tradeQueue];
    this.tradeQueue = [];

    try {
      await duckDBService.ingestTradeData(trades);
      this.stats.tradesIngested += trades.length;
      this.stats.lastIngestedAt = new Date();
    } catch (error) {
      console.error("❌ Failed to flush trade queue:", error);
      this.stats.errors++;
      // Re-queue failed trades (with limit to prevent infinite growth)
      if (this.tradeQueue.length < this.config.batchSize * 2) {
        this.tradeQueue.unshift(...trades);
      }
    }
  }

  private async flushOrderBookQueue(): Promise<void> {
    if (this.orderBookQueue.length === 0) {
      return;
    }

    const orderBook = [...this.orderBookQueue];
    this.orderBookQueue = [];

    try {
      await duckDBService.ingestOrderBookData(orderBook);
      this.stats.orderBookEntriesIngested += orderBook.length;
      this.stats.lastIngestedAt = new Date();
    } catch (error) {
      console.error("❌ Failed to flush order book queue:", error);
      this.stats.errors++;
      // Re-queue failed entries (with limit)
      if (this.orderBookQueue.length < this.config.batchSize * 2) {
        this.orderBookQueue.unshift(...orderBook);
      }
    }
  }

  private async flushOHLCVQueue(): Promise<void> {
    if (this.ohlcvQueue.length === 0) {
      return;
    }

    const ohlcv = [...this.ohlcvQueue];
    this.ohlcvQueue = [];

    try {
      await duckDBService.ingestOHLCVData(ohlcv);
      this.stats.ohlcvRecordsIngested += ohlcv.length;
      this.stats.lastIngestedAt = new Date();
    } catch (error) {
      console.error("❌ Failed to flush OHLCV queue:", error);
      this.stats.errors++;
      // Re-queue failed records (with limit)
      if (this.ohlcvQueue.length < this.config.batchSize * 2) {
        this.ohlcvQueue.unshift(...ohlcv);
      }
    }
  }

  getStats(): IngestionStats {
    return { ...this.stats };
  }

  getQueueSizes(): { trades: number; orderBook: number; ohlcv: number } {
    return {
      trades: this.tradeQueue.length,
      orderBook: this.orderBookQueue.length,
      ohlcv: this.ohlcvQueue.length,
    };
  }

  updateConfig(newConfig: Partial<DataIngestionConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart periodic flush if interval changed
    if (newConfig.flushIntervalMs && this.flushInterval) {
      clearInterval(this.flushInterval);
      this.startPeriodicFlush();
    }
  }

  isIngesting(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const dataIngestionService = new DataIngestionService();
export default dataIngestionService;
