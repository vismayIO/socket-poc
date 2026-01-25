import { useState, useEffect, useCallback } from "react";
import type { NatsConnection } from "nats.ws";
import { subscribe } from "../../lib/nats-client";
import "./OrderBookPanel.css";

interface PriceLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

interface OrderBook {
  symbol: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  spread: number;
  lastUpdate: Date;
}

interface OrderBookPanelProps {
  symbol: string;
  connection: NatsConnection | null;
}

export function OrderBookPanel({ symbol, connection }: OrderBookPanelProps) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState(10);

  // Fetch initial order book data
  const fetchOrderBook = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orderbook/${symbol}?levels=${levels}`,
      );
      const data = await response.json();

      if (data.success && data.data) {
        const newOrderBook: OrderBook = {
          symbol: data.data.symbol,
          bids: data.data.bids || [],
          asks: data.data.asks || [],
          spread: data.data.spread || 0,
          lastUpdate: new Date(data.data.lastUpdate || data.timestamp),
        };

        setOrderBook(newOrderBook);
      } else {
        setError(data.error || "Failed to fetch order book");
      }
    } catch (err) {
      console.error("Failed to fetch order book:", err);
      setError("Failed to load order book data");
    } finally {
      setIsLoading(false);
    }
  }, [symbol, levels]);

  // Subscribe to real-time order book updates
  useEffect(() => {
    if (!connection) return;

    let subscription: { unsubscribe: () => void } | null = null;

    try {
      // Subscribe to order book updates for this symbol
      subscription = subscribe(`orderbook.${symbol}`, (data: string) => {
        try {
          const update = JSON.parse(data);

          const newOrderBook: OrderBook = {
            symbol: update.symbol,
            bids: update.bids || [],
            asks: update.asks || [],
            spread: update.spread || 0,
            lastUpdate: new Date(),
          };

          setOrderBook(newOrderBook);
          setError(null);
        } catch (err) {
          console.error("Failed to parse order book update:", err);
        }
      });
    } catch (err) {
      console.error("Failed to subscribe to order book:", err);
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [connection, symbol]);

  // Fetch initial data and set up polling fallback
  useEffect(() => {
    fetchOrderBook();

    // Fallback polling every 2 seconds if no real-time updates
    const interval = setInterval(() => {
      if (!connection) {
        fetchOrderBook();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchOrderBook, connection]);

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

  const calculateMaxQuantity = (levels: PriceLevel[]): number => {
    return Math.max(...levels.map((level) => level.quantity), 1);
  };

  const getQuantityBarWidth = (
    quantity: number,
    maxQuantity: number,
  ): number => {
    return (quantity / maxQuantity) * 100;
  };

  if (isLoading && !orderBook) {
    return (
      <div className="order-book-panel">
        <div className="panel-header">
          <h3>📊 Order Book</h3>
        </div>
        <div className="panel-loading">⏳ Loading order book...</div>
      </div>
    );
  }

  if (error && !orderBook) {
    return (
      <div className="order-book-panel">
        <div className="panel-header">
          <h3>📊 Order Book</h3>
        </div>
        <div className="panel-error">❌ {error}</div>
      </div>
    );
  }

  if (!orderBook) {
    return (
      <div className="order-book-panel">
        <div className="panel-header">
          <h3>📊 Order Book</h3>
        </div>
        <div className="panel-no-data">📊 No order book data available</div>
      </div>
    );
  }

  const maxBidQuantity =
    orderBook.bids.length > 0 ? calculateMaxQuantity(orderBook.bids) : 1;
  const maxAskQuantity =
    orderBook.asks.length > 0 ? calculateMaxQuantity(orderBook.asks) : 1;

  return (
    <div className="order-book-panel">
      <div className="panel-header">
        <div className="header-left">
          <h3>📊 Order Book - {orderBook.symbol}</h3>
          <div className="spread-info">
            Spread: ${formatPrice(orderBook.spread)}
          </div>
        </div>
        <div className="header-controls">
          <select
            value={levels}
            onChange={(e) => setLevels(parseInt(e.target.value))}
            className="levels-selector"
          >
            <option value={5}>5 Levels</option>
            <option value={10}>10 Levels</option>
            <option value={20}>20 Levels</option>
          </select>
        </div>
      </div>

      <div className="order-book-content">
        {/* Asks (Sell Orders) - Top half */}
        <div className="asks-section">
          <div className="section-header asks-header">
            <span>Price</span>
            <span>Size</span>
            <span>Orders</span>
          </div>
          <div className="price-levels asks-levels">
            {orderBook.asks
              .slice(0, levels)
              .reverse()
              .map((level, index) => (
                <div key={`ask-${index}`} className="price-level ask-level">
                  <div
                    className="quantity-bar ask-bar"
                    style={{
                      width: `${getQuantityBarWidth(level.quantity, maxAskQuantity)}%`,
                    }}
                  />
                  <div className="level-content">
                    <span className="price ask-price">
                      ${formatPrice(level.price)}
                    </span>
                    <span className="quantity">
                      {formatQuantity(level.quantity)}
                    </span>
                    <span className="orders">{level.orderCount}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Spread Indicator */}
        <div className="spread-section">
          <div className="spread-value">
            Spread: ${formatPrice(orderBook.spread)}
          </div>
          <div className="last-update">
            Updated: {orderBook.lastUpdate.toLocaleTimeString()}
          </div>
        </div>

        {/* Bids (Buy Orders) - Bottom half */}
        <div className="bids-section">
          <div className="price-levels bids-levels">
            {orderBook.bids.slice(0, levels).map((level, index) => (
              <div key={`bid-${index}`} className="price-level bid-level">
                <div
                  className="quantity-bar bid-bar"
                  style={{
                    width: `${getQuantityBarWidth(level.quantity, maxBidQuantity)}%`,
                  }}
                />
                <div className="level-content">
                  <span className="price bid-price">
                    ${formatPrice(level.price)}
                  </span>
                  <span className="quantity">
                    {formatQuantity(level.quantity)}
                  </span>
                  <span className="orders">{level.orderCount}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="section-header bids-header">
            <span>Price</span>
            <span>Size</span>
            <span>Orders</span>
          </div>
        </div>
      </div>
    </div>
  );
}
