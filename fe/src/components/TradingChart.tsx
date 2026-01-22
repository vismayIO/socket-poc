import { useEffect, useState, useRef } from "react";
import { connect, StringCodec, type NatsConnection, type Subscription } from "nats.ws";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface TradingData {
  timestamp: number;
  price: number;
  volume: number;
  symbol: string;
}

const MAX_DATA_POINTS = 100;

export function TradingChart() {
  const [data, setData] = useState<TradingData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const natsConnectionRef = useRef<NatsConnection | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const sc = StringCodec();

  const connectNATS = async () => {
    try {
      const natsUrl = "ws://localhost:8080";

      console.log(`Connecting to NATS at ${natsUrl}...`);
      const nc = await connect({
        servers: natsUrl,
      });

      natsConnectionRef.current = nc;
      setIsConnected(true);
      setError(null);
      console.log("✅ Connected to NATS");

      // Subscribe to trading data
      const sub = nc.subscribe("trading.data");
      subscriptionRef.current = sub;

      // Handle incoming messages
      (async () => {
        for await (const msg of sub) {
          try {
            const decoded = sc.decode(msg.data);
            const tradingData: TradingData = JSON.parse(decoded);

            setData((prev) => {
              const newData = [...prev, tradingData];
              const updated = newData.slice(-MAX_DATA_POINTS); // Keep last 100 points

              // Calculate price change
              if (updated.length > 1) {
                const change = tradingData.price - updated[updated.length - 2]?.price;
                setPriceChange(change);
              }

              return updated;
            });

            setCurrentPrice(tradingData.price);
          } catch (err) {
            console.error("Error parsing message:", err);
          }
        }
      })().catch((err) => {
        console.error("Error in subscription loop:", err);
      });

      // Handle connection close
      nc.closed().then(() => {
        console.log("NATS connection closed");
        setIsConnected(false);
        natsConnectionRef.current = null;
        subscriptionRef.current = null;

        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            console.log("Attempting to reconnect to NATS...");
            connectNATS();
          }, 3000);
        }
      });
    } catch (err) {
      console.error("Failed to connect to NATS:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to NATS server");
      setIsConnected(false);
      natsConnectionRef.current = null;

      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log("Attempting to reconnect to NATS...");
          connectNATS();
        }, 3000);
      }
    }
  };

  useEffect(() => {
    connectNATS();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      if (natsConnectionRef.current) {
        natsConnectionRef.current.close();
        natsConnectionRef.current = null;
      }
    };
  }, []);

  // Format data for chart
  const chartData = data.map((item) => ({
    time: new Date(item.timestamp).toLocaleTimeString(),
    price: item.price,
    volume: item.volume,
    timestamp: item.timestamp,
  }));

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Trading Chart</CardTitle>
              <CardDescription>
                Real-time price updates via NATS WebSocket
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              {currentPrice !== null && (
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {formatPrice(currentPrice)}
                  </div>
                  <div
                    className={`text-sm ${priceChange >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                  >
                    {priceChange >= 0 ? "+" : ""}
                    {formatPrice(priceChange)}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"
                    }`}
                  title={isConnected ? "Connected" : "Disconnected"}
                />
                <span className="text-sm text-muted-foreground">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-400">
              {error}
              <div className="text-xs mt-2">
                Make sure NATS server is running with WebSocket enabled on port 8080
              </div>
            </div>
          )}

          {data.length === 0 ? (
            <div className="h-[500px] flex items-center justify-center">
              <p className="text-muted-foreground">
                Waiting for trading data...
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      dataKey="time"
                      stroke="#888888"
                      fontSize={10}
                      tick={{ fill: "#888888" }}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={10}
                      tick={{ fill: "#888888" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(255, 255, 255, 0.95)",
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="volume"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="text-sm text-muted-foreground text-center">
                Showing {data.length} data point{data.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
