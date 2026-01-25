import { useState, useEffect, useCallback } from "react";
import type { NatsConnection } from "nats.ws";
import { subscribe } from "../../lib/nats-client";
import "./WatchlistPanel.css";

interface WatchlistSymbol {
  symbol: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  lastUpdate: Date;
  isActive: boolean;
}

interface WatchlistPanelProps {
  connection: NatsConnection | null;
  onSymbolSelect?: (symbol: string) => void;
  selectedSymbol?: string;
}

export function WatchlistPanel({
  connection,
  onSymbolSelect,
  selectedSymbol,
}: WatchlistPanelProps) {
  const [watchlist, setWatchlist] = useState<WatchlistSymbol[]>([]);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"symbol" | "change" | "volume">(
    "symbol",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Load watchlist from localStorage
  const loadWatchlist = useCallback(() => {
    try {
      const saved = localStorage.getItem("trading-watchlist");
      if (saved) {
        const symbols = JSON.parse(saved) as string[];
        // Initialize watchlist with saved symbols
        const initialWatchlist: WatchlistSymbol[] = symbols.map((symbol) => ({
          symbol,
          lastPrice: 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          high: 0,
          low: 0,
          lastUpdate: new Date(),
          isActive: false,
        }));
        setWatchlist(initialWatchlist);

        // Fetch current data for watchlist symbols
        fetchWatchlistData(symbols);
      }
    } catch (err) {
      console.error("Failed to load watchlist:", err);
    }
  }, []);

  // Save watchlist to localStorage
  const saveWatchlist = useCallback((symbols: string[]) => {
    try {
      localStorage.setItem("trading-watchlist", JSON.stringify(symbols));
    } catch (err) {
      console.error("Failed to save watchlist:", err);
    }
  }, []);

  // Fetch available symbols
  const fetchAvailableSymbols = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/symbols");
      const data = await response.json();

      if (data.success && data.data) {
        const symbols = data.data.map((s: { symbol: string }) => s.symbol);
        setAvailableSymbols(symbols);
      }
    } catch (err) {
      console.error("Failed to fetch available symbols:", err);
    }
  }, []);

  // Fetch data for watchlist symbols
  const fetchWatchlistData = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;

    try {
      setIsLoading(true);
      setError(null);

      const promises = symbols.map(async (symbol) => {
        try {
          const response = await fetch(`/api/v1/quotes/${symbol}`);
          const data = await response.json();

          if (data.success && data.data) {
            return {
              symbol: data.data.symbol,
              lastPrice: data.data.lastPrice,
              change: data.data.change || 0,
              changePercent: data.data.changePercent || 0,
              volume: data.data.volume || 0,
              high: data.data.high || data.data.lastPrice,
              low: data.data.low || data.data.lastPrice,
              lastUpdate: new Date(data.data.lastTime || data.timestamp),
              isActive: true,
            };
          }
          return null;
        } catch (err) {
          console.error(`Failed to fetch data for ${symbol}:`, err);
          return null;
        }
      });

      const results = await Promise.all(promises);
      const validResults = results.filter(
        (result): result is WatchlistSymbol => result !== null,
      );

      setWatchlist((prev) => {
        const updated = [...prev];
        validResults.forEach((result) => {
          const index = updated.findIndex(
            (item) => item.symbol === result.symbol,
          );
          if (index >= 0) {
            updated[index] = result;
          }
        });
        return updated;
      });
    } catch (err) {
      console.error("Failed to fetch watchlist data:", err);
      setError("Failed to load watchlist data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Subscribe to real-time updates for watchlist symbols
  useEffect(() => {
    if (!connection || watchlist.length === 0) return;

    const subscriptions: { unsubscribe: () => void }[] = [];

    try {
      watchlist.forEach((item) => {
        const subscription = subscribe(
          `quotes.${item.symbol}`,
          (data: string) => {
            try {
              const update = JSON.parse(data);

              const symbolData: WatchlistSymbol = {
                symbol: update.symbol,
                lastPrice: update.lastPrice || update.price,
                change: update.change || 0,
                changePercent: update.changePercent || 0,
                volume: update.volume || 0,
                high: update.high || update.lastPrice,
                low: update.low || update.lastPrice,
                lastUpdate: new Date(),
                isActive: true,
              };

              setWatchlist((prev) => {
                const updated = [...prev];
                const index = updated.findIndex(
                  (w) => w.symbol === item.symbol,
                );
                if (index >= 0) {
                  updated[index] = symbolData;
                }
                return updated;
              });

              setError(null);
            } catch (err) {
              console.error(`Failed to parse update for ${item.symbol}:`, err);
            }
          },
        );

        subscriptions.push(subscription);
      });
    } catch (err) {
      console.error("Failed to subscribe to watchlist updates:", err);
    }

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [connection, watchlist.length]);

  // Load data on mount
  useEffect(() => {
    loadWatchlist();
    fetchAvailableSymbols();
  }, [loadWatchlist, fetchAvailableSymbols]);

  // Add symbol to watchlist
  const addSymbol = useCallback(
    (symbol: string) => {
      if (!symbol || watchlist.some((item) => item.symbol === symbol)) {
        return;
      }

      const newWatchlistItem: WatchlistSymbol = {
        symbol,
        lastPrice: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        high: 0,
        low: 0,
        lastUpdate: new Date(),
        isActive: false,
      };

      const updatedWatchlist = [...watchlist, newWatchlistItem];
      setWatchlist(updatedWatchlist);

      const symbols = updatedWatchlist.map((item) => item.symbol);
      saveWatchlist(symbols);

      // Fetch data for the new symbol
      fetchWatchlistData([symbol]);

      setNewSymbol("");
    },
    [watchlist, saveWatchlist, fetchWatchlistData],
  );

  // Remove symbol from watchlist
  const removeSymbol = useCallback(
    (symbol: string) => {
      const updatedWatchlist = watchlist.filter(
        (item) => item.symbol !== symbol,
      );
      setWatchlist(updatedWatchlist);

      const symbols = updatedWatchlist.map((item) => item.symbol);
      saveWatchlist(symbols);
    },
    [watchlist, saveWatchlist],
  );

  // Sort watchlist
  const sortedWatchlist = [...watchlist].sort((a, b) => {
    let aValue: number | string;
    let bValue: number | string;

    switch (sortBy) {
      case "symbol":
        aValue = a.symbol;
        bValue = b.symbol;
        break;
      case "change":
        aValue = a.changePercent;
        bValue = b.changePercent;
        break;
      case "volume":
        aValue = a.volume;
        bValue = b.volume;
        break;
      default:
        aValue = a.symbol;
        bValue = b.symbol;
    }

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortOrder === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    }

    return 0;
  });

  const formatPrice = (price: number): string => {
    return price.toFixed(4);
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

  return (
    <div className="watchlist-panel">
      <div className="panel-header">
        <div className="header-left">
          <h3>👁️ Watchlist</h3>
          <div className="watchlist-count">{watchlist.length} symbols</div>
        </div>

        <div className="header-controls">
          <div className="sort-controls">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="sort-select"
            >
              <option value="symbol">Symbol</option>
              <option value="change">Change %</option>
              <option value="volume">Volume</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="sort-order-button"
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>
      </div>

      <div className="add-symbol-section">
        <div className="add-symbol-form">
          <select
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            className="symbol-select"
          >
            <option value="">Select symbol to add...</option>
            {availableSymbols
              .filter(
                (symbol) => !watchlist.some((item) => item.symbol === symbol),
              )
              .map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
          </select>
          <button
            onClick={() => addSymbol(newSymbol)}
            disabled={!newSymbol || isLoading}
            className="add-button"
          >
            ➕ Add
          </button>
        </div>
      </div>

      {error && <div className="panel-error">❌ {error}</div>}

      <div className="watchlist-content">
        {watchlist.length === 0 ? (
          <div className="empty-watchlist">
            📊 No symbols in watchlist
            <div className="empty-subtitle">
              Add symbols to track their performance
            </div>
          </div>
        ) : (
          <div className="watchlist-items">
            {sortedWatchlist.map((item) => (
              <div
                key={item.symbol}
                className={`watchlist-item ${selectedSymbol === item.symbol ? "selected" : ""}`}
                onClick={() => onSymbolSelect?.(item.symbol)}
              >
                <div className="item-header">
                  <div className="symbol-name">{item.symbol}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSymbol(item.symbol);
                    }}
                    className="remove-button"
                    title="Remove from watchlist"
                  >
                    ×
                  </button>
                </div>

                <div className="item-price">${formatPrice(item.lastPrice)}</div>

                <div
                  className={`item-change ${item.changePercent >= 0 ? "positive" : "negative"}`}
                >
                  <span className="change-arrow">
                    {item.changePercent >= 0 ? "▲" : "▼"}
                  </span>
                  <span className="change-percent">
                    {formatPercent(item.changePercent)}
                  </span>
                </div>

                <div className="item-stats">
                  <div className="stat">
                    <span className="stat-label">Vol:</span>
                    <span className="stat-value">
                      {formatVolume(item.volume)}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">H:</span>
                    <span className="stat-value">
                      ${formatPrice(item.high)}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">L:</span>
                    <span className="stat-value">${formatPrice(item.low)}</span>
                  </div>
                </div>

                <div className="item-update">
                  {item.lastUpdate.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
