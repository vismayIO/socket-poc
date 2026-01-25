-- CreateTable
CREATE TABLE "stock_trade" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT,
    "tradeType" TEXT NOT NULL DEFAULT 'MARKET',
    "executionVenue" TEXT,

    CONSTRAINT "stock_trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_book_snapshot" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 1,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_book_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ohlcv_data" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "intervalType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "openPrice" DOUBLE PRECISION NOT NULL,
    "highPrice" DOUBLE PRECISION NOT NULL,
    "lowPrice" DOUBLE PRECISION NOT NULL,
    "closePrice" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ohlcv_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symbol_config" (
    "symbol" TEXT NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "trendStrength" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "minSpread" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "maxSpread" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "symbol_config_pkey" PRIMARY KEY ("symbol")
);

-- CreateIndex
CREATE INDEX "stock_trade_symbol_timestamp_idx" ON "stock_trade"("symbol", "timestamp");

-- CreateIndex
CREATE INDEX "stock_trade_timestamp_idx" ON "stock_trade"("timestamp");

-- CreateIndex
CREATE INDEX "order_book_snapshot_symbol_timestamp_idx" ON "order_book_snapshot"("symbol", "timestamp");

-- CreateIndex
CREATE INDEX "order_book_snapshot_symbol_side_price_idx" ON "order_book_snapshot"("symbol", "side", "price");

-- CreateIndex
CREATE INDEX "ohlcv_data_symbol_intervalType_timestamp_idx" ON "ohlcv_data"("symbol", "intervalType", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ohlcv_data_symbol_intervalType_timestamp_key" ON "ohlcv_data"("symbol", "intervalType", "timestamp");
