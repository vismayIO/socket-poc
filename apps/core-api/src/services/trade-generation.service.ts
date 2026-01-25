import { prisma } from "../../lib/prisma";
import { SymbolConfigService, SymbolConfigData } from "./symbol-config.service";
import {
  MarketSimulationService,
  TradeEvent,
  OrderBookState,
} from "./market-simulation.service";
import {
  TradeGenerationMetrics,
  DatabaseMetrics,
} from "../middleware/metrics.middleware";
import { resilienceService } from "./retry.service";

export interface OHLCVData {
  symbol: string;
  intervalType: string;
  timestamp: Date;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: bigint;
  tradeCount: number;
}

export interface GenerationStatus {
  isRunning: boolean;
  activeSymbols: string[];
  tradesPerMinute: number;
  totalTradesGenerated: number;
  startTime?: Date;
  lastTradeTime?: Date;
}

export class TradeGenerationService {
  private symbolConfigService: SymbolConfigService;
  private marketSimulationService: MarketSimulationService;
  private generationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private ohlcvIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  private activeSymbols: Set<string> = new Set();
  private totalTradesGenerated: number = 0;
  private startTime?: Date;
  private lastTradeTime?: Date;

  // OHLCV aggregation data
  private ohlcvBuffers: Map<string, Map<string, OHLCVBuffer>> = new Map();

  constructor() {
    this.symbolConfigService = new SymbolConfigService();
    this.marketSimulationService = new MarketSimulationService();
  }

  /**
   * Start high-frequency trade generation for specified symbols
   */
  async startGeneration(symbols?: string[]): Promise<void> {
    if (this.isRunning) {
      throw new Error("Trade generation is already running");
    }

    // Initialize symbols if not provided
    if (!symbols || symbols.length === 0) {
      await this.symbolConfigService.initializeSymbols();
      const allSymbols = await this.symbolConfigService.getAllActiveSymbols();
      symbols = allSymbols.map((s) => s.symbol);
    }

    this.isRunning = true;
    this.startTime = new Date();
    this.totalTradesGenerated = 0;

    console.log(`Starting trade generation for ${symbols.length} symbols`);

    // Initialize market states for all symbols
    for (const symbol of symbols) {
      const symbolConfig =
        await this.symbolConfigService.getSymbolConfig(symbol);
      if (symbolConfig) {
        this.marketSimulationService.initializeMarketState(symbolConfig);
        this.activeSymbols.add(symbol);
        await this.startSymbolGeneration(symbol, symbolConfig);
      }
    }

    // Start OHLCV aggregation
    this.startOHLCVAggregation();
  }

  /**
   * Stop trade generation for specified symbols or all symbols
   */
  async stopGeneration(symbols?: string[]): Promise<void> {
    const symbolsToStop = symbols || Array.from(this.activeSymbols);

    for (const symbol of symbolsToStop) {
      const interval = this.generationIntervals.get(symbol);
      if (interval) {
        clearInterval(interval);
        this.generationIntervals.delete(symbol);
      }
      this.activeSymbols.delete(symbol);
    }

    // Stop OHLCV aggregation if no symbols are active
    if (this.activeSymbols.size === 0) {
      this.stopOHLCVAggregation();
      this.isRunning = false;
      console.log("Trade generation stopped");
    }
  }

  /**
   * Get current generation status
   */
  getGenerationStatus(): GenerationStatus {
    const tradesPerMinute = this.calculateTradesPerMinute();

    return {
      isRunning: this.isRunning,
      activeSymbols: Array.from(this.activeSymbols),
      tradesPerMinute,
      totalTradesGenerated: this.totalTradesGenerated,
      startTime: this.startTime,
      lastTradeTime: this.lastTradeTime,
    };
  }

  /**
   * Get current market data for a symbol
   */
  async getMarketData(symbol: string) {
    const marketState = this.marketSimulationService.getMarketState(symbol);
    const orderBook = this.marketSimulationService.getOrderBook(symbol);

    return {
      marketState,
      orderBook,
    };
  }

  /**
   * Start generation for a specific symbol
   */
  private async startSymbolGeneration(
    symbol: string,
    symbolConfig: SymbolConfigData,
  ): Promise<void> {
    // Calculate generation frequency (100-1000 trades per minute)
    const baseFrequency = 100 + Math.random() * 900; // trades per minute
    const intervalMs = (60 * 1000) / baseFrequency; // milliseconds between trades

    console.log(
      `Starting generation for ${symbol} at ${baseFrequency.toFixed(0)} trades/minute`,
    );

    const interval = setInterval(async () => {
      try {
        await this.generateTradeForSymbol(symbol, symbolConfig);
      } catch (error) {
        console.error(`Error generating trade for ${symbol}:`, error);
      }
    }, intervalMs);

    this.generationIntervals.set(symbol, interval);
  }

  /**
   * Generate a single trade for a symbol
   */
  private async generateTradeForSymbol(
    symbol: string,
    symbolConfig: SymbolConfigData,
  ): Promise<void> {
    const generationStartTime = Date.now();

    try {
      // Update market state
      const newPrice = this.marketSimulationService.generatePriceMovement(
        symbol,
        symbolConfig,
      );

      // Update order book
      const orderBook = this.marketSimulationService.updateOrderBook(
        symbol,
        symbolConfig,
      );

      // Generate trade event
      const tradeEvent = this.marketSimulationService.generateTradeEvent(
        symbol,
        symbolConfig,
      );

      // Store trade in database
      await this.storeTrade(tradeEvent);

      // Store order book snapshot (sample every 10th trade to reduce storage)
      if (this.totalTradesGenerated % 10 === 0) {
        await this.storeOrderBookSnapshot(orderBook);
      }

      // Update OHLCV buffers
      this.updateOHLCVBuffers(tradeEvent);

      this.totalTradesGenerated++;
      this.lastTradeTime = new Date();

      // Record metrics
      const processingTime = Date.now() - generationStartTime;
      TradeGenerationMetrics.recordTradeGenerated(symbol, processingTime);
      TradeGenerationMetrics.recordDataGenerationToClientLatency(
        symbol,
        generationStartTime,
      );
    } catch (error) {
      TradeGenerationMetrics.recordGenerationError(
        symbol,
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  }

  /**
   * Store trade in database
   */
  private async storeTrade(tradeEvent: TradeEvent): Promise<void> {
    const startTime = Date.now();

    try {
      await resilienceService.executeDatabaseOperation(async () => {
        return await prisma.stockTrade.create({
          data: {
            symbol: tradeEvent.symbol,
            price: tradeEvent.price,
            quantity: tradeEvent.quantity,
            side: tradeEvent.side,
            timestamp: tradeEvent.timestamp,
            orderId: tradeEvent.orderId,
            tradeType: tradeEvent.tradeType,
            executionVenue: "SIMULATION",
          },
        });
      }, "insert_trade");

      DatabaseMetrics.recordQuery("insert_trade", startTime, true, 1);
    } catch (error) {
      DatabaseMetrics.recordQuery("insert_trade", startTime, false);
      throw error;
    }
  }

  /**
   * Store order book snapshot in database
   */
  private async storeOrderBookSnapshot(
    orderBook: OrderBookState,
  ): Promise<void> {
    const startTime = Date.now();
    const snapshots = [];

    // Store top 5 levels on each side
    for (let i = 0; i < Math.min(5, orderBook.bids.length); i++) {
      const bid = orderBook.bids[i];
      snapshots.push({
        symbol: orderBook.symbol,
        side: "BUY",
        price: bid.price,
        quantity: bid.quantity,
        orderCount: bid.orderCount,
        timestamp: orderBook.lastUpdate,
      });
    }

    for (let i = 0; i < Math.min(5, orderBook.asks.length); i++) {
      const ask = orderBook.asks[i];
      snapshots.push({
        symbol: orderBook.symbol,
        side: "SELL",
        price: ask.price,
        quantity: ask.quantity,
        orderCount: ask.orderCount,
        timestamp: orderBook.lastUpdate,
      });
    }

    try {
      await prisma.orderBookSnapshot.createMany({
        data: snapshots,
      });

      DatabaseMetrics.recordQuery(
        "insert_orderbook",
        startTime,
        true,
        snapshots.length,
      );
    } catch (error) {
      DatabaseMetrics.recordQuery("insert_orderbook", startTime, false);
      throw error;
    }
  }

  /**
   * Update OHLCV buffers with new trade data
   */
  private updateOHLCVBuffers(tradeEvent: TradeEvent): void {
    const symbol = tradeEvent.symbol;
    const timestamp = tradeEvent.timestamp;
    const price = tradeEvent.price;
    const volume = BigInt(tradeEvent.quantity);

    if (!this.ohlcvBuffers.has(symbol)) {
      this.ohlcvBuffers.set(symbol, new Map());
    }

    const symbolBuffers = this.ohlcvBuffers.get(symbol)!;

    // Update buffers for different intervals
    const intervals = [
      { type: "1s", duration: 1000 },
      { type: "1m", duration: 60000 },
      { type: "5m", duration: 300000 },
    ];

    for (const interval of intervals) {
      const intervalKey = this.getIntervalKey(timestamp, interval.duration);
      const bufferKey = `${interval.type}_${intervalKey}`;

      if (!symbolBuffers.has(bufferKey)) {
        symbolBuffers.set(bufferKey, {
          symbol,
          intervalType: interval.type,
          timestamp: new Date(intervalKey),
          openPrice: price,
          highPrice: price,
          lowPrice: price,
          closePrice: price,
          volume: volume,
          tradeCount: 1,
        });
      } else {
        const buffer = symbolBuffers.get(bufferKey)!;
        buffer.highPrice = Math.max(buffer.highPrice, price);
        buffer.lowPrice = Math.min(buffer.lowPrice, price);
        buffer.closePrice = price;
        buffer.volume += volume;
        buffer.tradeCount++;
      }
    }
  }

  /**
   * Start OHLCV aggregation and storage
   */
  private startOHLCVAggregation(): void {
    // Store 1-second OHLCV data every second
    const oneSecondInterval = setInterval(() => {
      this.flushOHLCVBuffers("1s", 1000);
    }, 1000);

    // Store 1-minute OHLCV data every minute
    const oneMinuteInterval = setInterval(() => {
      this.flushOHLCVBuffers("1m", 60000);
    }, 60000);

    // Store 5-minute OHLCV data every 5 minutes
    const fiveMinuteInterval = setInterval(() => {
      this.flushOHLCVBuffers("5m", 300000);
    }, 300000);

    this.ohlcvIntervals.set("1s", oneSecondInterval);
    this.ohlcvIntervals.set("1m", oneMinuteInterval);
    this.ohlcvIntervals.set("5m", fiveMinuteInterval);
  }

  /**
   * Stop OHLCV aggregation
   */
  private stopOHLCVAggregation(): void {
    for (const [intervalType, interval] of this.ohlcvIntervals) {
      clearInterval(interval);
    }
    this.ohlcvIntervals.clear();

    // Flush remaining buffers
    this.flushOHLCVBuffers("1s", 1000);
    this.flushOHLCVBuffers("1m", 60000);
    this.flushOHLCVBuffers("5m", 300000);
  }

  /**
   * Flush OHLCV buffers to database
   */
  private async flushOHLCVBuffers(
    intervalType: string,
    duration: number,
  ): Promise<void> {
    const currentTime = Date.now();
    const cutoffTime = currentTime - duration;

    for (const [symbol, symbolBuffers] of this.ohlcvBuffers) {
      const buffersToFlush: OHLCVBuffer[] = [];
      const keysToDelete: string[] = [];

      for (const [bufferKey, buffer] of symbolBuffers) {
        if (
          buffer.intervalType === intervalType &&
          buffer.timestamp.getTime() <= cutoffTime
        ) {
          buffersToFlush.push(buffer);
          keysToDelete.push(bufferKey);
        }
      }

      // Store completed OHLCV data
      if (buffersToFlush.length > 0) {
        const startTime = Date.now();

        try {
          await resilienceService.executeDatabaseOperation(async () => {
            return await prisma.ohlcvData.createMany({
              data: buffersToFlush.map((buffer) => ({
                symbol: buffer.symbol,
                intervalType: buffer.intervalType,
                timestamp: buffer.timestamp,
                openPrice: buffer.openPrice,
                highPrice: buffer.highPrice,
                lowPrice: buffer.lowPrice,
                closePrice: buffer.closePrice,
                volume: buffer.volume,
                tradeCount: buffer.tradeCount,
              })),
              skipDuplicates: true,
            });
          }, "insert_ohlcv");

          // Remove flushed buffers
          for (const key of keysToDelete) {
            symbolBuffers.delete(key);
          }

          // Record metrics
          const processingTime = Date.now() - startTime;
          TradeGenerationMetrics.recordOHLCVAggregation(
            symbol,
            intervalType,
            buffersToFlush.length,
            processingTime,
          );
          DatabaseMetrics.recordQuery(
            "insert_ohlcv",
            startTime,
            true,
            buffersToFlush.length,
          );
        } catch (error) {
          DatabaseMetrics.recordQuery("insert_ohlcv", startTime, false);
          console.error(`Error storing OHLCV data for ${symbol}:`, error);
        }
      }
    }
  }

  /**
   * Get interval key for OHLCV aggregation
   */
  private getIntervalKey(timestamp: Date, duration: number): number {
    const time = timestamp.getTime();
    return Math.floor(time / duration) * duration;
  }

  /**
   * Calculate current trades per minute
   */
  private calculateTradesPerMinute(): number {
    if (!this.startTime || this.totalTradesGenerated === 0) {
      return 0;
    }

    const elapsedMinutes =
      (Date.now() - this.startTime.getTime()) / (1000 * 60);
    return Math.round(this.totalTradesGenerated / elapsedMinutes);
  }
}

interface OHLCVBuffer {
  symbol: string;
  intervalType: string;
  timestamp: Date;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: bigint;
  tradeCount: number;
}
