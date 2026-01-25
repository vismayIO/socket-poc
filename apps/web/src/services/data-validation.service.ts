import type { TradeData, OrderBookData, OHLCVData } from "./duckdb.service";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationStats {
  totalValidated: number;
  validRecords: number;
  invalidRecords: number;
  warningRecords: number;
  lastValidatedAt: Date | null;
  errorRate: number;
}

class DataValidationService {
  private stats: ValidationStats = {
    totalValidated: 0,
    validRecords: 0,
    invalidRecords: 0,
    warningRecords: 0,
    lastValidatedAt: null,
    errorRate: 0,
  };

  /**
   * Validate trade data
   */
  validateTradeData(trade: TradeData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!trade.id || typeof trade.id !== "string") {
      errors.push("Trade ID is required and must be a string");
    }

    if (!trade.symbol || typeof trade.symbol !== "string") {
      errors.push("Symbol is required and must be a string");
    } else if (!/^[A-Z]{1,10}$/.test(trade.symbol)) {
      warnings.push(
        "Symbol should be uppercase letters only (1-10 characters)",
      );
    }

    if (typeof trade.price !== "number" || isNaN(trade.price)) {
      errors.push("Price is required and must be a valid number");
    } else if (trade.price <= 0) {
      errors.push("Price must be greater than 0");
    } else if (trade.price > 100000) {
      warnings.push("Price seems unusually high (>$100,000)");
    }

    if (typeof trade.quantity !== "number" || isNaN(trade.quantity)) {
      errors.push("Quantity is required and must be a valid number");
    } else if (trade.quantity <= 0) {
      errors.push("Quantity must be greater than 0");
    } else if (!Number.isInteger(trade.quantity)) {
      warnings.push("Quantity should be an integer");
    }

    if (!trade.side || !["BUY", "SELL"].includes(trade.side)) {
      errors.push('Side is required and must be either "BUY" or "SELL"');
    }

    if (!trade.timestamp || !(trade.timestamp instanceof Date)) {
      errors.push("Timestamp is required and must be a valid Date object");
    } else {
      const now = new Date();
      const timeDiff = Math.abs(now.getTime() - trade.timestamp.getTime());

      // Check if timestamp is too far in the future (more than 1 minute)
      if (trade.timestamp.getTime() > now.getTime() + 60000) {
        warnings.push("Timestamp is in the future");
      }

      // Check if timestamp is too old (more than 24 hours)
      if (timeDiff > 24 * 60 * 60 * 1000) {
        warnings.push("Timestamp is more than 24 hours old");
      }
    }

    // Optional field validation
    if (trade.orderId && typeof trade.orderId !== "string") {
      warnings.push("Order ID should be a string if provided");
    }

    if (trade.tradeType && typeof trade.tradeType !== "string") {
      warnings.push("Trade type should be a string if provided");
    }

    if (trade.executionVenue && typeof trade.executionVenue !== "string") {
      warnings.push("Execution venue should be a string if provided");
    }

    this.updateStats(errors.length === 0, warnings.length > 0);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate order book data
   */
  validateOrderBookData(orderBook: OrderBookData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!orderBook.symbol || typeof orderBook.symbol !== "string") {
      errors.push("Symbol is required and must be a string");
    } else if (!/^[A-Z]{1,10}$/.test(orderBook.symbol)) {
      warnings.push(
        "Symbol should be uppercase letters only (1-10 characters)",
      );
    }

    if (!orderBook.side || !["BUY", "SELL"].includes(orderBook.side)) {
      errors.push('Side is required and must be either "BUY" or "SELL"');
    }

    if (typeof orderBook.price !== "number" || isNaN(orderBook.price)) {
      errors.push("Price is required and must be a valid number");
    } else if (orderBook.price <= 0) {
      errors.push("Price must be greater than 0");
    }

    if (typeof orderBook.quantity !== "number" || isNaN(orderBook.quantity)) {
      errors.push("Quantity is required and must be a valid number");
    } else if (orderBook.quantity <= 0) {
      errors.push("Quantity must be greater than 0");
    }

    if (
      typeof orderBook.orderCount !== "number" ||
      isNaN(orderBook.orderCount)
    ) {
      errors.push("Order count is required and must be a valid number");
    } else if (
      orderBook.orderCount <= 0 ||
      !Number.isInteger(orderBook.orderCount)
    ) {
      errors.push("Order count must be a positive integer");
    }

    if (!orderBook.timestamp || !(orderBook.timestamp instanceof Date)) {
      errors.push("Timestamp is required and must be a valid Date object");
    } else {
      const now = new Date();
      if (orderBook.timestamp.getTime() > now.getTime() + 60000) {
        warnings.push("Timestamp is in the future");
      }
    }

    this.updateStats(errors.length === 0, warnings.length > 0);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate OHLCV data
   */
  validateOHLCVData(ohlcv: OHLCVData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!ohlcv.symbol || typeof ohlcv.symbol !== "string") {
      errors.push("Symbol is required and must be a string");
    }

    if (!ohlcv.intervalType || typeof ohlcv.intervalType !== "string") {
      errors.push("Interval type is required and must be a string");
    } else if (
      !["1s", "1m", "5m", "15m", "1h", "4h", "1d"].includes(ohlcv.intervalType)
    ) {
      warnings.push(
        "Interval type should be one of: 1s, 1m, 5m, 15m, 1h, 4h, 1d",
      );
    }

    if (!ohlcv.timestamp || !(ohlcv.timestamp instanceof Date)) {
      errors.push("Timestamp is required and must be a valid Date object");
    }

    // Validate OHLC prices
    const prices = [
      ohlcv.openPrice,
      ohlcv.highPrice,
      ohlcv.lowPrice,
      ohlcv.closePrice,
    ];
    const priceNames = ["Open", "High", "Low", "Close"];

    prices.forEach((price, index) => {
      if (typeof price !== "number" || isNaN(price)) {
        errors.push(
          `${priceNames[index]} price is required and must be a valid number`,
        );
      } else if (price <= 0) {
        errors.push(`${priceNames[index]} price must be greater than 0`);
      }
    });

    // Validate price relationships (High >= Low, High >= Open/Close, Low <= Open/Close)
    if (prices.every((p) => typeof p === "number" && !isNaN(p))) {
      if (ohlcv.highPrice < ohlcv.lowPrice) {
        errors.push("High price cannot be less than low price");
      }
      if (ohlcv.highPrice < ohlcv.openPrice) {
        errors.push("High price cannot be less than open price");
      }
      if (ohlcv.highPrice < ohlcv.closePrice) {
        errors.push("High price cannot be less than close price");
      }
      if (ohlcv.lowPrice > ohlcv.openPrice) {
        errors.push("Low price cannot be greater than open price");
      }
      if (ohlcv.lowPrice > ohlcv.closePrice) {
        errors.push("Low price cannot be greater than close price");
      }
    }

    if (typeof ohlcv.volume !== "number" || isNaN(ohlcv.volume)) {
      errors.push("Volume is required and must be a valid number");
    } else if (ohlcv.volume < 0) {
      errors.push("Volume cannot be negative");
    } else if (!Number.isInteger(ohlcv.volume)) {
      warnings.push("Volume should be an integer");
    }

    if (typeof ohlcv.tradeCount !== "number" || isNaN(ohlcv.tradeCount)) {
      errors.push("Trade count is required and must be a valid number");
    } else if (ohlcv.tradeCount < 0 || !Number.isInteger(ohlcv.tradeCount)) {
      errors.push("Trade count must be a non-negative integer");
    }

    this.updateStats(errors.length === 0, warnings.length > 0);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate batch of trade data
   */
  validateTradeBatch(trades: TradeData[]): {
    valid: TradeData[];
    invalid: Array<{ data: TradeData; result: ValidationResult }>;
  } {
    const valid: TradeData[] = [];
    const invalid: Array<{ data: TradeData; result: ValidationResult }> = [];

    trades.forEach((trade) => {
      const result = this.validateTradeData(trade);
      if (result.isValid) {
        valid.push(trade);
      } else {
        invalid.push({ data: trade, result });
      }
    });

    return { valid, invalid };
  }

  /**
   * Validate batch of order book data
   */
  validateOrderBookBatch(orderBooks: OrderBookData[]): {
    valid: OrderBookData[];
    invalid: Array<{ data: OrderBookData; result: ValidationResult }>;
  } {
    const valid: OrderBookData[] = [];
    const invalid: Array<{ data: OrderBookData; result: ValidationResult }> =
      [];

    orderBooks.forEach((orderBook) => {
      const result = this.validateOrderBookData(orderBook);
      if (result.isValid) {
        valid.push(orderBook);
      } else {
        invalid.push({ data: orderBook, result });
      }
    });

    return { valid, invalid };
  }

  /**
   * Validate batch of OHLCV data
   */
  validateOHLCVBatch(ohlcvs: OHLCVData[]): {
    valid: OHLCVData[];
    invalid: Array<{ data: OHLCVData; result: ValidationResult }>;
  } {
    const valid: OHLCVData[] = [];
    const invalid: Array<{ data: OHLCVData; result: ValidationResult }> = [];

    ohlcvs.forEach((ohlcv) => {
      const result = this.validateOHLCVData(ohlcv);
      if (result.isValid) {
        valid.push(ohlcv);
      } else {
        invalid.push({ data: ohlcv, result });
      }
    });

    return { valid, invalid };
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): ValidationStats {
    return { ...this.stats };
  }

  /**
   * Reset validation statistics
   */
  resetStats(): void {
    this.stats = {
      totalValidated: 0,
      validRecords: 0,
      invalidRecords: 0,
      warningRecords: 0,
      lastValidatedAt: null,
      errorRate: 0,
    };
  }

  private updateStats(isValid: boolean, hasWarnings: boolean): void {
    this.stats.totalValidated++;
    this.stats.lastValidatedAt = new Date();

    if (isValid) {
      this.stats.validRecords++;
      if (hasWarnings) {
        this.stats.warningRecords++;
      }
    } else {
      this.stats.invalidRecords++;
    }

    this.stats.errorRate =
      this.stats.totalValidated > 0
        ? (this.stats.invalidRecords / this.stats.totalValidated) * 100
        : 0;
  }
}

// Export singleton instance
export const dataValidationService = new DataValidationService();
export default dataValidationService;
