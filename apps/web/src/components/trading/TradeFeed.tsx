import { useState, useEffect, useCallback, useRef } from "react";
import type { NatsConnection } from "nats.ws";
import { subscribe } from "../../lib/nats-client";
import "./TradeFeed.css";

interface Trade {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: "BUY" | "SELL";
  timestamp: Date;
  orderId?: string;
  tradeType?: string;
}

interface TradeFeedProps {
  symbol: string;
  connection: NatsConnection | null;
}

export function TradeFeed({ symbol, connection }: TradeFeedProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [maxTrades, setMaxTrades] = useState(100);
  const tradesContainerRef = useRef<HTMLDivElement>(null);

  // Fetch initial trades
  const fetchTrades = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/trades/${symbol}?limit=50`);
      const data = await response.json();

      if (data.success && data.data) {
        const initialTrades: Trade[] = data.data.map(
          (trade: {
            id: string;
            symbol: string;
            price: number;
            quantity: number;
            side: "BUY" | "SELL";
            timestamp: string;
            orderId?: string;
            tradeType?: string;
          }) => ({
            ...trade,
            timestamp: new Date(trade.timestamp),
          }),
        );

        setTrades(initialTrades);
      } else {
        setError(data.error || "Failed to fetch trades");
      }
    } catch (err) {
      console.error("Failed to fetch trades:", err);
      setError("Failed to load trade data");
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  // Subscribe to real-time trade updates
  useEffect(() => {
    if (!connection) return;

    let subscription: { unsubscribe: () => void } | null = null;

    try {
      // Subscribe to trade updates for this symbol
      subscription = subscribe(`trades.${symbol}`, (data: string) => {
        try {
          const tradeUpdate = JSON.parse(data);

          const newTrade: Trade = {
            id: tradeUpdate.id || `${Date.now()}-${Math.random()}`,
            symbol: tradeUpdate.symbol,
            price: tradeUpdate.price,
            quantity: tradeUpdate.quantity,
            side: tradeUpdate.side,
            timestamp: new Date(tradeUpdate.timestamp || Date.now()),
            orderId: tradeUpdate.orderId,
            tradeType: tradeUpdate.tradeType,
          };

          setTrades((prevTrades) => {
            const updatedTrades = [newTrade, ...prevTrades];
            // Keep only the most recent trades
            return updatedTrades.slice(0, maxTrades);
          });

          setError(null);
        } catch (err) {
          console.error("Failed to parse trade update:", err);
        }
      });
    } catch (err) {
      console.error("Failed to subscribe to trades:", err);
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [connection, symbol, maxTrades]);

  // Auto-scroll to top when new trades arrive
  useEffect(() => {
    if (autoScroll && tradesContainerRef.current) {
      tradesContainerRef.current.scrollTop = 0;
    }
  }, [trades, autoScroll]);

  // Fetch initial data and set up polling fallback
  useEffect(() => {
    fetchTrades();

    // Fallback polling every 3 seconds if no real-time updates
    const interval = setInterval(() => {
      if (!connection) {
        fetchTrades();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchTrades, connection]);

  const formatPrice = (price: number): string => {
    return price.toFixed(4);
  };

  const formatQuantity = (quantity: number): string => {
    if (quantity >= 1000000) {
      return `${(quantity / 1000000).toFixed(1)}M`;
    }
    if (quantity >= 1000) {
      return `${(quantity / 1000).toFixed(1)}K`;
    }
    return quantity.toLocaleString();
  };

  const formatTime = (timestamp: Date): string => {
    return timestamp.toLocaleTimeString([], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const calculateTradeValue = (price: number, quantity: number): string => {
    const value = price * quantity;
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const clearTrades = () => {
    setTrades([]);
  };

  if (isLoading && trades.length === 0) {
    return (
      <div className="trade-feed">
        <div className="feed-header">
          <h3>📈 Trade Feed</h3>
        </div>
        <div className="feed-loading">⏳ Loading trades...</div>
      </div>
    );
  }

  return (
    <div className="trade-feed">
      <div className="feed-header">
        <div className="header-left">
          <h3>📈 Trade Feed - {symbol}</h3>
          <div className="trade-count">{trades.length} trades</div>
        </div>
        <div className="header-controls">
          <label className="auto-scroll-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <select
            value={maxTrades}
            onChange={(e) => setMaxTrades(parseInt(e.target.value))}
            className="max-trades-selector"
          >
            <option value={50}>50 trades</option>
            <option value={100}>100 trades</option>
            <option value={200}>200 trades</option>
          </select>
          <button onClick={clearTrades} className="clear-button">
            🗑️ Clear
          </button>
        </div>
      </div>

      {error && <div className="feed-error">❌ {error}</div>}

      <div className="feed-content">
        <div className="trades-header">
          <span>Time</span>
          <span>Side</span>
          <span>Price</span>
          <span>Size</span>
          <span>Value</span>
        </div>

        <div className="trades-container" ref={tradesContainerRef}>
          {trades.length === 0 ? (
            <div className="no-trades">📊 No trades available</div>
          ) : (
            trades.map((trade, index) => (
              <div
                key={`${trade.id}-${index}`}
                className={`trade-row ${trade.side.toLowerCase()}-trade`}
              >
                <span className="trade-time">
                  {formatTime(trade.timestamp)}
                </span>
                <span className={`trade-side ${trade.side.toLowerCase()}`}>
                  {trade.side === "BUY" ? "🟢 BUY" : "🔴 SELL"}
                </span>
                <span className="trade-price">${formatPrice(trade.price)}</span>
                <span className="trade-quantity">
                  {formatQuantity(trade.quantity)}
                </span>
                <span className="trade-value">
                  {calculateTradeValue(trade.price, trade.quantity)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
