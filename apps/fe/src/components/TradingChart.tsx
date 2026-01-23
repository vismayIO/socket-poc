import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connect, credsAuthenticator, StringCodec, type NatsConnection, type Subscription } from "nats.ws";
import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, type IChartApi, type ISeriesApi, type Time, AreaSeries } from "lightweight-charts";

interface TradingData {
  timestamp: number;
  price: number;
  volume: number;
  symbol: string;
}

interface TradingChartProps {
  credentials?: {
    jwt: string;
    nkeySeed: string;
    nkeyPublic: string;
    userId: string;
    credsFile?: string;
  };
}

export function TradingChart({ credentials }: TradingChartProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);

  const natsConnectionRef = useRef<NatsConnection | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  const sc = StringCodec();

  // Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#2962FF',
      topColor: '#2962FF',
      bottomColor: 'rgba(41, 98, 255, 0.28)',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // Also use ResizeObserver for container resize not just window
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  const connectNATS = async () => {
    if (!credentials) {
      setError("Authentication required. Please login first.");
      return;
    }

    try {
      const natsUrl = "ws://localhost:8080";
      console.log(`Connecting to NATS at ${natsUrl} with JWT + NKey authentication...`);

      const credsContent = credentials.credsFile;
      if (!credsContent) {
        throw new Error("Credentials file content missing");
      }

      const credsBytes = new TextEncoder().encode(credsContent);
      const authenticator = credsAuthenticator(credsBytes);

      const nc = await connect({
        servers: natsUrl,
        authenticator,
      });

      natsConnectionRef.current = nc;
      setIsConnected(true);
      setError(null);
      console.log("✅ Connected to NATS");

      const sub = nc.subscribe("trading.data");
      subscriptionRef.current = sub;

      // Handle incoming messages
      (async () => {
        for await (const msg of sub) {
          try {
            const decoded = sc.decode(msg.data);
            const tradingData: TradingData = JSON.parse(decoded);

            // Update Price State
            setCurrentPrice(prevPrice => {
              if (prevPrice !== null) {
                setPriceChange(tradingData.price - prevPrice);
              }
              return tradingData.price;
            });

            // Update Chart
            if (seriesRef.current) {
              // Ensure unique time. If we get multiple updates per second, lightweight-charts might complain if not handled carefully.
              // Assuming NATS sends reasonable timestamps. 
              // lightweight-charts needs seconds for Time (if using UNIX timestamp numbers).
              // tradingData.timestamp is likely ms.

              const time = (tradingData.timestamp / 1000) as Time;
              seriesRef.current.update({
                time: time,
                value: tradingData.price
              });
            }

          } catch (err) {
            console.error("Error parsing message:", err);
          }
        }
      })().catch((err) => {
        console.error("Error in subscription loop:", err);
      });

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
          connectNATS();
        }, 3000);
      }
    }
  };

  useEffect(() => {
    if (credentials) {
      connectNATS();
    }

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
  }, [credentials]);

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

          <div className="h-[400px] w-full relative">
            <div ref={chartContainerRef} className="absolute inset-0" />
            {!isConnected && !currentPrice && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <p className="text-muted-foreground">Waiting for connection...</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
