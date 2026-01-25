import { useState, useEffect, useCallback } from "react";
import { useNats } from "../hooks/useNats";
import { useDuckDB } from "../hooks/useDuckDB";
import { PriceTicker } from "./trading/PriceTicker";
import { OrderBookPanel } from "./trading/OrderBookPanel";
import { TradeFeed } from "./trading/TradeFeed";
import { MarketOverview } from "./trading/MarketOverview";
import { ChartPanel } from "./trading/ChartPanel";
import { WatchlistPanel } from "./trading/WatchlistPanel";
import { PortfolioPanel } from "./trading/PortfolioPanel";
import "./TradingDashboard.css";

interface TradingDashboardProps {
  className?: string;
}

export function TradingDashboard({ className }: TradingDashboardProps) {
  const { connection, isConnected } = useNats();
  const { isInitialized: isDuckDBReady } = useDuckDB();
  const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([
    "AAPL",
    "GOOGL",
    "TSLA",
    "MSFT",
    "AMZN",
    "NVDA",
    "META",
    "NFLX",
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<
    "overview" | "watchlist" | "portfolio"
  >("overview");

  // Fetch available symbols from API
  const fetchSymbols = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/v1/symbols");
      const data = await response.json();

      if (data.success && data.data) {
        const symbols = data.data.map((s: { symbol: string }) => s.symbol);
        setAvailableSymbols(symbols);
        if (symbols.length > 0 && !symbols.includes(selectedSymbol)) {
          setSelectedSymbol(symbols[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch symbols:", err);
      setError("Failed to load symbols");
    } finally {
      setIsLoading(false);
    }
  }, [selectedSymbol]);

  // Load symbols on mount
  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  if (!isDuckDBReady) {
    return (
      <div className={`trading-dashboard ${className || ""}`}>
        <div className="loading-message">
          ⏳ Initializing trading dashboard...
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className={`trading-dashboard ${className || ""}`}>
        <div className="connection-warning">
          ⚠️ NATS connection required for real-time trading data
        </div>
      </div>
    );
  }

  return (
    <div className={`trading-dashboard ${className || ""}`}>
      <div className="dashboard-header">
        <div className="header-left">
          <h2>📈 Trading Dashboard</h2>
          <div className="connection-status">
            <span className="status-indicator connected">🟢 Live</span>
          </div>
        </div>

        <div className="header-controls">
          <div className="view-tabs">
            <button
              className={`tab-button ${activeView === "overview" ? "active" : ""}`}
              onClick={() => setActiveView("overview")}
            >
              📊 Overview
            </button>
            <button
              className={`tab-button ${activeView === "watchlist" ? "active" : ""}`}
              onClick={() => setActiveView("watchlist")}
            >
              👁️ Watchlist
            </button>
            <button
              className={`tab-button ${activeView === "portfolio" ? "active" : ""}`}
              onClick={() => setActiveView("portfolio")}
            >
              💼 Portfolio
            </button>
          </div>

          <div className="symbol-selector">
            <label>Symbol:</label>
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              disabled={isLoading}
            >
              {availableSymbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchSymbols}
            disabled={isLoading}
            className="refresh-button"
          >
            {isLoading ? "⏳" : "🔄"} Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ❌ {error}
          <button onClick={() => setError(null)} className="dismiss-error">
            ×
          </button>
        </div>
      )}

      <div className="dashboard-content">
        {activeView === "overview" && (
          <div className="dashboard-grid">
            {/* Market Overview - Top row, full width */}
            <div className="grid-item market-overview">
              <MarketOverview
                symbols={availableSymbols.slice(0, 8)}
                connection={connection}
              />
            </div>

            {/* Price Ticker - Second row, full width */}
            <div className="grid-item price-ticker">
              <PriceTicker symbol={selectedSymbol} connection={connection} />
            </div>

            {/* Chart Panel - Third row, full width */}
            <div className="grid-item chart-panel">
              <ChartPanel symbol={selectedSymbol} connection={connection} />
            </div>

            {/* Order Book - Left column */}
            <div className="grid-item order-book">
              <OrderBookPanel symbol={selectedSymbol} connection={connection} />
            </div>

            {/* Trade Feed - Right column */}
            <div className="grid-item trade-feed">
              <TradeFeed symbol={selectedSymbol} connection={connection} />
            </div>
          </div>
        )}

        {activeView === "watchlist" && (
          <div className="single-panel-view">
            <WatchlistPanel
              connection={connection}
              onSymbolSelect={setSelectedSymbol}
              selectedSymbol={selectedSymbol}
            />
          </div>
        )}

        {activeView === "portfolio" && (
          <div className="single-panel-view">
            <PortfolioPanel
              connection={connection}
              onSymbolSelect={setSelectedSymbol}
            />
          </div>
        )}
      </div>
    </div>
  );
}
