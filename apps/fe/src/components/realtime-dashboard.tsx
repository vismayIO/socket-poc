import { useRealtimeData } from '@/hooks/useRealtimeData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Wifi,
    WifiOff,
    Play,
    Square,
    Bell,
    X
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function RealtimeDashboard() {
    const {
        stockList,
        trades,
        notifications,
        natsState,
        actions
    } = useRealtimeData();

    return (
        <div className="space-y-6">
            {/* Connection Status */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {natsState.connected ? (
                                <Wifi className="h-4 w-4 text-green-500" />
                            ) : (
                                <WifiOff className="h-4 w-4 text-red-500" />
                            )}
                            <CardTitle className="text-sm">Real-time Connection</CardTitle>
                        </div>
                        <Badge
                            variant={natsState.connected ? "default" : "destructive"}
                            className="text-xs"
                        >
                            {natsState.connecting ? 'Connecting...' :
                                natsState.connected ? 'Connected' : 'Disconnected'}
                        </Badge>
                    </div>
                    {natsState.error && (
                        <CardDescription className="text-red-500 text-xs">
                            {natsState.error}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            onClick={actions.simulateStockUpdate}
                            disabled={!natsState.connected}
                            className="text-xs"
                        >
                            <Play className="h-3 w-3 mr-1" />
                            Simulate Stock
                        </Button>
                        <Button
                            size="sm"
                            onClick={actions.simulateTrade}
                            disabled={!natsState.connected}
                            className="text-xs"
                        >
                            <Activity className="h-3 w-3 mr-1" />
                            Simulate Trade
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Live Stock Prices */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Live Stock Prices
                        </CardTitle>
                        <CardDescription>
                            Real-time stock price updates via NATS WebSocket
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[300px]">
                            {stockList.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    <div className="text-center">
                                        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No stock updates yet</p>
                                        <p className="text-xs">Click "Simulate Stock" to generate data</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {stockList.map((stock) => (
                                        <div
                                            key={stock.symbol}
                                            className="flex items-center justify-between p-3 border rounded-lg"
                                        >
                                            <div>
                                                <div className="font-medium">{stock.symbol}</div>
                                                <div className="text-sm text-muted-foreground">{stock.name}</div>
                                            </div>
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
                                                    ({stock.changePercent.toFixed(2)}%)
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Live Trades */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            Live Trades
                        </CardTitle>
                        <CardDescription>
                            Real-time trade execution feed
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[300px]">
                            {trades.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    <div className="text-center">
                                        <Square className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No trades yet</p>
                                        <p className="text-xs">Click "Simulate Trade" to generate data</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {trades.map((trade) => (
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
                                                    {trade.quantity} shares @ ${trade.price.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-mono font-medium">
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

            {/* Notifications */}
            {notifications.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Bell className="h-4 w-4" />
                                Notifications
                            </CardTitle>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={actions.clearNotifications}
                                className="text-xs"
                            >
                                <X className="h-3 w-3 mr-1" />
                                Clear All
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[200px]">
                            <div className="space-y-2">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={cn(
                                            "p-3 border rounded-lg text-sm",
                                            notification.type === 'error' && "border-red-200 bg-red-50",
                                            notification.type === 'success' && "border-green-200 bg-green-50",
                                            notification.type === 'warning' && "border-yellow-200 bg-yellow-50",
                                            notification.type === 'info' && "border-blue-200 bg-blue-50"
                                        )}
                                    >
                                        <div className="flex items-start justify-between">
                                            <p>{notification.message}</p>
                                            <span className="text-xs text-muted-foreground ml-2">
                                                {new Date(notification.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}