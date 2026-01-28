import { useEffect, useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, BarChart3, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CandleData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface CandlestickChartProps {
    symbol: string;
    data: CandleData[];
    currentPrice?: number;
    className?: string;
}

type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const timeFrames: { value: TimeFrame; label: string }[] = [
    { value: '1m', label: '1M' },
    { value: '5m', label: '5M' },
    { value: '15m', label: '15M' },
    { value: '1h', label: '1H' },
    { value: '4h', label: '4H' },
    { value: '1d', label: '1D' }
];

export function CandlestickChart({ symbol, data, currentPrice, className }: CandlestickChartProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [timeFrame, setTimeFrame] = useState<TimeFrame>('15m');
    const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

    // Calculate price statistics
    const stats = useMemo(() => {
        if (data.length === 0) return null;

        const latest = data[data.length - 1];
        const previous = data[data.length - 2];
        const change = previous ? latest.close - previous.close : 0;
        const changePercent = previous ? (change / previous.close) * 100 : 0;

        const high24h = Math.max(...data.slice(-24).map(d => d.high));
        const low24h = Math.min(...data.slice(-24).map(d => d.low));
        const volume24h = data.slice(-24).reduce((sum, d) => sum + d.volume, 0);

        return {
            price: latest.close,
            change,
            changePercent,
            high24h,
            low24h,
            volume24h,
            isPositive: change >= 0
        };
    }, [data]);

    // Handle canvas resize
    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setDimensions({
                    width: rect.width,
                    height: 400
                });
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Draw candlestick chart
    useEffect(() => {
        console.log('🎨 Rendering candlestick chart with', data.length, 'candles for', symbol);
        const canvas = canvasRef.current;
        if (!canvas || data.length === 0) {
            console.log('❌ Cannot render: canvas=', !!canvas, 'data.length=', data.length);
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        canvas.width = dimensions.width * window.devicePixelRatio;
        canvas.height = dimensions.height * window.devicePixelRatio;
        canvas.style.width = `${dimensions.width}px`;
        canvas.style.height = `${dimensions.height}px`;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        // Clear canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dimensions.width, dimensions.height);

        // Chart margins
        const margin = { top: 20, right: 80, bottom: 60, left: 60 };
        const chartWidth = dimensions.width - margin.left - margin.right;
        const chartHeight = dimensions.height - margin.top - margin.bottom;

        // Calculate price range
        const prices = data.flatMap(d => [d.high, d.low]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        const padding = priceRange * 0.1;

        // Price scale
        const priceScale = (price: number) => {
            return margin.top + ((maxPrice + padding - price) / (priceRange + 2 * padding)) * chartHeight;
        };

        // Time scale
        const timeScale = (index: number) => {
            return margin.left + (index / (data.length - 1)) * chartWidth;
        };

        // Draw grid lines
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;

        // Horizontal grid lines (price levels)
        const priceSteps = 8;
        for (let i = 0; i <= priceSteps; i++) {
            const price = minPrice - padding + (i / priceSteps) * (priceRange + 2 * padding);
            const y = priceScale(price);

            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + chartWidth, y);
            ctx.stroke();

            // Price labels
            ctx.fillStyle = '#666';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(price.toFixed(2), margin.left - 10, y + 4);
        }

        // Vertical grid lines (time)
        const timeSteps = 6;
        for (let i = 0; i <= timeSteps; i++) {
            const index = Math.floor((i / timeSteps) * (data.length - 1));
            const x = timeScale(index);

            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + chartHeight);
            ctx.stroke();

            // Time labels
            if (data[index]) {
                const date = new Date(data[index].timestamp);
                const timeLabel = date.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                });

                ctx.fillStyle = '#666';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(timeLabel, x, margin.top + chartHeight + 20);
            }
        }

        // Draw candlesticks
        const candleWidth = Math.max(2, chartWidth / data.length * 0.8);

        data.forEach((candle, index) => {
            const x = timeScale(index);
            const openY = priceScale(candle.open);
            const closeY = priceScale(candle.close);
            const highY = priceScale(candle.high);
            const lowY = priceScale(candle.low);

            const isGreen = candle.close >= candle.open;
            const bodyHeight = Math.abs(closeY - openY);
            const bodyTop = Math.min(openY, closeY);

            // Colors
            const greenColor = '#22c55e';
            const redColor = '#ef4444';
            const color = isGreen ? greenColor : redColor;

            // Draw wick (high-low line)
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, highY);
            ctx.lineTo(x, lowY);
            ctx.stroke();

            // Draw body
            if (bodyHeight < 1) {
                // Doji - draw as horizontal line
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - candleWidth / 2, openY);
                ctx.lineTo(x + candleWidth / 2, openY);
                ctx.stroke();
            } else {
                // Regular candle body
                ctx.fillStyle = isGreen ? color : color;
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;

                if (isGreen) {
                    // Green candle - hollow
                    ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
                } else {
                    // Red candle - filled
                    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
                }
            }
        });

        // Draw current price line if available
        if (currentPrice && currentPrice >= minPrice - padding && currentPrice <= maxPrice + padding) {
            const y = priceScale(currentPrice);

            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + chartWidth, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Current price label
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(margin.left + chartWidth + 5, y - 10, 70, 20);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(currentPrice.toFixed(2), margin.left + chartWidth + 40, y + 4);
        }

    }, [data, dimensions, currentPrice]);

    // Handle mouse events for tooltip
    const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || data.length === 0) return;

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        setMousePos({ x: event.clientX, y: event.clientY });

        // Find closest candle
        const margin = { top: 20, right: 80, bottom: 60, left: 60 };
        const chartWidth = dimensions.width - margin.left - margin.right;

        if (x >= margin.left && x <= margin.left + chartWidth) {
            const relativeX = x - margin.left;
            const index = Math.round((relativeX / chartWidth) * (data.length - 1));

            if (index >= 0 && index < data.length) {
                setHoveredCandle(data[index]);
            } else {
                setHoveredCandle(null);
            }
        } else {
            setHoveredCandle(null);
        }
    };

    const handleMouseLeave = () => {
        setHoveredCandle(null);
    };

    return (
        <Card className={cn("w-full", className)}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            {symbol} Chart
                        </CardTitle>
                        <CardDescription>Real-time candlestick chart</CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                        <Select value={timeFrame} onValueChange={(value: TimeFrame) => setTimeFrame(value)}>
                            <SelectTrigger className="w-20">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {timeFrames.map(tf => (
                                    <SelectItem key={tf.value} value={tf.value}>
                                        {tf.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Button size="sm" variant="outline">
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Price Stats */}
                {stats && (
                    <div className="flex items-center gap-4 pt-2">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-mono font-bold">
                                ${stats.price.toFixed(2)}
                            </span>
                            <div className={cn(
                                "flex items-center gap-1 text-sm",
                                stats.isPositive ? "text-green-600" : "text-red-600"
                            )}>
                                {stats.isPositive ? (
                                    <TrendingUp className="h-4 w-4" />
                                ) : (
                                    <TrendingDown className="h-4 w-4" />
                                )}
                                <span>
                                    {stats.isPositive ? '+' : ''}{stats.change.toFixed(2)}
                                    ({stats.changePercent.toFixed(2)}%)
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-4 text-sm text-muted-foreground">
                            <span>H: ${stats.high24h.toFixed(2)}</span>
                            <span>L: ${stats.low24h.toFixed(2)}</span>
                            <span>Vol: {(stats.volume24h / 1000).toFixed(1)}K</span>
                        </div>
                    </div>
                )}
            </CardHeader>

            <CardContent>
                <div ref={containerRef} className="relative">
                    <canvas
                        ref={canvasRef}
                        className="border rounded cursor-crosshair"
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                    />

                    {/* Tooltip */}
                    {hoveredCandle && (
                        <div
                            className="absolute z-10 bg-black text-white p-3 rounded-lg shadow-lg text-sm pointer-events-none"
                            style={{
                                left: mousePos.x + 10,
                                top: mousePos.y - 100,
                                transform: 'translate(-50%, 0)'
                            }}
                        >
                            <div className="font-medium mb-1">
                                {new Date(hoveredCandle.timestamp).toLocaleString()}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>Open: ${hoveredCandle.open.toFixed(2)}</div>
                                <div>High: ${hoveredCandle.high.toFixed(2)}</div>
                                <div>Low: ${hoveredCandle.low.toFixed(2)}</div>
                                <div>Close: ${hoveredCandle.close.toFixed(2)}</div>
                            </div>
                            <div className="mt-1 text-xs">
                                Volume: {(hoveredCandle.volume / 1000).toFixed(1)}K
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}