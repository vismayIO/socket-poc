import { useState, useEffect, useCallback } from "react";
import type { NatsConnection } from "nats.ws";
import { subscribe } from "../../lib/nats-client";
import "./PortfolioPanel.css";

interface PortfolioPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  lastUpdate: Date;
}

interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

interface PortfolioPanelProps {
  connection: NatsConnection | null;
  onSymbolSelect?: (symbol: string) => void;
}

export function PortfolioPanel({
  connection,
  onSymbolSelect,
}: PortfolioPanelProps) {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [newPosition, setNewPosition] = useState({
    symbol: "",
    quantity: "",
    averagePrice: "",
  });
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);

  // Load portfolio from localStorage
  const loadPortfolio = useCallback(() => {
    try {
      const saved = localStorage.getItem("trading-portfolio");
      if (saved) {
        const portfolioData = JSON.parse(saved) as Array<{
          symbol: string;
          quantity: number;
          averagePrice: number;
        }>;

        // Initialize positions with saved data
        const initialPositions: PortfolioPosition[] = portfolioData.map(
          (pos) => ({
            symbol: pos.symbol,
            quantity: pos.quantity,
            averagePrice: pos.averagePrice,
            currentPrice: 0,
            marketValue: 0,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
            lastUpdate: new Date(),
          }),
        );

        setPositions(initialPositions);

        // Fetch current prices for positions
        fetchPositionPrices(portfolioData.map((p) => p.symbol));
      }
    } catch (err) {
      console.error("Failed to load portfolio:", err);
    }
  }, []);

  // Save portfolio to localStorage
  const savePortfolio = useCallback((positions: PortfolioPosition[]) => {
    try {
      const portfolioData = positions.map((pos) => ({
        symbol: pos.symbol,
        quantity: pos.quantity,
        averagePrice: pos.averagePrice,
      }));
      localStorage.setItem("trading-portfolio", JSON.stringify(portfolioData));
    } catch (err) {
      console.error("Failed to save portfolio:", err);
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

  // Fetch current prices for positions
  const fetchPositionPrices = useCallback(async (symbols: string[]) => {
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
              currentPrice: data.data.lastPrice,
              lastUpdate: new Date(data.data.lastTime || data.timestamp),
            };
          }
          return null;
        } catch (err) {
          console.error(`Failed to fetch price for ${symbol}:`, err);
          return null;
        }
      });

      const results = await Promise.all(promises);
      const validResults = results.filter(
        (
          result,
        ): result is {
          symbol: string;
          currentPrice: number;
          lastUpdate: Date;
        } => result !== null,
      );

      setPositions((prev) => {
        const updated = prev.map((pos) => {
          const priceData = validResults.find((r) => r.symbol === pos.symbol);
          if (priceData) {
            const marketValue = pos.quantity * priceData.currentPrice;
            const costBasis = pos.quantity * pos.averagePrice;
            const unrealizedPnL = marketValue - costBasis;
            const unrealizedPnLPercent =
              costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

            return {
              ...pos,
              currentPrice: priceData.currentPrice,
              marketValue,
              unrealizedPnL,
              unrealizedPnLPercent,
              lastUpdate: priceData.lastUpdate,
            };
          }
          return pos;
        });

        // Calculate portfolio summary
        calculateSummary(updated);

        return updated;
      });
    } catch (err) {
      console.error("Failed to fetch position prices:", err);
      setError("Failed to load position prices");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Calculate portfolio summary
  const calculateSummary = useCallback((positions: PortfolioPosition[]) => {
    const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
    const totalCost = positions.reduce(
      (sum, pos) => sum + pos.quantity * pos.averagePrice,
      0,
    );
    const totalPnL = totalValue - totalCost;
    const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    setSummary({
      totalValue,
      totalCost,
      totalPnL,
      totalPnLPercent,
      dayChange: 0, // Would need historical data to calculate
      dayChangePercent: 0,
    });
  }, []);

  // Subscribe to real-time price updates
  useEffect(() => {
    if (!connection || positions.length === 0) return;

    const subscriptions: { unsubscribe: () => void }[] = [];

    try {
      positions.forEach((pos) => {
        const subscription = subscribe(
          `quotes.${pos.symbol}`,
          (data: string) => {
            try {
              const update = JSON.parse(data);

              setPositions((prev) => {
                const updated = prev.map((p) => {
                  if (p.symbol === pos.symbol) {
                    const currentPrice = update.lastPrice || update.price;
                    const marketValue = p.quantity * currentPrice;
                    const costBasis = p.quantity * p.averagePrice;
                    const unrealizedPnL = marketValue - costBasis;
                    const unrealizedPnLPercent =
                      costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

                    return {
                      ...p,
                      currentPrice,
                      marketValue,
                      unrealizedPnL,
                      unrealizedPnLPercent,
                      lastUpdate: new Date(),
                    };
                  }
                  return p;
                });

                calculateSummary(updated);
                return updated;
              });

              setError(null);
            } catch (err) {
              console.error(`Failed to parse update for ${pos.symbol}:`, err);
            }
          },
        );

        subscriptions.push(subscription);
      });
    } catch (err) {
      console.error("Failed to subscribe to position updates:", err);
    }

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [connection, positions.length, calculateSummary]);

  // Load data on mount
  useEffect(() => {
    loadPortfolio();
    fetchAvailableSymbols();
  }, [loadPortfolio, fetchAvailableSymbols]);

  // Add new position
  const addPosition = useCallback(() => {
    const { symbol, quantity, averagePrice } = newPosition;

    if (!symbol || !quantity || !averagePrice) {
      return;
    }

    const qty = parseFloat(quantity);
    const price = parseFloat(averagePrice);

    if (qty <= 0 || price <= 0) {
      return;
    }

    // Check if position already exists
    const existingIndex = positions.findIndex((pos) => pos.symbol === symbol);

    let updatedPositions: PortfolioPosition[];

    if (existingIndex >= 0) {
      // Update existing position (average down/up)
      const existing = positions[existingIndex];
      const totalQuantity = existing.quantity + qty;
      const totalCost = existing.quantity * existing.averagePrice + qty * price;
      const newAveragePrice = totalCost / totalQuantity;

      updatedPositions = [...positions];
      updatedPositions[existingIndex] = {
        ...existing,
        quantity: totalQuantity,
        averagePrice: newAveragePrice,
      };
    } else {
      // Add new position
      const newPos: PortfolioPosition = {
        symbol,
        quantity: qty,
        averagePrice: price,
        currentPrice: 0,
        marketValue: 0,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        lastUpdate: new Date(),
      };

      updatedPositions = [...positions, newPos];
    }

    setPositions(updatedPositions);
    savePortfolio(updatedPositions);

    // Fetch current price for the symbol
    fetchPositionPrices([symbol]);

    // Reset form
    setNewPosition({ symbol: "", quantity: "", averagePrice: "" });
    setShowAddPosition(false);
  }, [newPosition, positions, savePortfolio, fetchPositionPrices]);

  // Remove position
  const removePosition = useCallback(
    (symbol: string) => {
      const updatedPositions = positions.filter((pos) => pos.symbol !== symbol);
      setPositions(updatedPositions);
      savePortfolio(updatedPositions);
      calculateSummary(updatedPositions);
    },
    [positions, savePortfolio, calculateSummary],
  );

  const formatPrice = (price: number): string => {
    return price.toFixed(4);
  };

  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatPercent = (percent: number): string => {
    const sign = percent >= 0 ? "+" : "";
    return `${sign}${percent.toFixed(2)}%`;
  };

  return (
    <div className="portfolio-panel">
      <div className="panel-header">
        <div className="header-left">
          <h3>💼 Portfolio</h3>
          <div className="position-count">{positions.length} positions</div>
        </div>

        <div className="header-controls">
          <button
            onClick={() => setShowAddPosition(!showAddPosition)}
            className="add-position-button"
          >
            ➕ Add Position
          </button>
        </div>
      </div>

      {/* Portfolio Summary */}
      {summary && (
        <div className="portfolio-summary">
          <div className="summary-item">
            <div className="summary-label">Total Value</div>
            <div className="summary-value">
              {formatCurrency(summary.totalValue)}
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Total P&L</div>
            <div
              className={`summary-value ${summary.totalPnL >= 0 ? "positive" : "negative"}`}
            >
              {formatCurrency(summary.totalPnL)} (
              {formatPercent(summary.totalPnLPercent)})
            </div>
          </div>
        </div>
      )}

      {/* Add Position Form */}
      {showAddPosition && (
        <div className="add-position-form">
          <div className="form-row">
            <select
              value={newPosition.symbol}
              onChange={(e) =>
                setNewPosition((prev) => ({ ...prev, symbol: e.target.value }))
              }
              className="form-select"
            >
              <option value="">Select symbol...</option>
              {availableSymbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <input
              type="number"
              placeholder="Quantity"
              value={newPosition.quantity}
              onChange={(e) =>
                setNewPosition((prev) => ({
                  ...prev,
                  quantity: e.target.value,
                }))
              }
              className="form-input"
              min="0"
              step="0.01"
            />
            <input
              type="number"
              placeholder="Average Price"
              value={newPosition.averagePrice}
              onChange={(e) =>
                setNewPosition((prev) => ({
                  ...prev,
                  averagePrice: e.target.value,
                }))
              }
              className="form-input"
              min="0"
              step="0.0001"
            />
          </div>
          <div className="form-actions">
            <button onClick={addPosition} className="save-button">
              💾 Save Position
            </button>
            <button
              onClick={() => setShowAddPosition(false)}
              className="cancel-button"
            >
              ❌ Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div className="panel-error">❌ {error}</div>}

      <div className="portfolio-content">
        {positions.length === 0 ? (
          <div className="empty-portfolio">
            💼 No positions in portfolio
            <div className="empty-subtitle">
              Add positions to track your P&L
            </div>
          </div>
        ) : (
          <div className="position-list">
            {positions.map((position) => (
              <div
                key={position.symbol}
                className="position-item"
                onClick={() => onSymbolSelect?.(position.symbol)}
              >
                <div className="position-header">
                  <div className="position-symbol">{position.symbol}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePosition(position.symbol);
                    }}
                    className="remove-button"
                    title="Remove position"
                  >
                    ×
                  </button>
                </div>

                <div className="position-details">
                  <div className="detail-row">
                    <span className="detail-label">Quantity:</span>
                    <span className="detail-value">
                      {position.quantity.toLocaleString()}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Avg Price:</span>
                    <span className="detail-value">
                      ${formatPrice(position.averagePrice)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Current:</span>
                    <span className="detail-value">
                      ${formatPrice(position.currentPrice)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Market Value:</span>
                    <span className="detail-value">
                      {formatCurrency(position.marketValue)}
                    </span>
                  </div>
                </div>

                <div
                  className={`position-pnl ${position.unrealizedPnL >= 0 ? "positive" : "negative"}`}
                >
                  <div className="pnl-amount">
                    {formatCurrency(position.unrealizedPnL)}
                  </div>
                  <div className="pnl-percent">
                    ({formatPercent(position.unrealizedPnLPercent)})
                  </div>
                </div>

                <div className="position-update">
                  {position.lastUpdate.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
