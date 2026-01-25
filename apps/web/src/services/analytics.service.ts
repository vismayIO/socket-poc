import duckDBService from "./duckdb.service";

export interface OHLCVResult {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
}

export interface TechnicalIndicatorResult {
  timestamp: Date;
  value: number;
  signal?: "BUY" | "SELL" | "HOLD";
}

export interface MovingAverageResult extends TechnicalIndicatorResult {
  period: number;
}

export interface RSIResult extends TechnicalIndicatorResult {
  period: number;
  overbought: boolean;
  oversold: boolean;
}

export interface MACDResult {
  timestamp: Date;
  macd: number;
  signal: number;
  histogram: number;
  crossover?: "BULLISH" | "BEARISH";
}

export interface BollingerBandsResult {
  timestamp: Date;
  upper: number;
  middle: number;
  lower: number;
  price: number;
  squeeze: boolean;
}

export interface MarketStatistics {
  symbol: string;
  totalTrades: number;
  totalVolume: number;
  avgPrice: number;
  priceVolatility: number;
  highPrice: number;
  lowPrice: number;
  priceChange: number;
  priceChangePercent: number;
  vwap: number; // Volume Weighted Average Price
  lastUpdate: Date;
}

export type TimeInterval = "1s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

class AnalyticsService {
  /**
   * Calculate OHLCV data for a symbol with specified interval
   */
  async calculateOHLCV(
    symbol: string,
    interval: TimeInterval,
    limit: number = 100,
  ): Promise<OHLCVResult[]> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    const intervalSeconds = this.getIntervalSeconds(interval);

    const sql = `
      WITH time_buckets AS (
        SELECT 
          symbol,
          DATE_TRUNC('${this.getDateTruncUnit(interval)}', timestamp) as bucket_time,
          price,
          quantity,
          timestamp,
          ROW_NUMBER() OVER (PARTITION BY symbol, DATE_TRUNC('${this.getDateTruncUnit(interval)}', timestamp) ORDER BY timestamp ASC) as first_row,
          ROW_NUMBER() OVER (PARTITION BY symbol, DATE_TRUNC('${this.getDateTruncUnit(interval)}', timestamp) ORDER BY timestamp DESC) as last_row
        FROM trades 
        WHERE symbol = '${symbol}'
          AND timestamp >= NOW() - INTERVAL '${limit * intervalSeconds} seconds'
      ),
      ohlcv_data AS (
        SELECT 
          symbol,
          bucket_time as timestamp,
          FIRST(price ORDER BY timestamp) as open_price,
          MAX(price) as high_price,
          MIN(price) as low_price,
          LAST(price ORDER BY timestamp) as close_price,
          SUM(quantity) as volume,
          COUNT(*) as trade_count
        FROM time_buckets
        GROUP BY symbol, bucket_time
        ORDER BY bucket_time DESC
        LIMIT ${limit}
      )
      SELECT * FROM ohlcv_data ORDER BY timestamp ASC
    `;

    try {
      const results = await duckDBService.executeQuery(sql);
      return results.map((row: any) => ({
        symbol: row.symbol,
        timestamp: new Date(row.timestamp),
        open: parseFloat(row.open_price),
        high: parseFloat(row.high_price),
        low: parseFloat(row.low_price),
        close: parseFloat(row.close_price),
        volume: parseInt(row.volume),
        tradeCount: parseInt(row.trade_count),
      }));
    } catch (error) {
      console.error("Failed to calculate OHLCV:", error);
      throw error;
    }
  }

  /**
   * Calculate Simple Moving Average (SMA)
   */
  async calculateSMA(
    symbol: string,
    period: number,
    limit: number = 100,
  ): Promise<MovingAverageResult[]> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    const sql = `
      WITH price_data AS (
        SELECT 
          timestamp,
          price,
          AVG(price) OVER (
            ORDER BY timestamp 
            ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
          ) as sma
        FROM trades 
        WHERE symbol = '${symbol}'
        ORDER BY timestamp DESC
        LIMIT ${limit + period}
      )
      SELECT 
        timestamp,
        sma as value,
        ${period} as period
      FROM price_data 
      WHERE sma IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    try {
      const results = await duckDBService.executeQuery(sql);
      return results.map((row: any) => ({
        timestamp: new Date(row.timestamp),
        value: parseFloat(row.value),
        period: parseInt(row.period),
      }));
    } catch (error) {
      console.error("Failed to calculate SMA:", error);
      throw error;
    }
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   */
  async calculateEMA(
    symbol: string,
    period: number,
    limit: number = 100,
  ): Promise<MovingAverageResult[]> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    const alpha = 2.0 / (period + 1);

    const sql = `
      WITH RECURSIVE price_data AS (
        SELECT 
          timestamp,
          price,
          ROW_NUMBER() OVER (ORDER BY timestamp) as rn
        FROM trades 
        WHERE symbol = '${symbol}'
        ORDER BY timestamp
        LIMIT ${limit + period}
      ),
      ema_calc AS (
        SELECT 
          timestamp,
          price,
          rn,
          price as ema
        FROM price_data 
        WHERE rn = 1
        
        UNION ALL
        
        SELECT 
          p.timestamp,
          p.price,
          p.rn,
          (${alpha} * p.price) + ((1 - ${alpha}) * e.ema) as ema
        FROM price_data p
        JOIN ema_calc e ON p.rn = e.rn + 1
      )
      SELECT 
        timestamp,
        ema as value,
        ${period} as period
      FROM ema_calc
      WHERE rn > ${period}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    try {
      const results = await duckDBService.executeQuery(sql);
      return results.map((row: any) => ({
        timestamp: new Date(row.timestamp),
        value: parseFloat(row.value),
        period: parseInt(row.period),
      }));
    } catch (error) {
      console.error("Failed to calculate EMA:", error);
      throw error;
    }
  }

  /**
   * Calculate Relative Strength Index (RSI)
   */
  async calculateRSI(
    symbol: string,
    period: number = 14,
    limit: number = 100,
  ): Promise<RSIResult[]> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    const sql = `
      WITH price_changes AS (
        SELECT 
          timestamp,
          price,
          price - LAG(price) OVER (ORDER BY timestamp) as price_change
        FROM trades 
        WHERE symbol = '${symbol}'
        ORDER BY timestamp
        LIMIT ${limit + period + 1}
      ),
      gains_losses AS (
        SELECT 
          timestamp,
          price,
          CASE WHEN price_change > 0 THEN price_change ELSE 0 END as gain,
          CASE WHEN price_change < 0 THEN ABS(price_change) ELSE 0 END as loss
        FROM price_changes
        WHERE price_change IS NOT NULL
      ),
      avg_gains_losses AS (
        SELECT 
          timestamp,
          price,
          AVG(gain) OVER (
            ORDER BY timestamp 
            ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
          ) as avg_gain,
          AVG(loss) OVER (
            ORDER BY timestamp 
            ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
          ) as avg_loss
        FROM gains_losses
      ),
      rsi_calc AS (
        SELECT 
          timestamp,
          price,
          avg_gain,
          avg_loss,
          CASE 
            WHEN avg_loss = 0 THEN 100
            ELSE 100 - (100 / (1 + (avg_gain / avg_loss)))
          END as rsi
        FROM avg_gains_losses
        WHERE avg_gain IS NOT NULL AND avg_loss IS NOT NULL
      )
      SELECT 
        timestamp,
        rsi as value,
        ${period} as period,
        CASE WHEN rsi > 70 THEN true ELSE false END as overbought,
        CASE WHEN rsi < 30 THEN true ELSE false END as oversold
      FROM rsi_calc
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    try {
      const results = await duckDBService.executeQuery(sql);
      return results.map((row: any) => ({
        timestamp: new Date(row.timestamp),
        value: parseFloat(row.value),
        period: parseInt(row.period),
        overbought: Boolean(row.overbought),
        oversold: Boolean(row.oversold),
      }));
    } catch (error) {
      console.error("Failed to calculate RSI:", error);
      throw error;
    }
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  async calculateMACD(
    symbol: string,
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
    limit: number = 100,
  ): Promise<MACDResult[]> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    const fastAlpha = 2.0 / (fastPeriod + 1);
    const slowAlpha = 2.0 / (slowPeriod + 1);

    const sql = `
      WITH RECURSIVE price_data AS (
        SELECT 
          timestamp,
          price,
          ROW_NUMBER() OVER (ORDER BY timestamp) as rn
        FROM trades 
        WHERE symbol = '${symbol}'
        ORDER BY timestamp
        LIMIT ${limit + Math.max(slowPeriod, signalPeriod) + 50}
      ),
      ema_calc AS (
        SELECT 
          timestamp,
          price,
          rn,
          price as fast_ema,
          price as slow_ema
        FROM price_data 
        WHERE rn = 1
        
        UNION ALL
        
        SELECT 
          p.timestamp,
          p.price,
          p.rn,
          (${fastAlpha} * p.price) + ((1 - ${fastAlpha}) * e.fast_ema) as fast_ema,
          (${slowAlpha} * p.price) + ((1 - ${slowAlpha}) * e.slow_ema) as slow_ema
        FROM price_data p
        JOIN ema_calc e ON p.rn = e.rn + 1
      ),
      macd_line AS (
        SELECT 
          timestamp,
          price,
          rn,
          fast_ema,
          slow_ema,
          fast_ema - slow_ema as macd
        FROM ema_calc
        WHERE rn > ${slowPeriod}
      ),
      signal_calc AS (
        SELECT 
          timestamp,
          price,
          rn,
          macd,
          AVG(macd) OVER (
            ORDER BY rn 
            ROWS BETWEEN ${signalPeriod - 1} PRECEDING AND CURRENT ROW
          ) as signal_line
        FROM macd_line
      )
      SELECT 
        timestamp,
        macd,
        signal_line as signal,
        macd - signal_line as histogram,
        CASE 
          WHEN macd > signal_line AND LAG(macd) OVER (ORDER BY timestamp) <= LAG(signal_line) OVER (ORDER BY timestamp) THEN 'BULLISH'
          WHEN macd < signal_line AND LAG(macd) OVER (ORDER BY timestamp) >= LAG(signal_line) OVER (ORDER BY timestamp) THEN 'BEARISH'
          ELSE NULL
        END as crossover
      FROM signal_calc
      WHERE signal_line IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    try {
      const results = await duckDBService.executeQuery(sql);
      return results.map((row: any) => ({
        timestamp: new Date(row.timestamp),
        macd: parseFloat(row.macd),
        signal: parseFloat(row.signal),
        histogram: parseFloat(row.histogram),
        crossover: row.crossover as "BULLISH" | "BEARISH" | undefined,
      }));
    } catch (error) {
      console.error("Failed to calculate MACD:", error);
      throw error;
    }
  }

  /**
   * Calculate Bollinger Bands
   */
  async calculateBollingerBands(
    symbol: string,
    period: number = 20,
    stdDev: number = 2,
    limit: number = 100,
  ): Promise<BollingerBandsResult[]> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    const sql = `
      WITH price_data AS (
        SELECT 
          timestamp,
          price,
          AVG(price) OVER (
            ORDER BY timestamp 
            ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
          ) as sma,
          STDDEV(price) OVER (
            ORDER BY timestamp 
            ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
          ) as std_dev
        FROM trades 
        WHERE symbol = '${symbol}'
        ORDER BY timestamp DESC
        LIMIT ${limit + period}
      ),
      bollinger_calc AS (
        SELECT 
          timestamp,
          price,
          sma as middle,
          sma + (${stdDev} * std_dev) as upper,
          sma - (${stdDev} * std_dev) as lower,
          std_dev
        FROM price_data
        WHERE sma IS NOT NULL AND std_dev IS NOT NULL
      )
      SELECT 
        timestamp,
        upper,
        middle,
        lower,
        price,
        CASE WHEN std_dev < (0.1 * middle) THEN true ELSE false END as squeeze
      FROM bollinger_calc
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    try {
      const results = await duckDBService.executeQuery(sql);
      return results.map((row: any) => ({
        timestamp: new Date(row.timestamp),
        upper: parseFloat(row.upper),
        middle: parseFloat(row.middle),
        lower: parseFloat(row.lower),
        price: parseFloat(row.price),
        squeeze: Boolean(row.squeeze),
      }));
    } catch (error) {
      console.error("Failed to calculate Bollinger Bands:", error);
      throw error;
    }
  }

  /**
   * Get comprehensive market statistics for a symbol
   */
  async getMarketStatistics(symbol: string): Promise<MarketStatistics> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    const sql = `
      WITH recent_trades AS (
        SELECT * FROM trades 
        WHERE symbol = '${symbol}' 
        AND timestamp >= NOW() - INTERVAL '24 hours'
      ),
      price_stats AS (
        SELECT 
          COUNT(*) as total_trades,
          SUM(quantity) as total_volume,
          AVG(price) as avg_price,
          STDDEV(price) as price_volatility,
          MAX(price) as high_price,
          MIN(price) as low_price,
          SUM(price * quantity) / SUM(quantity) as vwap,
          MAX(timestamp) as last_update
        FROM recent_trades
      ),
      price_change AS (
        SELECT 
          FIRST(price ORDER BY timestamp) as first_price,
          LAST(price ORDER BY timestamp) as last_price
        FROM recent_trades
      )
      SELECT 
        '${symbol}' as symbol,
        COALESCE(p.total_trades, 0) as total_trades,
        COALESCE(p.total_volume, 0) as total_volume,
        COALESCE(p.avg_price, 0) as avg_price,
        COALESCE(p.price_volatility, 0) as price_volatility,
        COALESCE(p.high_price, 0) as high_price,
        COALESCE(p.low_price, 0) as low_price,
        COALESCE(p.vwap, 0) as vwap,
        COALESCE(p.last_update, NOW()) as last_update,
        COALESCE(pc.last_price - pc.first_price, 0) as price_change,
        COALESCE(
          CASE 
            WHEN pc.first_price > 0 THEN ((pc.last_price - pc.first_price) / pc.first_price) * 100
            ELSE 0 
          END, 
          0
        ) as price_change_percent
      FROM price_stats p
      CROSS JOIN price_change pc
    `;

    try {
      const results = await duckDBService.executeQuery(sql);
      const row = results[0] as any;

      return {
        symbol: row.symbol,
        totalTrades: parseInt(row.total_trades) || 0,
        totalVolume: parseInt(row.total_volume) || 0,
        avgPrice: parseFloat(row.avg_price) || 0,
        priceVolatility: parseFloat(row.price_volatility) || 0,
        highPrice: parseFloat(row.high_price) || 0,
        lowPrice: parseFloat(row.low_price) || 0,
        priceChange: parseFloat(row.price_change) || 0,
        priceChangePercent: parseFloat(row.price_change_percent) || 0,
        vwap: parseFloat(row.vwap) || 0,
        lastUpdate: new Date(row.last_update),
      };
    } catch (error) {
      console.error("Failed to get market statistics:", error);
      throw error;
    }
  }

  /**
   * Execute custom SQL query with safety checks
   */
  async executeCustomQuery(sql: string): Promise<unknown[]> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    // Basic safety checks
    const normalizedSql = sql.toLowerCase().trim();

    // Only allow SELECT statements
    if (!normalizedSql.startsWith("select")) {
      throw new Error("Only SELECT queries are allowed");
    }

    // Prevent potentially dangerous operations
    const dangerousKeywords = [
      "drop",
      "delete",
      "insert",
      "update",
      "alter",
      "create",
      "truncate",
    ];
    for (const keyword of dangerousKeywords) {
      if (normalizedSql.includes(keyword)) {
        throw new Error(`Query contains forbidden keyword: ${keyword}`);
      }
    }

    // Limit query length
    if (sql.length > 5000) {
      throw new Error("Query too long (max 5000 characters)");
    }

    try {
      return await duckDBService.executeQuery(sql);
    } catch (error) {
      console.error("Failed to execute custom query:", error);
      throw error;
    }
  }

  /**
   * Get available symbols with recent activity
   */
  async getActiveSymbols(limit: number = 50): Promise<string[]> {
    if (!duckDBService.isReady()) {
      throw new Error("DuckDB service not ready");
    }

    const sql = `
      SELECT DISTINCT symbol
      FROM trades 
      WHERE timestamp >= NOW() - INTERVAL '1 hour'
      ORDER BY symbol
      LIMIT ${limit}
    `;

    try {
      const results = await duckDBService.executeQuery(sql);
      return results.map((row: any) => row.symbol);
    } catch (error) {
      console.error("Failed to get active symbols:", error);
      throw error;
    }
  }

  private getIntervalSeconds(interval: TimeInterval): number {
    const intervals: Record<TimeInterval, number> = {
      "1s": 1,
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
    };
    return intervals[interval];
  }

  private getDateTruncUnit(interval: TimeInterval): string {
    const units: Record<TimeInterval, string> = {
      "1s": "second",
      "1m": "minute",
      "5m": "minute",
      "15m": "minute",
      "1h": "hour",
      "4h": "hour",
      "1d": "day",
    };
    return units[interval];
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService;
