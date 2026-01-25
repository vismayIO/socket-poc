import { useState, useEffect, useCallback } from "react";
import type { NatsConnection } from "nats.ws";
import { subscribe } from "../../lib/nats-client";
import "./PriceTicker.css";

interface Quote {
  symbol: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  volume: number;
  high: number;
  low: number;
  lastUpdate: Date;
}

interface PriceTickerProps {
  symbol: string;
  connection: NatsConnection | null;
}

export function PriceTicker({ symbol, connection }: PriceTickerProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceAnimation, setPriceAnimation] = useState<"up" | "down" | null>(
    null,
  );

  // Fetch initial quote data
  const fetchQuote = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/quotes/${symbol}`);
      const data = await response.json();

      if (data.success && data.data) {
        const newQuote: Quote = {
          ...data.data,
          lastUpdate: new Date(data.data.lastTime || data.timestamp),
        };

        // Trigger price animation if price changed
        if (quote && quote.lastPrice !== newQuote.lastPrice) {
          setPriceAnimation(
            newQuote.lastPrice > quote.lastPrice ? "up" : "down",
          );
          setTimeout(() => setPriceAnimation(null), 1000);
        }

        setQuote(newQuote);
      } else {
        setError(data.error || "Failed to fetch quote");
      }
    } catch (err) {
      console.error("Failed to fetch quote:", err);
      setError("Failed to load quote data");
    } finally {
      setIsLoading(false);
    }
  }, [symbol, quote]);

  // Subscribe to real-time quote updates
  useEffect(() => {
    if (!connection) return;

    let subscription: { unsubscribe: () => void } | null = null;

    try {
      // Subscribe to quote updates for this symbol
      subscription = subscribe(`quotes.${symbol}`, (data: string) => {
        try {
          const quoteUpdate = JSON.parse(data);

          const newQuote: Quote = {
            symbol: quoteUpdate.symbol,
            lastPrice: quoteUpdate.lastPrice || quoteUpdate.price,
            change: quoteUpdate.change || 0,
            changePercent: quoteUpdate.changePercent || 0,
            bid: quoteUpdate.bid,
            ask: quoteUpdate.ask,
            volume: quoteUpdate.volume || 0,
            high: quoteUpdate.high || quoteUpdate.lastPrice,
            low: quoteUpdate.low || quoteUpdate.lastPrice,
            lastUpdate: new Date(),
          };

          // Trigger price animation
          if (quote && quote.lastPrice !== newQuote.lastPrice) {
            setPriceAnimation(
              newQuote.lastPrice > quote.lastPrice ? "up" : "down",
            );
            setTimeout(() => setPriceAnimation(null), 1000);
          }

          setQuote(newQuote);
          setError(null);
        } catch (err) {
          console.error("Failed to parse quote update:", err);
        }
      });
    } catch (err) {
      console.error("Failed to subscribe to quotes:", err);
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [connection, symbol, quote]);

  // Fetch initial data and set up polling fallback
  useEffect(() => {
    fetchQuote();

    // Fallback polling every 5 seconds if no real-time updates
    const interval = setInterval(() => {
      if (!connection) {
        fetchQuote();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchQuote, connection]);

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

  if (isLoading && !quote) {
    return (
      <div className="price-ticker">
        <div className="ticker-header">
          <h3>💰 Price Ticker</h3>
        </div>
        <div className="ticker-loading">⏳ Loading price data...</div>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="price-ticker">
        <div className="ticker-header">
          <h3>💰 Price Ticker</h3>
        </div>
        <div className="ticker-error">❌ {error}</div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="price-ticker">
        <div className="ticker-header">
          <h3>💰 Price Ticker</h3>
        </div>
        <div className="ticker-no-data">📊 No price data available</div>
      </div>
    );
  }

  return (
    <div className="price-ticker">
      <div className="ticker-header">
        <h3>💰 Price Ticker - {quote.symbol}</h3>
        <div className="last-update">
          Last: {quote.lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      <div className="ticker-content">
        <div className="price-section">
          <div className="main-price">
            <div className={`price-value ${priceAnimation || ""}`}>
              ${formatPrice(quote.lastPrice)}
            </div>
            <div
              className={`price-change ${quote.change >= 0 ? "positive" : "negative"}`}
            >
              {quote.change >= 0 ? "▲" : "▼"} $
              {Math.abs(quote.change).toFixed(4)} (
              {formatPercent(quote.changePercent)})
            </div>
          </div>

          <div className="bid-ask-section">
            <div className="bid-ask-item">
              <div className="label">Bid</div>
              <div className="value bid-price">${formatPrice(quote.bid)}</div>
            </div>
            <div className="spread-indicator">
              <div className="label">Spread</div>
              <div className="value">${formatPrice(quote.ask - quote.bid)}</div>
            </div>
            <div className="bid-ask-item">
              <div className="label">Ask</div>
              <div className="value ask-price">${formatPrice(quote.ask)}</div>
            </div>
          </div>
        </div>

        <div className="stats-section">
          <div className="stat-item">
            <div className="stat-label">Volume</div>
            <div className="stat-value">{formatVolume(quote.volume)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">High</div>
            <div className="stat-value high-price">
              ${formatPrice(quote.high)}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Low</div>
            <div className="stat-value low-price">
              ${formatPrice(quote.low)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
