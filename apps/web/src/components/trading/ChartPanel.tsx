import { useState } from "react";
import type { NatsConnection } from "nats.ws";
import { SimpleChart } from "./SimpleChart";
import "./ChartPanel.css";

interface ChartPanelProps {
  symbol: string;
  connection: NatsConnection | null;
}

export function ChartPanel({ symbol, connection }: ChartPanelProps) {
  const [selectedInterval, setSelectedInterval] = useState("1m");
  const [chartHeight, setChartHeight] = useState(400);

  const intervals = [
    { value: "1s", label: "1s" },
    { value: "1m", label: "1m" },
    { value: "5m", label: "5m" },
    { value: "15m", label: "15m" },
    { value: "1h", label: "1h" },
    { value: "4h", label: "4h" },
    { value: "1d", label: "1d" },
  ];

  return (
    <div className="chart-panel">
      <div className="panel-header">
        <div className="header-left">
          <h3>📈 Charts - {symbol}</h3>
        </div>

        <div className="panel-controls">
          <div className="interval-selector">
            <label>Interval:</label>
            <div className="interval-buttons">
              {intervals.map((interval) => (
                <button
                  key={interval.value}
                  className={`interval-button ${
                    selectedInterval === interval.value ? "active" : ""
                  }`}
                  onClick={() => setSelectedInterval(interval.value)}
                >
                  {interval.label}
                </button>
              ))}
            </div>
          </div>

          <div className="height-selector">
            <label>Height:</label>
            <select
              value={chartHeight}
              onChange={(e) => setChartHeight(parseInt(e.target.value))}
              className="height-select"
            >
              <option value={300}>Small (300px)</option>
              <option value={400}>Medium (400px)</option>
              <option value={500}>Large (500px)</option>
              <option value={600}>Extra Large (600px)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="chart-content">
        <SimpleChart
          symbol={symbol}
          connection={connection}
          interval={selectedInterval}
          height={chartHeight}
        />
      </div>
    </div>
  );
}
