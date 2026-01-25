import { useEffect, useRef, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import "chartjs-adapter-date-fns";
import type { NatsConnection } from "nats.ws";
import { subscribe } from "../../lib/nats-client";
import "./CandlestickChart.css";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
);

interface OHLCV {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount?: number;
}

interface TechnicalIndicator {
  timestamp: Date;
  value: number;
}

interface CandlestickChartProps {
  symbol: string;
  connection: NatsConnection | null;
  interval: string;
  height?: number;
}

export function CandlestickChart({
  symbol,
  connection,
  interval = "1m",
  height = 400,
}: CandlestickChartProps) {
  const chartRef = useRef<ChartJS>(null);
  const [ohlcvData, setOhlcvData] = useState<OHLCV[]>([]);
  const [smaData, setSmaData] = useState<TechnicalIndicator[]>([]);
  const [emaData, setEmaData] = useState<TechnicalIndicator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showVolume, setShowVolume] = useState(true);
  const [showSMA, setShowSMA] = useState(false);
  const [showEMA, setShowEMA] = useState(false);
  const [chartType, setChartType] = useState<"candlestick" | "line" | "area">(
    "candlestick",
  );

  // Fetch OHLCV data
  const fetchOHLCVData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/v1/ohlcv/${symbol}?interval=${interval}&limit=100`,
      );
      const data = await response.json();

      if (data.success && data.data) {
        const ohlcv: OHLCV[] = data.data
          .map((item: any) => ({
            timestamp: new Date(item.timestamp),
            open: item.openPrice,
            high: item.highPrice,
            low: item.lowPrice,
            close: item.closePrice,
            volume: parseInt(item.volume),
            tradeCount: item.tradeCount,
          }))
          .reverse(); // Reverse to get chronological order

        setOhlcvData(ohlcv);
      } else {
        setError(data.error || "Failed to fetch OHLCV data");
      }
    } catch (err) {
      console.error("Failed to fetch OHLCV data:", err);
      setError("Failed to load chart data");
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval]);

  // Fetch technical indicators
  const fetchTechnicalIndicators = useCallback(async () => {
    if (!showSMA && !showEMA) return;

    try {
      const promises = [];

      if (showSMA) {
        promises.push(
          fetch(`/api/v1/analytics/sma/${symbol}?period=20&limit=100`)
            .then((res) => res.json())
            .then((data) => ({ type: "sma", data })),
        );
      }

      if (showEMA) {
        promises.push(
          fetch(`/api/v1/analytics/ema/${symbol}?period=20&limit=100`)
            .then((res) => res.json())
            .then((data) => ({ type: "ema", data })),
        );
      }

      const results = await Promise.all(promises);

      results.forEach((result) => {
        if (result.data.success && result.data.data) {
          const indicators: TechnicalIndicator[] = result.data.data.map(
            (item: any) => ({
              timestamp: new Date(item.timestamp),
              value: item.value,
            }),
          );

          if (result.type === "sma") {
            setSmaData(indicators);
          } else if (result.type === "ema") {
            setEmaData(indicators);
          }
        }
      });
    } catch (err) {
      console.error("Failed to fetch technical indicators:", err);
    }
  }, [symbol, showSMA, showEMA]);

  // Subscribe to real-time OHLCV updates
  useEffect(() => {
    if (!connection) return;

    let subscription: { unsubscribe: () => void } | null = null;

    try {
      subscription = subscribe(
        `ohlcv.${symbol}.${interval}`,
        (data: string) => {
          try {
            const update = JSON.parse(data);

            const newCandle: OHLCV = {
              timestamp: new Date(update.timestamp),
              open: update.open,
              high: update.high,
              low: update.low,
              close: update.close,
              volume: update.volume,
              tradeCount: update.tradeCount,
            };

            setOhlcvData((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;

              // Update the last candle if it's the same timestamp, otherwise add new
              if (
                lastIndex >= 0 &&
                updated[lastIndex].timestamp.getTime() ===
                  newCandle.timestamp.getTime()
              ) {
                updated[lastIndex] = newCandle;
              } else {
                updated.push(newCandle);
                // Keep only the last 100 candles
                if (updated.length > 100) {
                  updated.shift();
                }
              }

              return updated;
            });

            setError(null);
          } catch (err) {
            console.error("Failed to parse OHLCV update:", err);
          }
        },
      );
    } catch (err) {
      console.error("Failed to subscribe to OHLCV updates:", err);
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [connection, symbol, interval]);

  // Fetch data on mount and when dependencies change
  useEffect(() => {
    fetchOHLCVData();
  }, [fetchOHLCVData]);

  useEffect(() => {
    fetchTechnicalIndicators();
  }, [fetchTechnicalIndicators]);

  // Prepare chart data
  const prepareChartData = () => {
    if (ohlcvData.length === 0) return null;

    const labels = ohlcvData.map((candle) => candle.timestamp);

    const datasets = [];

    if (chartType === "candlestick") {
      // Create candlestick using bar chart with custom styling
      datasets.push({
        label: "Price",
        data: ohlcvData.map((candle) => ({
          x: candle.timestamp,
          o: candle.open,
          h: candle.high,
          l: candle.low,
          c: candle.close,
        })),
        backgroundColor: ohlcvData.map((candle) =>
          candle.close >= candle.open ? "#28a745" : "#dc3545",
        ),
        borderColor: ohlcvData.map((candle) =>
          candle.close >= candle.open ? "#28a745" : "#dc3545",
        ),
        borderWidth: 1,
      });
    } else if (chartType === "line") {
      datasets.push({
        label: "Close Price",
        data: ohlcvData.map((candle) => ({
          x: candle.timestamp,
          y: candle.close,
        })),
        borderColor: "#007bff",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
      });
    } else if (chartType === "area") {
      datasets.push({
        label: "Close Price",
        data: ohlcvData.map((candle) => ({
          x: candle.timestamp,
          y: candle.close,
        })),
        borderColor: "#007bff",
        backgroundColor: "rgba(0, 123, 255, 0.1)",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
      });
    }

    // Add SMA line
    if (showSMA && smaData.length > 0) {
      datasets.push({
        label: "SMA (20)",
        data: smaData.map((point) => ({
          x: point.timestamp,
          y: point.value,
        })),
        borderColor: "#ffc107",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
      });
    }

    // Add EMA line
    if (showEMA && emaData.length > 0) {
      datasets.push({
        label: "EMA (20)",
        data: emaData.map((point) => ({
          x: point.timestamp,
          y: point.value,
        })),
        borderColor: "#fd7e14",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
      });
    }

    return { labels, datasets };
  };

  const chartData = prepareChartData();

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top",
        labels: {
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          title: (context) => {
            return new Date(context[0].parsed.x).toLocaleString();
          },
          label: (context) => {
            const datasetLabel = context.dataset.label || "";
            if (
              chartType === "candlestick" &&
              context.raw &&
              typeof context.raw === "object"
            ) {
              const data = context.raw as any;
              return [
                `${datasetLabel}:`,
                `Open: $${data.o?.toFixed(4)}`,
                `High: $${data.h?.toFixed(4)}`,
                `Low: $${data.l?.toFixed(4)}`,
                `Close: $${data.c?.toFixed(4)}`,
              ];
            }
            return `${datasetLabel}: $${context.parsed.y?.toFixed(4)}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: "time",
        time: {
          displayFormats: {
            minute: "HH:mm",
            hour: "HH:mm",
            day: "MMM dd",
          },
        },
        title: {
          display: true,
          text: "Time",
        },
      },
      y: {
        title: {
          display: true,
          text: "Price ($)",
        },
        grid: {
          color: "rgba(0,0,0,0.1)",
        },
      },
    },
    elements: {
      point: {
        radius: 0,
        hoverRadius: 4,
      },
    },
  };

  if (isLoading) {
    return (
      <div className="candlestick-chart">
        <div className="chart-header">
          <h3>📊 Price Chart</h3>
        </div>
        <div className="chart-loading">⏳ Loading chart data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="candlestick-chart">
        <div className="chart-header">
          <h3>📊 Price Chart</h3>
        </div>
        <div className="chart-error">❌ {error}</div>
      </div>
    );
  }

  if (!chartData || ohlcvData.length === 0) {
    return (
      <div className="candlestick-chart">
        <div className="chart-header">
          <h3>📊 Price Chart</h3>
        </div>
        <div className="chart-no-data">📊 No chart data available</div>
      </div>
    );
  }

  return (
    <div className="candlestick-chart">
      <div className="chart-header">
        <div className="header-left">
          <h3>
            📊 {symbol} - {interval.toUpperCase()}
          </h3>
          <div className="chart-info">{ohlcvData.length} candles</div>
        </div>

        <div className="chart-controls">
          <div className="chart-type-selector">
            <label>Type:</label>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as any)}
            >
              <option value="candlestick">Candlestick</option>
              <option value="line">Line</option>
              <option value="area">Area</option>
            </select>
          </div>

          <div className="indicator-toggles">
            <label>
              <input
                type="checkbox"
                checked={showSMA}
                onChange={(e) => setShowSMA(e.target.checked)}
              />
              SMA
            </label>
            <label>
              <input
                type="checkbox"
                checked={showEMA}
                onChange={(e) => setShowEMA(e.target.checked)}
              />
              EMA
            </label>
            <label>
              <input
                type="checkbox"
                checked={showVolume}
                onChange={(e) => setShowVolume(e.target.checked)}
              />
              Volume
            </label>
          </div>

          <button
            onClick={fetchOHLCVData}
            disabled={isLoading}
            className="refresh-button"
          >
            {isLoading ? "⏳" : "🔄"}
          </button>
        </div>
      </div>

      <div className="chart-container" style={{ height }}>
        <Chart ref={chartRef} type="line" data={chartData} options={options} />
      </div>

      {showVolume && (
        <div className="volume-chart">
          <div className="volume-bars">
            {ohlcvData.slice(-20).map((candle, index) => {
              const maxVolume = Math.max(
                ...ohlcvData.slice(-20).map((c) => c.volume),
              );
              const height = (candle.volume / maxVolume) * 60;
              const color = candle.close >= candle.open ? "#28a745" : "#dc3545";

              return (
                <div
                  key={index}
                  className="volume-bar"
                  style={{
                    height: `${height}px`,
                    backgroundColor: color,
                    opacity: 0.6,
                  }}
                  title={`Volume: ${candle.volume.toLocaleString()}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
