import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { SymbolConfigService } from "../services/symbol-config.service";
import { MarketSimulationService } from "../services/market-simulation.service";

// Create service instances
const symbolConfigService = new SymbolConfigService();
const marketSimulationService = new MarketSimulationService();

export const marketDataRoutes = new Elysia({ prefix: "/api/v1" })
  // GET /api/v1/symbols - List all available trading symbols
  .get("/symbols", async () => {
    try {
      const symbols = await symbolConfigService.getAllActiveSymbols();

      return {
        success: true,
        data: symbols.map((symbol) => ({
          symbol: symbol.symbol,
          basePrice: symbol.basePrice,
          sector: symbol.sector,
          marketCap: symbol.marketCap,
          volatility: symbol.volatility,
          isActive: true,
        })),
        count: symbols.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch symbols",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/quotes/:symbol - Current quote and market data for symbol
  .get("/quotes/:symbol", async ({ params, query }) => {
    try {
      const { symbol } = params;

      // Validate symbol exists
      const symbolConfig = await symbolConfigService.getSymbolConfig(
        symbol.toUpperCase(),
      );
      if (!symbolConfig) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Get current market state from simulation service
      const marketState = marketSimulationService.getMarketState(
        symbol.toUpperCase(),
      );
      const orderBook = marketSimulationService.getOrderBook(
        symbol.toUpperCase(),
      );

      // Get latest trade from database
      const latestTrade = await prisma.stockTrade.findFirst({
        where: { symbol: symbol.toUpperCase() },
        orderBy: { timestamp: "desc" },
      });

      // Calculate bid/ask from order book or use spread simulation
      const currentPrice = latestTrade?.price || symbolConfig.basePrice;
      const spread =
        symbolConfig.minSpread +
        Math.random() * (symbolConfig.maxSpread - symbolConfig.minSpread);

      const bid = orderBook?.bids[0]?.price || currentPrice - spread / 2;
      const ask = orderBook?.asks[0]?.price || currentPrice + spread / 2;
      const bidSize =
        orderBook?.bids[0]?.quantity || Math.floor(Math.random() * 1000) + 100;
      const askSize =
        orderBook?.asks[0]?.quantity || Math.floor(Math.random() * 1000) + 100;

      // Calculate daily statistics from price history
      const priceHistory = marketState?.priceHistory || [currentPrice];
      const dayOpen = priceHistory.length > 0 ? priceHistory[0] : currentPrice;
      const dayHigh = Math.max(...priceHistory);
      const dayLow = Math.min(...priceHistory);
      const change = currentPrice - dayOpen;
      const changePercent = dayOpen > 0 ? (change / dayOpen) * 100 : 0;

      return {
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          bid,
          ask,
          bidSize,
          askSize,
          spread: ask - bid,
          lastPrice: currentPrice,
          lastSize: latestTrade?.quantity || 0,
          lastTime: latestTrade?.timestamp || new Date(),
          change,
          changePercent,
          volume: marketState?.volume || 0,
          high: dayHigh,
          low: dayLow,
          open: dayOpen,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch quote",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/trades/:symbol - Recent trades with pagination
  .get("/trades/:symbol", async ({ params, query }) => {
    try {
      const { symbol } = params;
      const limit = Math.min(parseInt(query.limit as string) || 100, 1000);
      const offset = parseInt(query.offset as string) || 0;
      const since = query.since ? new Date(query.since as string) : undefined;

      // Validate symbol exists
      const symbolConfig = await symbolConfigService.getSymbolConfig(
        symbol.toUpperCase(),
      );
      if (!symbolConfig) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Build where clause
      const whereClause: any = { symbol: symbol.toUpperCase() };
      if (since) {
        whereClause.timestamp = { gte: since };
      }

      // Get trades with pagination
      const [trades, totalCount] = await Promise.all([
        prisma.stockTrade.findMany({
          where: whereClause,
          orderBy: { timestamp: "desc" },
          take: limit,
          skip: offset,
          select: {
            id: true,
            symbol: true,
            price: true,
            quantity: true,
            side: true,
            timestamp: true,
            orderId: true,
            tradeType: true,
          },
        }),
        prisma.stockTrade.count({ where: whereClause }),
      ]);

      return {
        success: true,
        data: trades,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + limit < totalCount,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch trades",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/orderbook/:symbol - Order book snapshot with market depth
  .get("/orderbook/:symbol", async ({ params, query }) => {
    try {
      const { symbol } = params;
      const levels = Math.min(parseInt(query.levels as string) || 10, 50);

      // Validate symbol exists
      const symbolConfig = await symbolConfigService.getSymbolConfig(
        symbol.toUpperCase(),
      );
      if (!symbolConfig) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Get order book from simulation service
      const orderBook = marketSimulationService.getOrderBook(
        symbol.toUpperCase(),
      );

      if (!orderBook) {
        // If no order book exists, get latest snapshot from database
        const snapshots = await prisma.orderBookSnapshot.findMany({
          where: { symbol: symbol.toUpperCase() },
          orderBy: { timestamp: "desc" },
          take: levels * 2, // Get enough for both sides
        });

        // Group by side and aggregate
        const bids = snapshots
          .filter((s) => s.side === "BUY")
          .slice(0, levels)
          .map((s) => ({
            price: s.price,
            quantity: s.quantity,
            orderCount: s.orderCount,
          }));

        const asks = snapshots
          .filter((s) => s.side === "SELL")
          .slice(0, levels)
          .map((s) => ({
            price: s.price,
            quantity: s.quantity,
            orderCount: s.orderCount,
          }));

        return {
          success: true,
          data: {
            symbol: symbol.toUpperCase(),
            bids: bids.sort((a, b) => b.price - a.price), // Highest bid first
            asks: asks.sort((a, b) => a.price - b.price), // Lowest ask first
            spread:
              asks.length > 0 && bids.length > 0
                ? asks[0].price - bids[0].price
                : 0,
            lastUpdate: snapshots[0]?.timestamp || new Date(),
          },
          timestamp: new Date().toISOString(),
        };
      }

      // Use live order book data
      const bids = orderBook.bids.slice(0, levels);
      const asks = orderBook.asks.slice(0, levels);

      return {
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          bids,
          asks,
          spread: orderBook.asks[0]?.price - orderBook.bids[0]?.price || 0,
          lastUpdate: orderBook.lastUpdate,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch order book",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/ohlcv/:symbol - OHLCV candlestick data with configurable intervals
  .get("/ohlcv/:symbol", async ({ params, query }) => {
    try {
      const { symbol } = params;
      const interval = (query.interval as string) || "1m";
      const limit = Math.min(parseInt(query.limit as string) || 100, 1000);
      const since = query.since ? new Date(query.since as string) : undefined;
      const until = query.until ? new Date(query.until as string) : undefined;

      // Validate interval
      const validIntervals = ["1s", "1m", "5m", "1h", "1d"];
      if (!validIntervals.includes(interval)) {
        return {
          success: false,
          error: `Invalid interval '${interval}'. Valid intervals: ${validIntervals.join(", ")}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate symbol exists
      const symbolConfig = await symbolConfigService.getSymbolConfig(
        symbol.toUpperCase(),
      );
      if (!symbolConfig) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Build where clause
      const whereClause: any = {
        symbol: symbol.toUpperCase(),
        intervalType: interval,
      };

      if (since || until) {
        whereClause.timestamp = {};
        if (since) whereClause.timestamp.gte = since;
        if (until) whereClause.timestamp.lte = until;
      }

      // Get OHLCV data
      const ohlcvData = await prisma.ohlcvData.findMany({
        where: whereClause,
        orderBy: { timestamp: "desc" },
        take: limit,
        select: {
          symbol: true,
          intervalType: true,
          timestamp: true,
          openPrice: true,
          highPrice: true,
          lowPrice: true,
          closePrice: true,
          volume: true,
          tradeCount: true,
        },
      });

      // Convert BigInt to string for JSON serialization
      const formattedData = ohlcvData.map((item) => ({
        ...item,
        volume: item.volume.toString(),
      }));

      return {
        success: true,
        data: formattedData,
        meta: {
          symbol: symbol.toUpperCase(),
          interval,
          count: formattedData.length,
          since,
          until,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch OHLCV data",
        timestamp: new Date().toISOString(),
      };
    }
  })
  // Debug endpoint to test symbol initialization
  .get("/debug/init-symbols", async () => {
    try {
      await symbolConfigService.initializeSymbols();
      const symbols = await symbolConfigService.getAllActiveSymbols();

      return {
        success: true,
        message: "Symbols initialized successfully",
        data: symbols,
        count: symbols.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize symbols",
        timestamp: new Date().toISOString(),
      };
    }
  });
// Historical Data Endpoints

// GET /api/v1/history/trades/:symbol - Historical trades with advanced filtering
export const historicalDataRoutes = new Elysia({ prefix: "/api/v1/history" })
  .get("/trades/:symbol", async ({ params, query }) => {
    try {
      const { symbol } = params;
      const limit = Math.min(parseInt(query.limit as string) || 100, 10000);
      const offset = parseInt(query.offset as string) || 0;
      const since = query.since ? new Date(query.since as string) : undefined;
      const until = query.until ? new Date(query.until as string) : undefined;
      const side = query.side as string; // "BUY" or "SELL"
      const minPrice = query.minPrice
        ? parseFloat(query.minPrice as string)
        : undefined;
      const maxPrice = query.maxPrice
        ? parseFloat(query.maxPrice as string)
        : undefined;
      const minQuantity = query.minQuantity
        ? parseInt(query.minQuantity as string)
        : undefined;
      const maxQuantity = query.maxQuantity
        ? parseInt(query.maxQuantity as string)
        : undefined;
      const format = query.format as string; // "json" or "csv"

      // Validate symbol exists
      const symbolConfig = await symbolConfigService.getSymbolConfig(
        symbol.toUpperCase(),
      );
      if (!symbolConfig) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Build advanced where clause
      const whereClause: any = { symbol: symbol.toUpperCase() };

      if (since || until) {
        whereClause.timestamp = {};
        if (since) whereClause.timestamp.gte = since;
        if (until) whereClause.timestamp.lte = until;
      }

      if (side && ["BUY", "SELL"].includes(side.toUpperCase())) {
        whereClause.side = side.toUpperCase();
      }

      if (minPrice !== undefined || maxPrice !== undefined) {
        whereClause.price = {};
        if (minPrice !== undefined) whereClause.price.gte = minPrice;
        if (maxPrice !== undefined) whereClause.price.lte = maxPrice;
      }

      if (minQuantity !== undefined || maxQuantity !== undefined) {
        whereClause.quantity = {};
        if (minQuantity !== undefined) whereClause.quantity.gte = minQuantity;
        if (maxQuantity !== undefined) whereClause.quantity.lte = maxQuantity;
      }

      // Get trades with advanced filtering
      const [trades, totalCount] = await Promise.all([
        prisma.stockTrade.findMany({
          where: whereClause,
          orderBy: { timestamp: "desc" },
          take: limit,
          skip: offset,
          select: {
            id: true,
            symbol: true,
            price: true,
            quantity: true,
            side: true,
            timestamp: true,
            orderId: true,
            tradeType: true,
            executionVenue: true,
          },
        }),
        prisma.stockTrade.count({ where: whereClause }),
      ]);

      // Handle CSV export format
      if (format === "csv") {
        const csvHeader =
          "id,symbol,price,quantity,side,timestamp,orderId,tradeType,executionVenue\n";
        const csvData = trades
          .map(
            (trade) =>
              `${trade.id},${trade.symbol},${trade.price},${trade.quantity},${trade.side},${trade.timestamp.toISOString()},${trade.orderId || ""},${trade.tradeType},${trade.executionVenue || ""}`,
          )
          .join("\n");

        return new Response(csvHeader + csvData, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${symbol}_trades_${new Date().toISOString().split("T")[0]}.csv"`,
          },
        });
      }

      return {
        success: true,
        data: trades,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + limit < totalCount,
        },
        filters: {
          symbol: symbol.toUpperCase(),
          since,
          until,
          side,
          priceRange:
            minPrice !== undefined || maxPrice !== undefined
              ? { min: minPrice, max: maxPrice }
              : undefined,
          quantityRange:
            minQuantity !== undefined || maxQuantity !== undefined
              ? { min: minQuantity, max: maxQuantity }
              : undefined,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch historical trades",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/history/ohlcv/:symbol - Historical OHLCV data with date ranges
  .get("/ohlcv/:symbol", async ({ params, query }) => {
    try {
      const { symbol } = params;
      const interval = (query.interval as string) || "1m";
      const limit = Math.min(parseInt(query.limit as string) || 1000, 50000);
      const since = query.since ? new Date(query.since as string) : undefined;
      const until = query.until ? new Date(query.until as string) : undefined;
      const format = query.format as string; // "json" or "csv"
      const aggregate = query.aggregate as string; // "sum", "avg", "min", "max"

      // Validate interval
      const validIntervals = ["1s", "1m", "5m", "1h", "1d"];
      if (!validIntervals.includes(interval)) {
        return {
          success: false,
          error: `Invalid interval '${interval}'. Valid intervals: ${validIntervals.join(", ")}`,
          timestamp: new Date().toISOString(),
        };
      }

      // Validate symbol exists
      const symbolConfig = await symbolConfigService.getSymbolConfig(
        symbol.toUpperCase(),
      );
      if (!symbolConfig) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      // Build where clause with date range
      const whereClause: any = {
        symbol: symbol.toUpperCase(),
        intervalType: interval,
      };

      if (since || until) {
        whereClause.timestamp = {};
        if (since) whereClause.timestamp.gte = since;
        if (until) whereClause.timestamp.lte = until;
      }

      // Get OHLCV data with optimized query
      let ohlcvData;
      if (aggregate && ["sum", "avg", "min", "max"].includes(aggregate)) {
        // Perform aggregation query
        const aggregateFields: any = {};

        if (aggregate === "sum") {
          aggregateFields._sum = {
            volume: true,
            tradeCount: true,
          };
        }

        if (aggregate === "avg") {
          aggregateFields._avg = {
            openPrice: true,
            highPrice: true,
            lowPrice: true,
            closePrice: true,
          };
        }

        if (aggregate === "min") {
          aggregateFields._min = {
            lowPrice: true,
            timestamp: true,
          };
        }

        if (aggregate === "max") {
          aggregateFields._max = {
            highPrice: true,
            timestamp: true,
          };
        }

        const aggregateResult = await prisma.ohlcvData.aggregate({
          where: whereClause,
          ...aggregateFields,
        });

        // Convert BigInt values to strings for JSON serialization
        const serializedResult = JSON.parse(
          JSON.stringify(aggregateResult, (key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          ),
        );

        return {
          success: true,
          data: serializedResult,
          meta: {
            symbol: symbol.toUpperCase(),
            interval,
            aggregate,
            dateRange: { since, until },
          },
          timestamp: new Date().toISOString(),
        };
      } else {
        ohlcvData = await prisma.ohlcvData.findMany({
          where: whereClause,
          orderBy: { timestamp: "desc" },
          take: limit,
          select: {
            symbol: true,
            intervalType: true,
            timestamp: true,
            openPrice: true,
            highPrice: true,
            lowPrice: true,
            closePrice: true,
            volume: true,
            tradeCount: true,
          },
        });
      }

      // Convert BigInt to string for JSON serialization
      const formattedData = ohlcvData.map((item) => ({
        ...item,
        volume: item.volume.toString(),
      }));

      // Handle CSV export format
      if (format === "csv") {
        const csvHeader =
          "symbol,intervalType,timestamp,openPrice,highPrice,lowPrice,closePrice,volume,tradeCount\n";
        const csvData = formattedData
          .map(
            (item) =>
              `${item.symbol},${item.intervalType},${item.timestamp.toISOString()},${item.openPrice},${item.highPrice},${item.lowPrice},${item.closePrice},${item.volume},${item.tradeCount}`,
          )
          .join("\n");

        return new Response(csvHeader + csvData, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${symbol}_ohlcv_${interval}_${new Date().toISOString().split("T")[0]}.csv"`,
          },
        });
      }

      return {
        success: true,
        data: formattedData,
        meta: {
          symbol: symbol.toUpperCase(),
          interval,
          count: formattedData.length,
          dateRange: { since, until },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch historical OHLCV data",
        timestamp: new Date().toISOString(),
      };
    }
  })

  // GET /api/v1/history/bulk/:symbol - Bulk export endpoint for large datasets
  .get("/bulk/:symbol", async ({ params, query }) => {
    try {
      const { symbol } = params;
      const dataType = query.type as string; // "trades" or "ohlcv"
      const since = query.since
        ? new Date(query.since as string)
        : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours
      const until = query.until ? new Date(query.until as string) : new Date();
      const format = (query.format as string) || "json"; // "json" or "csv"
      const compress = query.compress === "true";

      // Validate symbol exists
      const symbolConfig = await symbolConfigService.getSymbolConfig(
        symbol.toUpperCase(),
      );
      if (!symbolConfig) {
        return {
          success: false,
          error: `Symbol '${symbol}' not found`,
          timestamp: new Date().toISOString(),
        };
      }

      if (!dataType || !["trades", "ohlcv"].includes(dataType)) {
        return {
          success: false,
          error: "Invalid data type. Must be 'trades' or 'ohlcv'",
          timestamp: new Date().toISOString(),
        };
      }

      const whereClause: any = {
        symbol: symbol.toUpperCase(),
        timestamp: {
          gte: since,
          lte: until,
        },
      };

      let data: any[];
      let filename: string;

      if (dataType === "trades") {
        data = await prisma.stockTrade.findMany({
          where: whereClause,
          orderBy: { timestamp: "asc" },
          select: {
            id: true,
            symbol: true,
            price: true,
            quantity: true,
            side: true,
            timestamp: true,
            orderId: true,
            tradeType: true,
            executionVenue: true,
          },
        });
        filename = `${symbol}_trades_bulk_${since.toISOString().split("T")[0]}_to_${until.toISOString().split("T")[0]}`;
      } else {
        const ohlcvData = await prisma.ohlcvData.findMany({
          where: whereClause,
          orderBy: { timestamp: "asc" },
          select: {
            symbol: true,
            intervalType: true,
            timestamp: true,
            openPrice: true,
            highPrice: true,
            lowPrice: true,
            closePrice: true,
            volume: true,
            tradeCount: true,
          },
        });

        data = ohlcvData.map((item) => ({
          ...item,
          volume: item.volume.toString(),
        }));
        filename = `${symbol}_ohlcv_bulk_${since.toISOString().split("T")[0]}_to_${until.toISOString().split("T")[0]}`;
      }

      if (format === "csv") {
        let csvContent: string;
        if (dataType === "trades") {
          const csvHeader =
            "id,symbol,price,quantity,side,timestamp,orderId,tradeType,executionVenue\n";
          const csvData = data
            .map(
              (trade: any) =>
                `${trade.id},${trade.symbol},${trade.price},${trade.quantity},${trade.side},${trade.timestamp.toISOString()},${trade.orderId || ""},${trade.tradeType},${trade.executionVenue || ""}`,
            )
            .join("\n");
          csvContent = csvHeader + csvData;
        } else {
          const csvHeader =
            "symbol,intervalType,timestamp,openPrice,highPrice,lowPrice,closePrice,volume,tradeCount\n";
          const csvData = data
            .map(
              (item: any) =>
                `${item.symbol},${item.intervalType},${item.timestamp.toISOString()},${item.openPrice},${item.highPrice},${item.lowPrice},${item.closePrice},${item.volume},${item.tradeCount}`,
            )
            .join("\n");
          csvContent = csvHeader + csvData;
        }

        return new Response(csvContent, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${filename}.csv"`,
          },
        });
      }

      return {
        success: true,
        data,
        meta: {
          symbol: symbol.toUpperCase(),
          dataType,
          count: data.length,
          dateRange: { since, until },
          format,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch bulk data",
        timestamp: new Date().toISOString(),
      };
    }
  });
