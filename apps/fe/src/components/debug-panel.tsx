import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useCandlestickData } from '@/hooks/useCandlestickData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function DebugPanel() {
    const { stockList, natsState, actions } = useRealtimeData();
    const candlestickData = useCandlestickData('AAPL');

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>Debug Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <h4 className="font-medium">Connection Status:</h4>
                    <p className="text-sm">
                        Connected: {natsState.connected ? '✅' : '❌'} |
                        Connecting: {natsState.connecting ? '🔄' : '⏸️'} |
                        Error: {natsState.error || 'None'}
                    </p>
                </div>

                <div>
                    <h4 className="font-medium">Stock Updates ({stockList.length}):</h4>
                    <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                        {stockList.slice(0, 5).map((stock, i) => (
                            <div key={i} className="border-l-2 border-blue-500 pl-2">
                                {stock.symbol}: ${stock.currentPrice} at {new Date(stock.timestamp).toLocaleTimeString()}
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h4 className="font-medium">AAPL Candles ({candlestickData.candles.length}):</h4>
                    <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                        {candlestickData.candles.slice(-3).map((candle, i) => (
                            <div key={i} className="border-l-2 border-green-500 pl-2">
                                O:{candle.open} H:{candle.high} L:{candle.low} C:{candle.close} at {new Date(candle.timestamp).toLocaleTimeString()}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        size="sm"
                        onClick={actions.simulateStockUpdate}
                        disabled={!natsState.connected}
                    >
                        Simulate Stock
                    </Button>
                    <Button
                        size="sm"
                        onClick={actions.simulateTrade}
                        disabled={!natsState.connected}
                    >
                        Simulate Trade
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}