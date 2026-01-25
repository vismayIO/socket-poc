import { SymbolConfigData, VolumeProfile } from "./symbol-config.service";

export interface MarketState {
  symbol: string;
  currentPrice: number;
  bid: number;
  ask: number;
  spread: number;
  volume: number;
  trend: number;
  volatility: number;
  lastUpdate: Date;
  priceHistory: number[];
  volumeHistory: number[];
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderBookState {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midPrice: number;
  lastUpdate: Date;
}

export interface TradeEvent {
  symbol: string;
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
  timestamp: Date;
  orderId: string;
  tradeType: "MARKET" | "LIMIT";
}

export class MarketSimulationService {
  private marketStates: Map<string, MarketState> = new Map();
  private orderBooks: Map<string, OrderBookState> = new Map();
  private random: () => number;
  private marketHours: { start: number; end: number } = { start: 9, end: 16 }; // 9 AM to 4 PM

  constructor(seed?: number) {
    // Use seeded random for reproducible results in testing
    if (seed !== undefined) {
      this.random = this.seededRandom(seed);
    } else {
      this.random = Math.random;
    }
  }

  /**
   * Initialize market state for a symbol
   */
  initializeMarketState(symbolConfig: SymbolConfigData): void {
    const spread = this.calculateInitialSpread(symbolConfig);
    const midPrice = symbolConfig.basePrice;

    const marketState: MarketState = {
      symbol: symbolConfig.symbol,
      currentPrice: midPrice,
      bid: midPrice - spread / 2,
      ask: midPrice + spread / 2,
      spread: spread,
      volume: 0,
      trend: symbolConfig.trendStrength,
      volatility: symbolConfig.volatility,
      lastUpdate: new Date(),
      priceHistory: [midPrice],
      volumeHistory: [0],
    };

    this.marketStates.set(symbolConfig.symbol, marketState);
    this.initializeOrderBook(symbolConfig);
  }

  /**
   * Generate realistic price movement using multiple algorithms
   */
  generatePriceMovement(
    symbol: string,
    symbolConfig: SymbolConfigData,
  ): number {
    const marketState = this.marketStates.get(symbol);
    if (!marketState) {
      throw new Error(`Market state not initialized for symbol: ${symbol}`);
    }

    const currentPrice = marketState.currentPrice;
    const dt = 1 / (252 * 24 * 60 * 60); // 1 second in trading years

    // Combine multiple price movement patterns
    const trendComponent = this.calculateTrendComponent(marketState, dt);
    const meanReversionComponent = this.calculateMeanReversionComponent(
      marketState,
      symbolConfig,
      dt,
    );
    const volatilityComponent = this.calculateVolatilityComponent(
      marketState,
      dt,
    );
    const microstructureComponent =
      this.calculateMicrostructureNoise(marketState);
    const jumpComponent = this.calculateJumpComponent(marketState, dt);

    // Combine all components with weights
    const priceChange =
      trendComponent * 0.3 +
      meanReversionComponent * 0.2 +
      volatilityComponent * 0.4 +
      microstructureComponent * 0.05 +
      jumpComponent * 0.05;

    const newPrice = Math.max(0.01, currentPrice + priceChange);

    // Update market state
    marketState.currentPrice = newPrice;
    marketState.priceHistory.push(newPrice);
    marketState.lastUpdate = new Date();

    // Keep only last 1000 price points for memory efficiency
    if (marketState.priceHistory.length > 1000) {
      marketState.priceHistory = marketState.priceHistory.slice(-1000);
    }

    return newPrice;
  }

  /**
   * Calculate trend component using momentum and drift
   */
  private calculateTrendComponent(
    marketState: MarketState,
    dt: number,
  ): number {
    const trendStrength = marketState.trend;
    const currentPrice = marketState.currentPrice;

    // Add some persistence to trends
    const momentum = this.calculateMomentum(marketState.priceHistory);
    const drift = trendStrength * currentPrice * dt;

    return drift + momentum * 0.1;
  }

  /**
   * Calculate mean reversion component
   */
  private calculateMeanReversionComponent(
    marketState: MarketState,
    symbolConfig: SymbolConfigData,
    dt: number,
  ): number {
    const currentPrice = marketState.currentPrice;
    const basePrice = symbolConfig.basePrice;
    const reversionSpeed = 0.1; // How quickly prices revert to mean

    const deviation = (currentPrice - basePrice) / basePrice;
    const reversionForce = -reversionSpeed * deviation * currentPrice * dt;

    return reversionForce;
  }

  /**
   * Calculate volatility component using geometric Brownian motion
   */
  private calculateVolatilityComponent(
    marketState: MarketState,
    dt: number,
  ): number {
    const volatility = this.getAdjustedVolatility(marketState);
    const currentPrice = marketState.currentPrice;
    const randomShock = this.normalRandom();

    return volatility * currentPrice * Math.sqrt(dt) * randomShock;
  }

  /**
   * Calculate microstructure noise (bid-ask bounce, etc.)
   */
  private calculateMicrostructureNoise(marketState: MarketState): number {
    const spread = marketState.spread;
    const noise = (this.random() - 0.5) * spread * 0.1;
    return noise;
  }

  /**
   * Calculate jump component for rare large price movements
   */
  private calculateJumpComponent(marketState: MarketState, dt: number): number {
    const jumpProbability = 0.001; // 0.1% chance per second
    const currentPrice = marketState.currentPrice;

    if (this.random() < jumpProbability * dt) {
      const jumpSize = this.normalRandom() * 0.02 * currentPrice; // 2% jump
      return jumpSize;
    }

    return 0;
  }

  /**
   * Generate realistic bid-ask spread
   */
  generateBidAskSpread(
    symbol: string,
    symbolConfig: SymbolConfigData,
  ): { bid: number; ask: number; spread: number } {
    const marketState = this.marketStates.get(symbol);
    if (!marketState) {
      throw new Error(`Market state not initialized for symbol: ${symbol}`);
    }

    const currentPrice = marketState.currentPrice;
    const baseSpread = this.calculateDynamicSpread(marketState, symbolConfig);

    // Add some randomness to spread
    const spreadVariation = 1 + (this.random() - 0.5) * 0.2; // ±10% variation
    const actualSpread = baseSpread * spreadVariation;

    const bid = currentPrice - actualSpread / 2;
    const ask = currentPrice + actualSpread / 2;

    // Update market state
    marketState.bid = bid;
    marketState.ask = ask;
    marketState.spread = actualSpread;

    return { bid, ask, spread: actualSpread };
  }

  /**
   * Generate realistic trading volume with intraday patterns
   */
  generateTradingVolume(
    symbol: string,
    symbolConfig: SymbolConfigData,
  ): number {
    const volumeProfile = symbolConfig.volumeProfile;
    const currentHour = new Date().getHours();

    // Base volume adjusted for market cap
    let baseVolume = volumeProfile.baseVolume * volumeProfile.marketCapWeight;

    // Intraday volume pattern
    const intradayMultiplier = this.getIntradayVolumeMultiplier(
      currentHour,
      volumeProfile.peakHours,
    );

    // Volatility increases volume
    const marketState = this.marketStates.get(symbol);
    const volatilityMultiplier = marketState
      ? 1 +
        Math.abs(this.calculateRecentVolatility(marketState)) *
          volumeProfile.volatilityMultiplier
      : 1;

    // Random variation
    const randomMultiplier = 0.5 + this.random() * 1.0; // 50% to 150% of base

    const volume = Math.round(
      (baseVolume *
        intradayMultiplier *
        volatilityMultiplier *
        randomMultiplier) /
        60, // Per minute
    );

    // Update volume history
    if (marketState) {
      marketState.volume = volume;
      marketState.volumeHistory.push(volume);
      if (marketState.volumeHistory.length > 1000) {
        marketState.volumeHistory = marketState.volumeHistory.slice(-1000);
      }
    }

    return Math.max(100, volume); // Minimum 100 shares
  }

  /**
   * Simulate order book with market depth
   */
  updateOrderBook(
    symbol: string,
    symbolConfig: SymbolConfigData,
  ): OrderBookState {
    const marketState = this.marketStates.get(symbol);
    if (!marketState) {
      throw new Error(`Market state not initialized for symbol: ${symbol}`);
    }

    const { bid, ask } = this.generateBidAskSpread(symbol, symbolConfig);
    const tickSize = this.getTickSize(marketState.currentPrice);

    // Generate multiple price levels
    const bidLevels: OrderBookLevel[] = [];
    const askLevels: OrderBookLevel[] = [];

    // Generate 10 levels on each side
    for (let i = 0; i < 10; i++) {
      const bidPrice = bid - i * tickSize;
      const askPrice = ask + i * tickSize;

      // Volume decreases with distance from best price
      const volumeDecay = Math.exp(-i * 0.3);
      const baseQuantity = 1000 + this.random() * 5000;

      bidLevels.push({
        price: Math.max(0.01, bidPrice),
        quantity: Math.round(baseQuantity * volumeDecay),
        orderCount: Math.max(
          1,
          Math.round((1 + this.random() * 5) * volumeDecay),
        ),
      });

      askLevels.push({
        price: askPrice,
        quantity: Math.round(baseQuantity * volumeDecay),
        orderCount: Math.max(
          1,
          Math.round((1 + this.random() * 5) * volumeDecay),
        ),
      });
    }

    const orderBookState: OrderBookState = {
      symbol,
      bids: bidLevels,
      asks: askLevels,
      spread: ask - bid,
      midPrice: (bid + ask) / 2,
      lastUpdate: new Date(),
    };

    this.orderBooks.set(symbol, orderBookState);
    return orderBookState;
  }

  /**
   * Generate individual trade events
   */
  generateTradeEvent(
    symbol: string,
    symbolConfig: SymbolConfigData,
  ): TradeEvent {
    const marketState = this.marketStates.get(symbol);
    if (!marketState) {
      throw new Error(`Market state not initialized for symbol: ${symbol}`);
    }

    const volume = this.generateTradingVolume(symbol, symbolConfig);
    const orderBook = this.orderBooks.get(symbol);

    // Determine trade side (buy vs sell) with slight bias
    const side: "BUY" | "SELL" = this.random() > 0.52 ? "BUY" : "SELL"; // Slight buy bias

    // Determine trade price based on order book and market impact
    let tradePrice: number;
    if (orderBook) {
      if (side === "BUY") {
        tradePrice = orderBook.asks[0]?.price || marketState.ask;
      } else {
        tradePrice = orderBook.bids[0]?.price || marketState.bid;
      }
    } else {
      tradePrice = side === "BUY" ? marketState.ask : marketState.bid;
    }

    // Add market impact for large trades
    const marketImpact = this.calculateMarketImpact(
      volume,
      symbolConfig.volumeProfile.baseVolume,
    );
    if (side === "BUY") {
      tradePrice += marketImpact;
    } else {
      tradePrice -= marketImpact;
    }

    // Generate trade quantity (portion of total volume)
    const tradeQuantity = Math.max(
      100,
      Math.round(volume * (0.1 + this.random() * 0.4)),
    ); // 10-50% of minute volume

    return {
      symbol,
      price: Math.max(0.01, tradePrice),
      quantity: tradeQuantity,
      side,
      timestamp: new Date(),
      orderId: this.generateOrderId(),
      tradeType: this.random() > 0.8 ? "LIMIT" : "MARKET", // 80% market orders
    };
  }

  /**
   * Get current market state for a symbol
   */
  getMarketState(symbol: string): MarketState | undefined {
    return this.marketStates.get(symbol);
  }

  /**
   * Get current order book for a symbol
   */
  getOrderBook(symbol: string): OrderBookState | undefined {
    return this.orderBooks.get(symbol);
  }

  // Private helper methods

  private initializeOrderBook(symbolConfig: SymbolConfigData): void {
    const spread = this.calculateInitialSpread(symbolConfig);
    const midPrice = symbolConfig.basePrice;

    const orderBookState: OrderBookState = {
      symbol: symbolConfig.symbol,
      bids: [
        {
          price: midPrice - spread / 2,
          quantity: 1000,
          orderCount: 1,
        },
      ],
      asks: [
        {
          price: midPrice + spread / 2,
          quantity: 1000,
          orderCount: 1,
        },
      ],
      spread,
      midPrice,
      lastUpdate: new Date(),
    };

    this.orderBooks.set(symbolConfig.symbol, orderBookState);
  }

  private calculateInitialSpread(symbolConfig: SymbolConfigData): number {
    const baseSpread =
      symbolConfig.minSpread +
      (symbolConfig.maxSpread - symbolConfig.minSpread) * this.random();
    return baseSpread;
  }

  private calculateDynamicSpread(
    marketState: MarketState,
    symbolConfig: SymbolConfigData,
  ): number {
    const baseSpread = (symbolConfig.minSpread + symbolConfig.maxSpread) / 2;
    const volatilityAdjustment =
      this.calculateRecentVolatility(marketState) * 2;
    const volumeAdjustment = Math.max(0.5, 2 - marketState.volume / 10000); // Lower volume = wider spread

    return Math.min(
      symbolConfig.maxSpread,
      Math.max(
        symbolConfig.minSpread,
        baseSpread * (1 + volatilityAdjustment) * volumeAdjustment,
      ),
    );
  }

  private getIntradayVolumeMultiplier(
    currentHour: number,
    peakHours: number[],
  ): number {
    if (!this.isMarketHours(currentHour)) {
      return 0.1; // Very low volume outside market hours
    }

    if (peakHours.includes(currentHour)) {
      return 2.0; // Double volume during peak hours
    }

    // Gradual increase towards market open and close
    if (
      currentHour === this.marketHours.start - 1 ||
      currentHour === this.marketHours.end + 1
    ) {
      return 1.5;
    }

    return 1.0; // Normal volume
  }

  private isMarketHours(hour: number): boolean {
    return hour >= this.marketHours.start && hour <= this.marketHours.end;
  }

  private calculateMomentum(priceHistory: number[]): number {
    if (priceHistory.length < 10) return 0;

    const recent = priceHistory.slice(-10);
    const older = priceHistory.slice(-20, -10);

    if (older.length === 0) return 0;

    const recentAvg = recent.reduce((a, b) => a + b) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b) / older.length;

    return (recentAvg - olderAvg) / olderAvg;
  }

  private getAdjustedVolatility(marketState: MarketState): number {
    const baseVolatility = marketState.volatility;
    const recentVolatility = this.calculateRecentVolatility(marketState);

    // Volatility clustering - high volatility tends to be followed by high volatility
    return baseVolatility * (1 + recentVolatility * 0.5);
  }

  private calculateRecentVolatility(marketState: MarketState): number {
    const prices = marketState.priceHistory;
    if (prices.length < 20) return 0;

    const returns = [];
    for (let i = 1; i < Math.min(prices.length, 100); i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance =
      returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) /
      returns.length;

    return Math.sqrt(variance * 252 * 24 * 60 * 60); // Annualized volatility
  }

  private calculateMarketImpact(
    tradeVolume: number,
    baseVolume: number,
  ): number {
    const volumeRatio = tradeVolume / baseVolume;
    const impact = Math.sqrt(volumeRatio) * 0.001; // Square root impact model
    return impact;
  }

  private getTickSize(price: number): number {
    if (price < 1) return 0.0001;
    if (price < 10) return 0.001;
    if (price < 100) return 0.01;
    return 0.01;
  }

  private generateOrderId(): string {
    return `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private normalRandom(): number {
    // Box-Muller transform for normal distribution
    const u1 = this.random();
    const u2 = this.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }
}
