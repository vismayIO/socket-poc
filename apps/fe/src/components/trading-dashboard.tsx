import { useState, useEffect } from 'react';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useCandlestickData } from '@/hooks/useCandlestickData';
import { CandlestickChart } from '@/components/candlestick-chart';
import { DebugPanel } from '@/components/debug-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    TrendingUp,
    TrendingDown,
    Activity,
    DollarSign,
    BarChart3,
    Wifi,
    WifiOff
} from 'lucide-react';
import { cn } from '@/lib/utils';

const POPULAR_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];

export function TradingDashboard() {
    const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
    const { stockList, trades, natsState, actions } = useRealtimeData();
    const candlestickData = useCandlestickData(selectedSymbol);

    // Auto-simulate data every 3 seconds when connected
    useEffect(() => {
        if (!natsState.connected) return;

        console.log('🚀 Starting auto-simulation for candlestick movement');
        const interval = setInterval(() => {
            console.log('🎲 Auto-simulating stock update');
            actions.simulateStockUpdate();
        }, 3000);

        return () => {
            console.log('🛑 Stopping auto-simulation');
            clearInterval(interval);
        };
    }, [natsState.connected, actions.simulateStockUpdate]);

    // Update candlestick data when new stock updates arrive
    useEffect(() => {
        console.log('🔍 Checking for stock updates. Selected:', selectedSymbol, 'StockList:', stockList.map(s => s.symbol));
        const latestStock = stockList.find(stock => stock.symbol === selectedSymbol);
        if (latestStock) {
            console.log('🎯 Found stock update for', selectedSymbol, ':', latestStock);
            candlestickData.updatePrice({
                symbol: latestStock.symbol,
                currentPrice: latestStock.currentPrice,
                volume: latestStock.volume,
                timestamp: latestStock.timestamp
            });
        } else {
            console.log('❌ No stock update found for', selectedSymbol);
        }
    }, [stockList, selectedSymbol, candlestickData]);

    // Get current stock data
    const currentStock = stockList.find(stock => stock.symbol === selectedSymbol);
    const stats = candlestickData.getStats();

    return (
        <div className="space-y-6">
            {/* Header with Symbol Selector and Connection Status */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold">Trading Dashboard</h2>
                        <p className="text-muted-foreground">Real-time candlestick charts and market data</p>
                    </div>

                    <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {POPULAR_SYMBOLS.map(symbol => (
                                <SelectItem key={symbol} value={symbol}>
                                    {symbol}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    {natsState.connected ? (
                        <Badge variant="default" className="gap-1">
                            <Wifi className="h-3 w-3" />
                            Live Data
                        </Badge>
                    ) : (
                        <Badge variant="destructive" className="gap-1">
                            <WifiOff className="h-3 w-3" />
                            Disconnected
                        </Badge>
                    )}

                    <Button
                        size="sm"
                        onClick={actions.simulateStockUpdate}
                        disabled={!natsState.connected}
                    >
                        Simulate Data
                    </Button>

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            // Force update AAPL with random price
                            const randomPrice = 175 + (Math.random() - 0.5) * 20;
                            console.log('🎯 Manual AAPL update:', randomPrice);
                            candlestickData.updatePrice({
                                symbol: 'AAPL',
                                currentPrice: randomPrice,
                                volume: 50000,
                                timestamp: new Date().toISOString()
                            });
                        }}
                    >
                        Force AAPL Update
                    </Button>
                </div>
            </div>

            {/* Main Chart */}
            <CandlestickChart
                symbol={selectedSymbol}
                data={candlestickData.candles}
                currentPrice={candlestickData.currentPrice}
                className="col-span-full"
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Debug Panel */}
                <div className="lg:col-span-1">
                    <DebugPanel />
                </div>

                {/* Market Overview */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            Market Overview
                        </CardTitle>
                        <CardDescription>Live prices for popular stocks</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {POPULAR_SYMBOLS.map(symbol => {
                                const stock = stockList.find(s => s.symbol === symbol);
                                const isSelected = symbol === selectedSymbol;

                                return (
                                    <div
                                        key={symbol}
                                        className={cn(
                                            "p-4 border rounded-lg cursor-pointer transition-colors",
                                            isSelected ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
                                        )}
                                        onClick={() => setSelectedSymbol(symbol)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium">{symbol}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {stock?.name || `${symbol} Inc.`}
                                                </div>
                                            </div>

                                            {stock ? (
                                                <div className="text-right">
                                                    <div className="font-mono font-medium">
                                                        ${stock.currentPrice.toFixed(2)}
                                                    </div>
                                                    <div className={cn(
                                                        "text-sm flex items-center gap-1",
                                                        stock.change >= 0 ? "text-green-600" : "text-red-600"
                                                    )}>
                                                        {stock.change >= 0 ? (
                                                            <TrendingUp className="h-3 w-3" />
                                                        ) : (
                                                            <TrendingDown className="h-3 w-3" />
                                                        )}
                                                        {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-right">
                                                    <div className="text-sm text-muted-foreground">No data</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Trading Activity */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            Recent Trades
                        </CardTitle>
                        <CardDescription>Live trading activity</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[300px]">
                            {trades.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    <div className="text-center">
                                        <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No trades yet</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {trades.slice(0, 10).map((trade) => (
                                        <div
                                            key={trade.id}
                                            className="flex items-center justify-between p-3 border rounded-lg"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <Badge
                                                        variant={trade.type === 'BUY' ? 'default' : 'secondary'}
                                                        className="text-xs"
                                                    >
                                                        {trade.type}
                                                    </Badge>
                                                    <span className="font-medium">{trade.symbol}</span>
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {trade.quantity} @ ${trade.price.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono text-sm">
                                                    ${trade.total.toFixed(2)}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {new Date(trade.timestamp).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Stats */}
            {stats && (
                <Card>
                    <CardHeader>
                        <CardTitle>{selectedSymbol} Statistics</CardTitle>
                        <CardDescription>24-hour trading statistics</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-4 border rounded-lg">
                                <div className="text-2xl font-bold font-mono">
                                    ${stats.price.toFixed(2)}
                                </div>
                                <div className="text-sm text-muted-foreground">Current Price</div>
                            </div>

                            <div className="text-center p-4 border rounded-lg">
                                <div className={cn(
                                    "text-2xl font-bold",
                                    stats.isPositive ? "text-green-600" : "text-red-600"
                                )}>
                                    {stats.isPositive ? '+' : ''}{stats.changePercent.toFixed(2)}%
                                </div>
                                <div className="text-sm text-muted-foreground">24h Change</div>
                            </div>

                            <div className="text-center p-4 border rounded-lg">
                                <div className="text-2xl font-bold font-mono">
                                    ${stats.high24h.toFixed(2)}
                                </div>
                                <div className="text-sm text-muted-foreground">24h High</div>
                            </div>

                            <div className="text-center p-4 border rounded-lg">
                                <div className="text-2xl font-bold font-mono">
                                    ${stats.low24h.toFixed(2)}
                                </div>
                                <div className="text-sm text-muted-foreground">24h Low</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}