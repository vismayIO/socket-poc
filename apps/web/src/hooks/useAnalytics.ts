import { useState, useCallback } from "react";
import analyticsService, {
  type OHLCVResult,
  type MovingAverageResult,
  type RSIResult,
  type MACDResult,
  type BollingerBandsResult,
  type MarketStatistics,
  type TimeInterval,
} from "../services/analytics.service";

export interface UseAnalyticsResult {
  isLoading: boolean;
  error: string | null;

  // OHLCV data
  ohlcvData: OHLCVResult[] | null;
  calculateOHLCV: (
    symbol: string,
    interval: TimeInterval,
    limit?: number,
  ) => Promise<void>;

  // Technical indicators
  smaData: MovingAverageResult[] | null;
  emaData: MovingAverageResult[] | null;
  rsiData: RSIResult[] | null;
  macdData: MACDResult[] | null;
  bollingerData: BollingerBandsResult[] | null;

  calculateSMA: (
    symbol: string,
    period: number,
    limit?: number,
  ) => Promise<void>;
  calculateEMA: (
    symbol: string,
    period: number,
    limit?: number,
  ) => Promise<void>;
  calculateRSI: (
    symbol: string,
    period?: number,
    limit?: number,
  ) => Promise<void>;
  calculateMACD: (
    symbol: string,
    fastPeriod?: number,
    slowPeriod?: number,
    signalPeriod?: number,
    limit?: number,
  ) => Promise<void>;
  calculateBollingerBands: (
    symbol: string,
    period?: number,
    stdDev?: number,
    limit?: number,
  ) => Promise<void>;

  // Market statistics
  marketStats: MarketStatistics | null;
  getMarketStatistics: (symbol: string) => Promise<void>;

  // Custom queries
  customQueryResult: unknown[] | null;
  executeCustomQuery: (sql: string) => Promise<void>;

  // Utility functions
  activeSymbols: string[] | null;
  getActiveSymbols: (limit?: number) => Promise<void>;

  clearData: () => void;
}

export function useAnalytics(): UseAnalyticsResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [ohlcvData, setOhlcvData] = useState<OHLCVResult[] | null>(null);
  const [smaData, setSmaData] = useState<MovingAverageResult[] | null>(null);
  const [emaData, setEmaData] = useState<MovingAverageResult[] | null>(null);
  const [rsiData, setRsiData] = useState<RSIResult[] | null>(null);
  const [macdData, setMacdData] = useState<MACDResult[] | null>(null);
  const [bollingerData, setBollingerData] = useState<
    BollingerBandsResult[] | null
  >(null);
  const [marketStats, setMarketStats] = useState<MarketStatistics | null>(null);
  const [customQueryResult, setCustomQueryResult] = useState<unknown[] | null>(
    null,
  );
  const [activeSymbols, setActiveSymbols] = useState<string[] | null>(null);

  const handleError = (err: unknown, operation: string) => {
    const message =
      err instanceof Error ? err.message : `Failed to ${operation}`;
    setError(message);
    console.error(`Analytics error (${operation}):`, err);
  };

  const calculateOHLCV = useCallback(
    async (symbol: string, interval: TimeInterval, limit: number = 100) => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await analyticsService.calculateOHLCV(
          symbol,
          interval,
          limit,
        );
        setOhlcvData(data);
      } catch (err) {
        handleError(err, "calculate OHLCV");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const calculateSMA = useCallback(
    async (symbol: string, period: number, limit: number = 100) => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await analyticsService.calculateSMA(symbol, period, limit);
        setSmaData(data);
      } catch (err) {
        handleError(err, "calculate SMA");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const calculateEMA = useCallback(
    async (symbol: string, period: number, limit: number = 100) => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await analyticsService.calculateEMA(symbol, period, limit);
        setEmaData(data);
      } catch (err) {
        handleError(err, "calculate EMA");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const calculateRSI = useCallback(
    async (symbol: string, period: number = 14, limit: number = 100) => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await analyticsService.calculateRSI(symbol, period, limit);
        setRsiData(data);
      } catch (err) {
        handleError(err, "calculate RSI");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const calculateMACD = useCallback(
    async (
      symbol: string,
      fastPeriod: number = 12,
      slowPeriod: number = 26,
      signalPeriod: number = 9,
      limit: number = 100,
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await analyticsService.calculateMACD(
          symbol,
          fastPeriod,
          slowPeriod,
          signalPeriod,
          limit,
        );
        setMacdData(data);
      } catch (err) {
        handleError(err, "calculate MACD");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const calculateBollingerBands = useCallback(
    async (
      symbol: string,
      period: number = 20,
      stdDev: number = 2,
      limit: number = 100,
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await analyticsService.calculateBollingerBands(
          symbol,
          period,
          stdDev,
          limit,
        );
        setBollingerData(data);
      } catch (err) {
        handleError(err, "calculate Bollinger Bands");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const getMarketStatistics = useCallback(async (symbol: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await analyticsService.getMarketStatistics(symbol);
      setMarketStats(data);
    } catch (err) {
      handleError(err, "get market statistics");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const executeCustomQuery = useCallback(async (sql: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await analyticsService.executeCustomQuery(sql);
      setCustomQueryResult(data);
    } catch (err) {
      handleError(err, "execute custom query");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getActiveSymbols = useCallback(async (limit: number = 50) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await analyticsService.getActiveSymbols(limit);
      setActiveSymbols(data);
    } catch (err) {
      handleError(err, "get active symbols");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setOhlcvData(null);
    setSmaData(null);
    setEmaData(null);
    setRsiData(null);
    setMacdData(null);
    setBollingerData(null);
    setMarketStats(null);
    setCustomQueryResult(null);
    setActiveSymbols(null);
    setError(null);
  }, []);

  return {
    isLoading,
    error,

    // OHLCV data
    ohlcvData,
    calculateOHLCV,

    // Technical indicators
    smaData,
    emaData,
    rsiData,
    macdData,
    bollingerData,

    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,

    // Market statistics
    marketStats,
    getMarketStatistics,

    // Custom queries
    customQueryResult,
    executeCustomQuery,

    // Utility functions
    activeSymbols,
    getActiveSymbols,

    clearData,
  };
}
