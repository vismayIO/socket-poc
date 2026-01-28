import { useState, useCallback, useEffect } from 'react';
import { useNatsWebSocket } from './useNatsWebSocket';

interface StockUpdate {
    id: string;
    symbol: string;
    name: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    volume: number;
    timestamp: string;
    userId?: string;
}

interface TradeUpdate {
    id: string;
    userId: string;
    stockId: string;
    symbol: string;
    type: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    total: number;
    timestamp: string;
}

interface RealtimeData {
    stocks: Record<string, StockUpdate>;
    trades: TradeUpdate[];
    notifications: Array<{
        id: string;
        type: 'info' | 'success' | 'warning' | 'error';
        message: string;
        timestamp: string;
    }>;
}

export function useRealtimeData() {
    const [data, setData] = useState<RealtimeData>({
        stocks: {},
        trades: [],
        notifications: []
    });

    const handleMessage = useCallback((subject: string, message: any) => {
        console.log('Received real-time message:', { subject, message });

        switch (subject) {
            case 'stocks.updates':
                setData(prev => ({
                    ...prev,
                    stocks: {
                        ...prev.stocks,
                        [message.symbol]: message
                    }
                }));
                break;

            case 'trades.updates':
                setData(prev => ({
                    ...prev,
                    trades: [message, ...prev.trades.slice(0, 49)] // Keep last 50 trades
                }));
                break;

            case 'user.notifications':
                setData(prev => ({
                    ...prev,
                    notifications: [
                        {
                            id: Date.now().toString(),
                            type: message.type || 'info',
                            message: message.message,
                            timestamp: message.timestamp || new Date().toISOString()
                        },
                        ...prev.notifications.slice(0, 19) // Keep last 20 notifications
                    ]
                }));
                break;

            default:
                console.log('Unknown subject:', subject);
        }
    }, []);

    const handleError = useCallback((error: Error) => {
        console.error('NATS WebSocket error:', error);
        setData(prev => ({
            ...prev,
            notifications: [
                {
                    id: Date.now().toString(),
                    type: 'error',
                    message: `Connection error: ${error.message}`,
                    timestamp: new Date().toISOString()
                },
                ...prev.notifications.slice(0, 19)
            ]
        }));
    }, []);

    const nats = useNatsWebSocket({
        subjects: ['stocks.updates', 'trades.updates', 'user.notifications'],
        onMessage: handleMessage,
        onError: handleError,
        autoReconnect: true
    });

    // Simulate stock data for demo
    const simulateStockUpdate = useCallback(async () => {
        if (!nats.connected) return;

        const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];

        const basePrice = 150 + Math.random() * 200;
        const change = (Math.random() - 0.5) * 10;
        const changePercent = (change / basePrice) * 100;

        const stockUpdate: StockUpdate = {
            id: `stock-${symbol}`,
            symbol,
            name: `${symbol} Inc.`,
            currentPrice: Number((basePrice + change).toFixed(2)),
            change: Number(change.toFixed(2)),
            changePercent: Number(changePercent.toFixed(2)),
            volume: Math.floor(Math.random() * 1000000),
            timestamp: new Date().toISOString()
        };

        try {
            await nats.publish('stocks.updates', stockUpdate);
        } catch (error) {
            console.error('Failed to simulate stock update:', error);
        }
    }, [nats]);

    // Simulate trade data for demo
    const simulateTrade = useCallback(async () => {
        if (!nats.connected) return;

        const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const type = Math.random() > 0.5 ? 'BUY' : 'SELL';
        const quantity = Math.floor(Math.random() * 100) + 1;
        const price = 150 + Math.random() * 200;

        const tradeUpdate: TradeUpdate = {
            id: `trade-${Date.now()}`,
            userId: 'demo-user',
            stockId: `stock-${symbol}`,
            symbol,
            type,
            quantity,
            price: Number(price.toFixed(2)),
            total: Number((quantity * price).toFixed(2)),
            timestamp: new Date().toISOString()
        };

        try {
            await nats.publish('trades.updates', tradeUpdate);
        } catch (error) {
            console.error('Failed to simulate trade:', error);
        }
    }, [nats]);

    // Clear notifications
    const clearNotifications = useCallback(() => {
        setData(prev => ({
            ...prev,
            notifications: []
        }));
    }, []);

    // Get stock list as array
    const stockList = Object.values(data.stocks);

    return {
        ...data,
        stockList,
        natsState: {
            connected: nats.connected,
            connecting: nats.connecting,
            error: nats.error
        },
        actions: {
            simulateStockUpdate,
            simulateTrade,
            clearNotifications,
            connect: nats.connect,
            disconnect: nats.disconnect
        }
    };
}