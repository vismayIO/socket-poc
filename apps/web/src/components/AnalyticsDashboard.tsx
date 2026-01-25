import { useState, useEffect } from "react";
import { useAnalytics } from "../hooks/useAnalytics";
import { useDuckDB } from "../hooks/useDuckDB";
import type { TimeInterval } from "../services/analytics.service";
import "./AnalyticsDashboard.css";

export function AnalyticsDashboard() {
  const { isInitialized: isDuckDBReady } = useDuckDB();
  const {
    isLoading,
    error,
    ohlcvData,
    smaData,
    emaData,
    rsiData,
    macdData,
    bollingerData,
    marketStats,
    customQueryResult,
    activeSymbols,
    calculateOHLCV,
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,
    getMarketStatistics,
    executeCustomQuery,
    getActiveSymbols,
    clearData,
  } = useAnalytics();

  const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>("1m");
  const [customQuery, setCustomQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "indicators" | "ohlcv" | "stats" | "custom"
  >("indicators");

  // Load active symbols on mount
  useEffect(() => {
    if (isDuckDBReady) {
      getActiveSymbols();
    }
  }, [isDuckDBReady, getActiveSymbols]);

  const handleCalculateIndicators = async () => {
    if (!selectedSymbol) return;

    clearData();

    // Calculate all technical indicators
    await Promise.all([
      calculateSMA(selectedSymbol, 20),
      calculateEMA(selectedSymbol, 20),
      calculateRSI(selectedSymbol, 14),
      calculateMACD(selectedSymbol),
      calculateBollingerBands(selectedSymbol),
    ]);
  };

  const handleCalculateOHLCV = async () => {
    if (!selectedSymbol) return;
    await calculateOHLCV(selectedSymbol, selectedInterval, 100);
  };

  const handleGetMarketStats = async () => {
    if (!selectedSymbol) return;
    await getMarketStatistics(selectedSymbol);
  };

  const handleCustomQuery = async () => {
    if (!customQuery.trim()) return;
    await executeCustomQuery(customQuery);
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (num: number): string => {
    return `${num >= 0 ? "+" : ""}${formatNumber(num, 2)}%`;
  };

  if (!isDuckDBReady) {
    return (
      <div className="analytics-dashboard">
        <div className="loading-message">
          ⏳ Waiting for DuckDB to initialize...
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h3>📊 Real-time Analytics Engine</h3>
        <div className="symbol-selector">
          <label>Symbol:</label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
          >
            <option value="AAPL">AAPL</option>
            <option value="GOOGL">GOOGL</option>
            <option value="TSLA">TSLA</option>
            <option value="MSFT">MSFT</option>
            <option value="AMZN">AMZN</option>
            {activeSymbols?.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-message">❌ {error}</div>}

      <div className="tab-navigation">
        <button
          className={activeTab === "indicators" ? "active" : ""}
          onClick={() => setActiveTab("indicators")}
        >
          📈 Technical Indicators
        </button>
        <button
          className={activeTab === "ohlcv" ? "active" : ""}
          onClick={() => setActiveTab("ohlcv")}
        >
          📊 OHLCV Data
        </button>
        <button
          className={activeTab === "stats" ? "active" : ""}
          onClick={() => setActiveTab("stats")}
        >
          📋 Market Statistics
        </button>
        <button
          className={activeTab === "custom" ? "active" : ""}
          onClick={() => setActiveTab("custom")}
        >
          🔍 Custom Queries
        </button>
      </div>

      <div className="tab-content">
        {activeTab === "indicators" && (
          <div className="indicators-tab">
            <div className="controls">
              <button
                onClick={handleCalculateIndicators}
                disabled={isLoading}
                className="calculate-button"
              >
                {isLoading
                  ? "⏳ Calculating..."
                  : "🔄 Calculate All Indicators"}
              </button>
            </div>

            <div className="indicators-grid">
              {/* SMA Results */}
              {smaData && (
                <div className="indicator-card">
                  <h4>📈 Simple Moving Average (20)</h4>
                  <div className="indicator-data">
                    <div className="latest-value">
                      Latest: {formatNumber(smaData[0]?.value || 0, 4)}
                    </div>
                    <div className="data-points">
                      {smaData.slice(0, 5).map((point, idx) => (
                        <div key={idx} className="data-point">
                          {new Date(point.timestamp).toLocaleTimeString()}:{" "}
                          {formatNumber(point.value, 4)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* EMA Results */}
              {emaData && (
                <div className="indicator-card">
                  <h4>📊 Exponential Moving Average (20)</h4>
                  <div className="indicator-data">
                    <div className="latest-value">
                      Latest: {formatNumber(emaData[0]?.value || 0, 4)}
                    </div>
                    <div className="data-points">
                      {emaData.slice(0, 5).map((point, idx) => (
                        <div key={idx} className="data-point">
                          {new Date(point.timestamp).toLocaleTimeString()}:{" "}
                          {formatNumber(point.value, 4)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* RSI Results */}
              {rsiData && (
                <div className="indicator-card">
                  <h4>⚡ Relative Strength Index (14)</h4>
                  <div className="indicator-data">
                    <div className="latest-value">
                      Latest: {formatNumber(rsiData[0]?.value || 0, 2)}
                      {rsiData[0]?.overbought && (
                        <span className="signal overbought">OVERBOUGHT</span>
                      )}
                      {rsiData[0]?.oversold && (
                        <span className="signal oversold">OVERSOLD</span>
                      )}
                    </div>
                    <div className="data-points">
                      {rsiData.slice(0, 5).map((point, idx) => (
                        <div key={idx} className="data-point">
                          {new Date(point.timestamp).toLocaleTimeString()}:{" "}
                          {formatNumber(point.value, 2)}
                          {point.overbought && (
                            <span className="mini-signal overbought">OB</span>
                          )}
                          {point.oversold && (
                            <span className="mini-signal oversold">OS</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* MACD Results */}
              {macdData && (
                <div className="indicator-card">
                  <h4>🌊 MACD (12,26,9)</h4>
                  <div className="indicator-data">
                    <div className="latest-value">
                      MACD: {formatNumber(macdData[0]?.macd || 0, 4)}
                      Signal: {formatNumber(macdData[0]?.signal || 0, 4)}
                      {macdData[0]?.crossover && (
                        <span
                          className={`signal ${macdData[0].crossover.toLowerCase()}`}
                        >
                          {macdData[0].crossover}
                        </span>
                      )}
                    </div>
                    <div className="data-points">
                      {macdData.slice(0, 3).map((point, idx) => (
                        <div key={idx} className="data-point">
                          {new Date(point.timestamp).toLocaleTimeString()}: M:
                          {formatNumber(point.macd, 4)} S:
                          {formatNumber(point.signal, 4)} H:
                          {formatNumber(point.histogram, 4)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Bollinger Bands Results */}
              {bollingerData && (
                <div className="indicator-card">
                  <h4>📏 Bollinger Bands (20,2)</h4>
                  <div className="indicator-data">
                    <div className="latest-value">
                      Upper: {formatNumber(bollingerData[0]?.upper || 0, 4)}
                      Middle: {formatNumber(bollingerData[0]?.middle || 0, 4)}
                      Lower: {formatNumber(bollingerData[0]?.lower || 0, 4)}
                      {bollingerData[0]?.squeeze && (
                        <span className="signal squeeze">SQUEEZE</span>
                      )}
                    </div>
                    <div className="data-points">
                      {bollingerData.slice(0, 3).map((point, idx) => (
                        <div key={idx} className="data-point">
                          {new Date(point.timestamp).toLocaleTimeString()}: U:
                          {formatNumber(point.upper, 2)} M:
                          {formatNumber(point.middle, 2)} L:
                          {formatNumber(point.lower, 2)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "ohlcv" && (
          <div className="ohlcv-tab">
            <div className="controls">
              <label>Interval:</label>
              <select
                value={selectedInterval}
                onChange={(e) =>
                  setSelectedInterval(e.target.value as TimeInterval)
                }
              >
                <option value="1s">1 Second</option>
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
                <option value="1d">1 Day</option>
              </select>
              <button
                onClick={handleCalculateOHLCV}
                disabled={isLoading}
                className="calculate-button"
              >
                {isLoading ? "⏳ Loading..." : "📊 Load OHLCV Data"}
              </button>
            </div>

            {ohlcvData && (
              <div className="ohlcv-data">
                <h4>📊 OHLCV Data ({selectedInterval} intervals)</h4>
                <div className="ohlcv-table">
                  <div className="table-header">
                    <span>Time</span>
                    <span>Open</span>
                    <span>High</span>
                    <span>Low</span>
                    <span>Close</span>
                    <span>Volume</span>
                    <span>Trades</span>
                  </div>
                  {ohlcvData.slice(0, 20).map((candle, idx) => (
                    <div key={idx} className="table-row">
                      <span>
                        {new Date(candle.timestamp).toLocaleTimeString()}
                      </span>
                      <span>{formatNumber(candle.open, 4)}</span>
                      <span>{formatNumber(candle.high, 4)}</span>
                      <span>{formatNumber(candle.low, 4)}</span>
                      <span>{formatNumber(candle.close, 4)}</span>
                      <span>{candle.volume.toLocaleString()}</span>
                      <span>{candle.tradeCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "stats" && (
          <div className="stats-tab">
            <div className="controls">
              <button
                onClick={handleGetMarketStats}
                disabled={isLoading}
                className="calculate-button"
              >
                {isLoading ? "⏳ Loading..." : "📋 Get Market Statistics"}
              </button>
            </div>

            {marketStats && (
              <div className="market-stats">
                <h4>📋 Market Statistics for {marketStats.symbol}</h4>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">Total Trades</div>
                    <div className="stat-value">
                      {marketStats.totalTrades.toLocaleString()}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Total Volume</div>
                    <div className="stat-value">
                      {marketStats.totalVolume.toLocaleString()}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Average Price</div>
                    <div className="stat-value">
                      ${formatNumber(marketStats.avgPrice, 4)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">VWAP</div>
                    <div className="stat-value">
                      ${formatNumber(marketStats.vwap, 4)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">High Price</div>
                    <div className="stat-value">
                      ${formatNumber(marketStats.highPrice, 4)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Low Price</div>
                    <div className="stat-value">
                      ${formatNumber(marketStats.lowPrice, 4)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Price Change</div>
                    <div
                      className={`stat-value ${marketStats.priceChange >= 0 ? "positive" : "negative"}`}
                    >
                      ${formatNumber(marketStats.priceChange, 4)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Price Change %</div>
                    <div
                      className={`stat-value ${marketStats.priceChangePercent >= 0 ? "positive" : "negative"}`}
                    >
                      {formatPercent(marketStats.priceChangePercent)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Volatility</div>
                    <div className="stat-value">
                      {formatNumber(marketStats.priceVolatility, 4)}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Last Update</div>
                    <div className="stat-value">
                      {marketStats.lastUpdate.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "custom" && (
          <div className="custom-tab">
            <div className="query-section">
              <h4>🔍 Custom SQL Query</h4>
              <textarea
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Enter your SQL query here (SELECT statements only)..."
                rows={6}
                className="query-textarea"
              />
              <button
                onClick={handleCustomQuery}
                disabled={isLoading || !customQuery.trim()}
                className="execute-button"
              >
                {isLoading ? "⏳ Executing..." : "▶️ Execute Query"}
              </button>
            </div>

            <div className="query-examples">
              <h5>Example Queries:</h5>
              <div className="example-queries">
                <button
                  onClick={() =>
                    setCustomQuery(`SELECT symbol, COUNT(*) as trade_count, AVG(price) as avg_price 
FROM trades 
WHERE timestamp >= NOW() - INTERVAL '1 hour' 
GROUP BY symbol 
ORDER BY trade_count DESC 
LIMIT 10`)
                  }
                  className="example-button"
                >
                  Top Trading Symbols (Last Hour)
                </button>
                <button
                  onClick={() =>
                    setCustomQuery(`SELECT 
  DATE_TRUNC('minute', timestamp) as minute,
  COUNT(*) as trades_per_minute,
  AVG(price) as avg_price,
  SUM(quantity) as total_volume
FROM trades 
WHERE symbol = '${selectedSymbol}' 
  AND timestamp >= NOW() - INTERVAL '30 minutes'
GROUP BY minute 
ORDER BY minute DESC 
LIMIT 30`)
                  }
                  className="example-button"
                >
                  Trading Activity by Minute
                </button>
                <button
                  onClick={() =>
                    setCustomQuery(`SELECT 
  side,
  COUNT(*) as trade_count,
  AVG(price) as avg_price,
  SUM(quantity) as total_quantity
FROM trades 
WHERE symbol = '${selectedSymbol}' 
  AND timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY side`)
                  }
                  className="example-button"
                >
                  Buy vs Sell Analysis
                </button>
              </div>
            </div>

            {customQueryResult && (
              <div className="query-results">
                <h4>📊 Query Results</h4>
                <div className="results-table">
                  {customQueryResult.length > 0 && (
                    <>
                      <div className="table-header">
                        {Object.keys(customQueryResult[0] as object).map(
                          (key) => (
                            <span key={key}>{key}</span>
                          ),
                        )}
                      </div>
                      {customQueryResult.slice(0, 50).map((row, idx) => (
                        <div key={idx} className="table-row">
                          {Object.values(row as object).map(
                            (value, valueIdx) => (
                              <span key={valueIdx}>
                                {typeof value === "number"
                                  ? formatNumber(value, 4)
                                  : String(value)}
                              </span>
                            ),
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {customQueryResult.length === 0 && (
                    <div className="no-results">No results found</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
