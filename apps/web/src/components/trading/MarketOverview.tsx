import { useState, useEffect, useCallback } from "react";
import type { NatsConnection } from "nats.ws";
import { subscribe } from "../../lib/nats-client";
import "./MarketOverview.css";

interface MarketSymbol {
  symbol: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  lastUpdate: Date;
}

interface MarketOverviewProps {
  symbols: string[];
  connection: NatsConnection | null;
}

export function MarketOverview({ symbols, connection }: MarketOverviewProps) {
  const [marketData, setMarketData] = useState<Map<string, MarketSymbol>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial market data for all symbols
  const fetchMarketData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const promises = symbols.map(async (symbol) => {
        try {
          const response = await fetch(`/api/v1/quotes/${symbol}`);
          const data = await response.json();

          if (data.success && data.data) {
            return {
              symbol,
              data: {
                symbol: data.data.symbol,
                lastPrice: data.data.lastPrice,
                change: data.data.change || 0,
                changePercent: data.data.changePercent || 0,
                volume: data.data.volume || 0,
                lastUpdate: new Date(data.data.lastTime || data.timestamp),
              },
            };
          }
          return null;
        } catch (err) {
          console.error(`Failed to fetch data for ${symbol}:`, err);
          return null;
        }
      });

      const results = await Promise.all(promises);
      const newMarketData = new Map<string, MarketSymbol>();

      results.forEach((result) => {
        if (result) {
          newMarketData.set(result.symbol, result.data);
        }
      });

      setMarketData(newMarketData);
    } catch (err) {
      console.error("Failed to fetch market data:", err);
      setError("Failed to load market data");
    } finally {
      setIsLoading(false);
    }
  }, [symbols]);

  // Subscribe to real-time updates for all symbols
  useEffect(() => {
    if (!connection || symbols.length === 0) return;

    const subscriptions: { unsubscribe: () => void }[] = [];

    try {
      symbols.forEach((symbol) => {
        const subscription = subscribe(`quotes.${symbol}`, (data: string) => {
          try {
            const update = JSON.parse(data);

            const symbolData: MarketSymbol = {
              symbol: update.symbol,
              lastPrice: update.lastPrice || update.price,
              change: update.change || 0,
              changePercent: update.changePercent || 0,
              volume: update.volume || 0,
              lastUpdate: new Date(),
            };

            setMarketData((prev) => {
              const newMap = new Map(prev);
              newMap.set(symbol, symbolData);
              return newMap;
            });

            setError(null);
          } catch (err) {
            console.error(`Failed to parse update for ${symbol}:`, err);
          }
        });

        subscriptions.push(subscription);
      });
    } catch (err) {
      console.error("Failed to subscribe to market data:", err);
    }

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [connection, symbols]);

  // Fetch initial data and set up polling fallback
  useEffect(() => {
    if (symbols.length > 0) {
      fetchMarketData();

      // Fallback polling every 10 seconds if no real-time updates
      const interval = setInterval(() => {
        if (!connection) {
          fetchMarketData();
        }
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [fetchMarketData, connection, symbols.length]);

  const formatPrice = (price: number): string => {
    return price.toFixed(2);
  };

  const formatPercent = (percent: number): string => {
    const sign = percent >= 0 ? "+" : "";
    return `${sign}${percent.toFixed(2)}%`;
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    }
    if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toLocaleString();
  };

  const getMarketSummary = () => {
    const data = Array.from(marketData.values());
    if (data.length === 0) return null;

    const gainers = data.filter((s) => s.changePercent > 0).length;
    const losers = data.filter((s) => s.changePercent < 0).length;
    const unchanged = data.filter((s) => s.changePercent === 0).length;
    const totalVolume = data.reduce((sum, s) => sum + s.volume, 0);
    const avgChange =
      data.reduce((sum, s) => sum + s.changePercent, 0) / data.length;

    return { gainers, losers, unchanged, totalVolume, avgChange };
  };

  if (isLoading && marketData.size === 0) {
    return (
      <div className="market-overview">
        <div className="overview-header">
          <h3>🌍 Market Overview</h3>
        </div>
        <div className="overview-loading">⏳ Loading market data...</div>
      </div>
    );
  }

  const summary = getMarketSummary();

  return (
    <div className="market-overview">
      <div className="overview-header">
        <div className="header-left">
          <h3>🌍 Market Overview</h3>
          {summary && (
            <div className="market-summary">
              <span className="summary-item gainers">
                ▲ {summary.gainers} Gainers
              </span>
              <span className="summary-item losers">
                ▼ {summary.losers} Losers
              </span>
              <span className="summary-item unchanged">
                ➖ {summary.unchanged} Unchanged
              </span>
              <span className="summary-item volume">
                Vol: {formatVolume(summary.totalVolume)}
              </span>
              <span
                className={`summary-item avg-change ${summary.avgChange >= 0 ? "positive" : "negative"}`}
              >
                Avg: {formatPercent(summary.avgChange)}
              </span>
            </div>
          )}
        </div>
        <div className="header-controls">
          <button
            onClick={fetchMarketData}
            disabled={isLoading}
            className="refresh-button"
          >
            {isLoading ? "⏳" : "🔄"} Refresh
          </button>
        </div>
      </div>

      {error && <div className="overview-error">❌ {error}</div>}

      <div className="symbols-grid">
        {symbols.map((symbol) => {
          const data = marketData.get(symbol);

          if (!data) {
            return (
              <div key={symbol} className="symbol-card loading">
                <div className="symbol-name">{symbol}</div>
                <div className="symbol-loading">Loading...</div>
              </div>
            );
          }

          return (
            <div key={symbol} className="symbol-card">
              <div className="symbol-header">
                <div className="symbol-name">{data.symbol}</div>
                <div className="symbol-volume">{formatVolume(data.volume)}</div>
              </div>

              <div className="symbol-price">${formatPrice(data.lastPrice)}</div>

              <div
                className={`symbol-change ${data.changePercent >= 0 ? "positive" : "negative"}`}
              >
                <span className="change-arrow">
                  {data.changePercent >= 0 ? "▲" : "▼"}
                </span>
                <span className="change-value">
                  ${Math.abs(data.change).toFixed(2)}
                </span>
                <span className="change-percent">
                  ({formatPercent(data.changePercent)})
                </span>
              </div>

              <div className="symbol-update">
                {data.lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
