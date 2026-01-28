import { useState, useEffect, useCallback } from 'react';

interface StockUpdate {
    symbol: string;
    currentPrice: number;
    volume: number;
    timestamp: string;
}

interface CandleData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export function useCandlestickData(selectedSymbol: string, timeFrame: TimeFrame = '15m') {
    const [candles, setCandles] = useState<Record<string, CandleData[]>>({});
    const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

    // Generate initial historical data
    const generateHistoricalData = useCallback((symbol: string, basePrice: number = 150): CandleData[] => {
        const now = Date.now();
        const candleCount = 100;
        const data: CandleData[] = [];

        let currentPrice = basePrice;

        for (let i = candleCount - 1; i >= 0; i--) {
            const timestamp = now - (i * 5000); // 5 second intervals for demo

            // Generate realistic price movement
            const volatility = 0.02;
            const trend = (Math.random() - 0.5) * 0.001;

            const open = currentPrice;
            const priceChange = currentPrice * volatility * (Math.random() - 0.5);
            const high = Math.max(open, open + Math.abs(priceChange) * (1 + Math.random()));
            const low = Math.min(open, open - Math.abs(priceChange) * (1 + Math.random()));
            const close = open + priceChange + (currentPrice * trend);

            const volume = Math.floor(Math.random() * 100000) + 10000;

            data.push({
                timestamp,
                open: Number(open.toFixed(2)),
                high: Number(high.toFixed(2)),
                low: Number(low.toFixed(2)),
                close: Number(close.toFixed(2)),
                volume
            });

            currentPrice = close;
        }

        return data;
    }, []);

    // Initialize historical data for a symbol
    const initializeSymbol = useCallback((symbol: string, basePrice: number = 150) => {
        setCandles(prev => {
            if (!prev[symbol]) {
                const historicalData = generateHistoricalData(symbol, basePrice);
                const lastCandle = historicalData[historicalData.length - 1];

                setCurrentPrices(prevPrices => ({
                    ...prevPrices,
                    [symbol]: lastCandle.close
                }));

                return {
                    ...prev,
                    [symbol]: historicalData
                };
            }
            return prev;
        });
    }, [generateHistoricalData]);

    // Update candle data with new price
    const updatePrice = useCallback((stockUpdate: StockUpdate) => {
        const { symbol, currentPrice, volume, timestamp } = stockUpdate;
        const updateTime = new Date(timestamp).getTime();

        console.log('📊 Updating candlestick data:', { symbol, currentPrice, timestamp });

        // Update current price immediately
        setCurrentPrices(prev => ({
            ...prev,
            [symbol]: currentPrice
        }));

        setCandles(prev => {
            const symbolCandles = prev[symbol];
            if (!symbolCandles || symbolCandles.length === 0) {
                console.log('⚠️ No candles found for symbol:', symbol);
                return prev;
            }

            const updatedCandles = [...symbolCandles];
            const lastCandle = updatedCandles[updatedCandles.length - 1];

            // For demo: create new candle every 5 seconds, otherwise update current
            const timeSinceLastCandle = updateTime - lastCandle.timestamp;

            if (timeSinceLastCandle < 5000) {
                // Update existing candle
                lastCandle.high = Math.max(lastCandle.high, currentPrice);
                lastCandle.low = Math.min(lastCandle.low, currentPrice);
                lastCandle.close = currentPrice;
                lastCandle.volume = Math.max(lastCandle.volume, volume);
                console.log('🔄 Updated existing candle:', { symbol, price: currentPrice });
            } else {
                // Create new candle
                const newCandle: CandleData = {
                    timestamp: updateTime,
                    open: lastCandle.close,
                    high: currentPrice,
                    low: currentPrice,
                    close: currentPrice,
                    volume
                };

                updatedCandles.push(newCandle);
                console.log('✨ Created new candle:', { symbol, candle: newCandle });

                // Keep only last 100 candles
                if (updatedCandles.length > 100) {
                    updatedCandles.shift();
                }
            }

            return {
                ...prev,
                [symbol]: updatedCandles
            };
        });
    }, []);

    // Get price statistics
    const getStats = useCallback(() => {
        const symbolCandles = candles[selectedSymbol];
        if (!symbolCandles || symbolCandles.length === 0) return null;

        const latest = symbolCandles[symbolCandles.length - 1];
        const previous = symbolCandles[symbolCandles.length - 2];

        const change = previous ? latest.close - previous.close : 0;
        const changePercent = previous ? (change / previous.close) * 100 : 0;

        // Calculate 24h stats (or available data)
        const last24h = symbolCandles.slice(-Math.min(24, symbolCandles.length));
        const high24h = Math.max(...last24h.map(c => c.high));
        const low24h = Math.min(...last24h.map(c => c.low));
        const volume24h = last24h.reduce((sum, c) => sum + c.volume, 0);

        return {
            price: latest.close,
            change,
            changePercent,
            high24h,
            low24h,
            volume24h,
            isPositive: change >= 0
        };
    }, [candles, selectedSymbol]);

    // Auto-initialize popular symbols with different base prices
    useEffect(() => {
        const symbolPrices = {
            'AAPL': 175.50,
            'GOOGL': 142.30,
            'MSFT': 415.20,
            'TSLA': 248.90,
            'AMZN': 178.25
        };

        Object.entries(symbolPrices).forEach(([sym, price]) => {
            initializeSymbol(sym, price);
        });
    }, [initializeSymbol]);

    return {
        candles: candles[selectedSymbol] || [],
        currentPrice: currentPrices[selectedSymbol],
        updatePrice,
        getStats,
        initializeSymbol
    };
}