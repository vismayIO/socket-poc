import { useEffect, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import "chartjs-adapter-date-fns";
import type { NatsConnection } from "nats.ws";
import { subscribe } from "../../lib/nats-client";
import "./SimpleChart.css";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
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

interface SimpleChartProps {
  symbol: string;
  connection: NatsConnection | null;
  interval: string;
  height?: number;
}

export function SimpleChart({
  symbol,
  connection,
  interval = "1m",
  height = 400,
}: SimpleChartProps) {
  const [ohlcvData, setOhlcvData] = useState<OHLCV[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<"line" | "area">("line");

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
          .map(
            (item: {
              timestamp: string;
              openPrice: number;
              highPrice: number;
              lowPrice: number;
              closePrice: number;
              volume: string;
              tradeCount: number;
            }) => ({
              timestamp: new Date(item.timestamp),
              open: item.openPrice,
              high: item.highPrice,
              low: item.lowPrice,
              close: item.closePrice,
              volume: parseInt(item.volume),
              tradeCount: item.tradeCount,
            }),
          )
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

  // Prepare chart data
  const prepareChartData = () => {
    if (ohlcvData.length === 0) return null;

    return {
      labels: ohlcvData.map((candle) => candle.timestamp),
      datasets: [
        {
          label: "Close Price",
          data: ohlcvData.map((candle) => candle.close),
          borderColor: "#007bff",
          backgroundColor:
            chartType === "area" ? "rgba(0, 123, 255, 0.1)" : "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: chartType === "area",
          tension: 0.1,
        },
      ],
    };
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
            const index = context[0].dataIndex;
            return ohlcvData[index]?.timestamp.toLocaleString() || "";
          },
          label: (context) => {
            const index = context.dataIndex;
            const candle = ohlcvData[index];
            if (candle) {
              return [
                `Close: $${candle.close.toFixed(4)}`,
                `Open: $${candle.open.toFixed(4)}`,
                `High: $${candle.high.toFixed(4)}`,
                `Low: $${candle.low.toFixed(4)}`,
                `Volume: ${candle.volume.toLocaleString()}`,
              ];
            }
            return `Close: $${(context.parsed.y || 0).toFixed(4)}`;
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
      <div className="simple-chart">
        <div className="chart-header">
          <h3>📊 Price Chart</h3>
        </div>
        <div className="chart-loading">⏳ Loading chart data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="simple-chart">
        <div className="chart-header">
          <h3>📊 Price Chart</h3>
        </div>
        <div className="chart-error">❌ {error}</div>
      </div>
    );
  }

  if (!chartData || ohlcvData.length === 0) {
    return (
      <div className="simple-chart">
        <div className="chart-header">
          <h3>📊 Price Chart</h3>
        </div>
        <div className="chart-no-data">📊 No chart data available</div>
      </div>
    );
  }

  return (
    <div className="simple-chart">
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
              onChange={(e) => setChartType(e.target.value as "line" | "area")}
            >
              <option value="line">Line</option>
              <option value="area">Area</option>
            </select>
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
        <Line data={chartData} options={options} />
      </div>

      <div className="volume-chart">
        <div className="volume-bars">
          {ohlcvData.slice(-20).map((candle, index) => {
            const maxVolume = Math.max(
              ...ohlcvData.slice(-20).map((c) => c.volume),
            );
            const barHeight = (candle.volume / maxVolume) * 60;
            const color = candle.close >= candle.open ? "#28a745" : "#dc3545";

            return (
              <div
                key={index}
                className="volume-bar"
                style={{
                  height: `${barHeight}px`,
                  backgroundColor: color,
                  opacity: 0.6,
                }}
                title={`Volume: ${candle.volume.toLocaleString()}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
