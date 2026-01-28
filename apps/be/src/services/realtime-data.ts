import type { FastifyInstance } from 'fastify';

interface StockData {
    symbol: string;
    name: string;
    basePrice: number;
}

const DEMO_STOCKS: StockData[] = [
    { symbol: 'AAPL', name: 'Apple Inc.', basePrice: 175.50 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', basePrice: 142.30 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', basePrice: 415.20 },
    { symbol: 'TSLA', name: 'Tesla Inc.', basePrice: 248.90 },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', basePrice: 178.25 }
];

export class RealtimeDataService {
    private fastify: FastifyInstance;
    private intervals: NodeJS.Timeout[] = [];
    private isRunning = false;

    constructor(fastify: FastifyInstance) {
        this.fastify = fastify;
    }

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.fastify.log.info('Starting realtime data service...');

        // Publish stock updates every 3 seconds
        const stockInterval = setInterval(() => {
            this.publishStockUpdate();
        }, 3000);

        // Publish trade updates every 5 seconds
        const tradeInterval = setInterval(() => {
            this.publishTradeUpdate();
        }, 5000);

        this.intervals.push(stockInterval, tradeInterval);
    }

    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        this.fastify.log.info('Stopping realtime data service...');

        this.intervals.forEach(interval => clearInterval(interval));
        this.intervals = [];
    }

    private publishStockUpdate() {
        try {
            const stock = DEMO_STOCKS[Math.floor(Math.random() * DEMO_STOCKS.length)];
            const change = (Math.random() - 0.5) * 10; // Random change between -5 and +5
            const currentPrice = stock.basePrice + change;
            const changePercent = (change / stock.basePrice) * 100;

            const stockUpdate = {
                id: `stock-${stock.symbol}`,
                symbol: stock.symbol,
                name: stock.name,
                currentPrice: Number(currentPrice.toFixed(2)),
                change: Number(change.toFixed(2)),
                changePercent: Number(changePercent.toFixed(2)),
                volume: Math.floor(Math.random() * 1000000),
                timestamp: new Date().toISOString()
            };

            this.fastify.nc.publish('stocks.updates', JSON.stringify(stockUpdate));
            this.fastify.log.debug(`Published stock update: ${stock.symbol} @ $${currentPrice.toFixed(2)}`);
        } catch (error) {
            this.fastify.log.error('Error publishing stock update:', error);
        }
    }

    private publishTradeUpdate() {
        try {
            const stock = DEMO_STOCKS[Math.floor(Math.random() * DEMO_STOCKS.length)];
            const type = Math.random() > 0.5 ? 'BUY' : 'SELL';
            const quantity = Math.floor(Math.random() * 100) + 1;
            const price = stock.basePrice + (Math.random() - 0.5) * 10;

            const tradeUpdate = {
                id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: 'demo-user',
                stockId: `stock-${stock.symbol}`,
                symbol: stock.symbol,
                type,
                quantity,
                price: Number(price.toFixed(2)),
                total: Number((quantity * price).toFixed(2)),
                timestamp: new Date().toISOString()
            };

            this.fastify.nc.publish('trades.updates', JSON.stringify(tradeUpdate));
            this.fastify.log.debug(`Published trade: ${type} ${quantity} ${stock.symbol} @ $${price.toFixed(2)}`);
        } catch (error) {
            this.fastify.log.error('Error publishing trade update:', error);
        }
    }

    publishNotification(userId: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
        try {
            const notification = {
                userId,
                type,
                message,
                timestamp: new Date().toISOString()
            };

            this.fastify.nc.publish('user.notifications', JSON.stringify(notification));
            this.fastify.log.debug(`Published notification to ${userId}: ${message}`);
        } catch (error) {
            this.fastify.log.error('Error publishing notification:', error);
        }
    }
}