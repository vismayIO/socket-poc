import { prisma } from "../../lib/prisma";
import { PrismaClient } from "../../prisma/generated/prisma/client";

export interface SymbolConfigData {
  symbol: string;
  basePrice: number;
  volatility: number;
  trendStrength: number;
  minSpread: number;
  maxSpread: number;
  marketCap: number;
  sector: string;
  volumeProfile: VolumeProfile;
}

export interface VolumeProfile {
  baseVolume: number;
  peakHours: number[]; // Hours of day with peak volume (0-23)
  volatilityMultiplier: number;
  marketCapWeight: number;
}

export class SymbolConfigService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Initialize the database with 50+ major stock symbols
   */
  async initializeSymbols(): Promise<void> {
    const symbols = this.getMajorStockSymbols();

    for (const symbolData of symbols) {
      await this.prisma.symbolConfig.upsert({
        where: { symbol: symbolData.symbol },
        update: {
          basePrice: symbolData.basePrice,
          volatility: symbolData.volatility,
          trendStrength: symbolData.trendStrength,
          minSpread: symbolData.minSpread,
          maxSpread: symbolData.maxSpread,
        },
        create: {
          symbol: symbolData.symbol,
          basePrice: symbolData.basePrice,
          volatility: symbolData.volatility,
          trendStrength: symbolData.trendStrength,
          minSpread: symbolData.minSpread,
          maxSpread: symbolData.maxSpread,
        },
      });
    }
  }

  /**
   * Get configuration for a specific symbol
   */
  async getSymbolConfig(symbol: string): Promise<SymbolConfigData | null> {
    const config = await this.prisma.symbolConfig.findUnique({
      where: { symbol },
    });

    if (!config) return null;

    const symbolData = this.getMajorStockSymbols().find(
      (s) => s.symbol === symbol,
    );

    return {
      symbol: config.symbol,
      basePrice: config.basePrice,
      volatility: config.volatility,
      trendStrength: config.trendStrength,
      minSpread: config.minSpread,
      maxSpread: config.maxSpread,
      marketCap: symbolData?.marketCap || 0,
      sector: symbolData?.sector || "Unknown",
      volumeProfile:
        symbolData?.volumeProfile || this.getDefaultVolumeProfile(),
    };
  }

  /**
   * Get all active symbol configurations
   */
  async getAllActiveSymbols(): Promise<SymbolConfigData[]> {
    const configs = await this.prisma.symbolConfig.findMany({
      where: { isActive: true },
    });

    const symbolsData = this.getMajorStockSymbols();

    return configs.map((config) => {
      const symbolData = symbolsData.find((s) => s.symbol === config.symbol);
      return {
        symbol: config.symbol,
        basePrice: config.basePrice,
        volatility: config.volatility,
        trendStrength: config.trendStrength,
        minSpread: config.minSpread,
        maxSpread: config.maxSpread,
        marketCap: symbolData?.marketCap || 0,
        sector: symbolData?.sector || "Unknown",
        volumeProfile:
          symbolData?.volumeProfile || this.getDefaultVolumeProfile(),
      };
    });
  }

  /**
   * Update symbol configuration
   */
  async updateSymbolConfig(
    symbol: string,
    updates: Partial<SymbolConfigData>,
  ): Promise<void> {
    await this.prisma.symbolConfig.update({
      where: { symbol },
      data: {
        basePrice: updates.basePrice,
        volatility: updates.volatility,
        trendStrength: updates.trendStrength,
        minSpread: updates.minSpread,
        maxSpread: updates.maxSpread,
      },
    });
  }

  /**
   * Get volume profile for a symbol based on market cap and sector
   */
  getVolumeProfile(symbol: string): VolumeProfile {
    const symbolData = this.getMajorStockSymbols().find(
      (s) => s.symbol === symbol,
    );
    return symbolData?.volumeProfile || this.getDefaultVolumeProfile();
  }

  private getDefaultVolumeProfile(): VolumeProfile {
    return {
      baseVolume: 1000000,
      peakHours: [9, 10, 15, 16], // Market open and close
      volatilityMultiplier: 1.0,
      marketCapWeight: 1.0,
    };
  }

  /**
   * Define 50+ major stock symbols with realistic market data
   */
  private getMajorStockSymbols(): SymbolConfigData[] {
    return [
      // Mega Cap Technology
      {
        symbol: "AAPL",
        basePrice: 185.5,
        volatility: 0.025,
        trendStrength: 0.02,
        minSpread: 0.01,
        maxSpread: 0.03,
        marketCap: 2900000000000, // $2.9T
        sector: "Technology",
        volumeProfile: {
          baseVolume: 50000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.2,
          marketCapWeight: 3.0,
        },
      },
      {
        symbol: "MSFT",
        basePrice: 415.25,
        volatility: 0.022,
        trendStrength: 0.015,
        minSpread: 0.01,
        maxSpread: 0.04,
        marketCap: 2800000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 25000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.1,
          marketCapWeight: 2.8,
        },
      },
      {
        symbol: "GOOGL",
        basePrice: 165.8,
        volatility: 0.028,
        trendStrength: 0.01,
        minSpread: 0.01,
        maxSpread: 0.05,
        marketCap: 2100000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 20000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.3,
          marketCapWeight: 2.1,
        },
      },
      {
        symbol: "AMZN",
        basePrice: 185.9,
        volatility: 0.032,
        trendStrength: 0.005,
        minSpread: 0.01,
        maxSpread: 0.06,
        marketCap: 1900000000000,
        sector: "Consumer Discretionary",
        volumeProfile: {
          baseVolume: 35000000,
          peakHours: [9, 10, 14, 15, 16],
          volatilityMultiplier: 1.4,
          marketCapWeight: 1.9,
        },
      },
      {
        symbol: "NVDA",
        basePrice: 135.4,
        volatility: 0.045,
        trendStrength: 0.03,
        minSpread: 0.01,
        maxSpread: 0.08,
        marketCap: 3300000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 45000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 2.0,
          marketCapWeight: 3.3,
        },
      },
      {
        symbol: "TSLA",
        basePrice: 350.75,
        volatility: 0.055,
        trendStrength: 0.02,
        minSpread: 0.01,
        maxSpread: 0.1,
        marketCap: 1100000000000,
        sector: "Consumer Discretionary",
        volumeProfile: {
          baseVolume: 80000000,
          peakHours: [9, 10, 13, 14, 15, 16],
          volatilityMultiplier: 2.5,
          marketCapWeight: 1.1,
        },
      },
      {
        symbol: "META",
        basePrice: 520.3,
        volatility: 0.035,
        trendStrength: 0.015,
        minSpread: 0.01,
        maxSpread: 0.07,
        marketCap: 1300000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 15000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.5,
          marketCapWeight: 1.3,
        },
      },

      // Large Cap Technology
      {
        symbol: "NFLX",
        basePrice: 685.5,
        volatility: 0.038,
        trendStrength: 0.01,
        minSpread: 0.02,
        maxSpread: 0.08,
        marketCap: 295000000000,
        sector: "Communication Services",
        volumeProfile: {
          baseVolume: 3500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.6,
          marketCapWeight: 0.3,
        },
      },
      {
        symbol: "CRM",
        basePrice: 315.2,
        volatility: 0.033,
        trendStrength: 0.008,
        minSpread: 0.02,
        maxSpread: 0.06,
        marketCap: 310000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 2800000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.4,
          marketCapWeight: 0.31,
        },
      },
      {
        symbol: "ORCL",
        basePrice: 175.85,
        volatility: 0.025,
        trendStrength: 0.005,
        minSpread: 0.01,
        maxSpread: 0.04,
        marketCap: 485000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 12000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.1,
          marketCapWeight: 0.49,
        },
      },

      // Financial Services
      {
        symbol: "JPM",
        basePrice: 235.4,
        volatility: 0.028,
        trendStrength: 0.003,
        minSpread: 0.01,
        maxSpread: 0.05,
        marketCap: 685000000000,
        sector: "Financial Services",
        volumeProfile: {
          baseVolume: 8500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.2,
          marketCapWeight: 0.69,
        },
      },
      {
        symbol: "BAC",
        basePrice: 45.75,
        volatility: 0.032,
        trendStrength: 0.002,
        minSpread: 0.01,
        maxSpread: 0.03,
        marketCap: 365000000000,
        sector: "Financial Services",
        volumeProfile: {
          baseVolume: 25000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.3,
          marketCapWeight: 0.37,
        },
      },
      {
        symbol: "WFC",
        basePrice: 72.3,
        volatility: 0.03,
        trendStrength: 0.001,
        minSpread: 0.01,
        maxSpread: 0.04,
        marketCap: 265000000000,
        sector: "Financial Services",
        volumeProfile: {
          baseVolume: 15000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.2,
          marketCapWeight: 0.27,
        },
      },
      {
        symbol: "GS",
        basePrice: 485.6,
        volatility: 0.035,
        trendStrength: 0.004,
        minSpread: 0.02,
        maxSpread: 0.08,
        marketCap: 165000000000,
        sector: "Financial Services",
        volumeProfile: {
          baseVolume: 1800000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.4,
          marketCapWeight: 0.17,
        },
      },

      // Healthcare & Pharmaceuticals
      {
        symbol: "JNJ",
        basePrice: 155.25,
        volatility: 0.018,
        trendStrength: 0.002,
        minSpread: 0.01,
        maxSpread: 0.03,
        marketCap: 385000000000,
        sector: "Healthcare",
        volumeProfile: {
          baseVolume: 6500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 0.9,
          marketCapWeight: 0.39,
        },
      },
      {
        symbol: "PFE",
        basePrice: 25.8,
        volatility: 0.025,
        trendStrength: -0.001,
        minSpread: 0.01,
        maxSpread: 0.02,
        marketCap: 145000000000,
        sector: "Healthcare",
        volumeProfile: {
          baseVolume: 18000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.0,
          marketCapWeight: 0.15,
        },
      },
      {
        symbol: "UNH",
        basePrice: 595.4,
        volatility: 0.022,
        trendStrength: 0.008,
        minSpread: 0.02,
        maxSpread: 0.06,
        marketCap: 555000000000,
        sector: "Healthcare",
        volumeProfile: {
          baseVolume: 2200000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.0,
          marketCapWeight: 0.56,
        },
      },

      // Consumer Goods
      {
        symbol: "KO",
        basePrice: 62.15,
        volatility: 0.015,
        trendStrength: 0.003,
        minSpread: 0.01,
        maxSpread: 0.02,
        marketCap: 265000000000,
        sector: "Consumer Staples",
        volumeProfile: {
          baseVolume: 8500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 0.8,
          marketCapWeight: 0.27,
        },
      },
      {
        symbol: "PG",
        basePrice: 165.75,
        volatility: 0.016,
        trendStrength: 0.004,
        minSpread: 0.01,
        maxSpread: 0.03,
        marketCap: 385000000000,
        sector: "Consumer Staples",
        volumeProfile: {
          baseVolume: 4200000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 0.8,
          marketCapWeight: 0.39,
        },
      },
      {
        symbol: "WMT",
        basePrice: 95.3,
        volatility: 0.02,
        trendStrength: 0.005,
        minSpread: 0.01,
        maxSpread: 0.03,
        marketCap: 685000000000,
        sector: "Consumer Staples",
        volumeProfile: {
          baseVolume: 6800000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 0.9,
          marketCapWeight: 0.69,
        },
      },

      // Energy
      {
        symbol: "XOM",
        basePrice: 118.45,
        volatility: 0.035,
        trendStrength: 0.002,
        minSpread: 0.01,
        maxSpread: 0.05,
        marketCap: 485000000000,
        sector: "Energy",
        volumeProfile: {
          baseVolume: 12000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.5,
          marketCapWeight: 0.49,
        },
      },
      {
        symbol: "CVX",
        basePrice: 155.2,
        volatility: 0.032,
        trendStrength: 0.003,
        minSpread: 0.01,
        maxSpread: 0.04,
        marketCap: 285000000000,
        sector: "Energy",
        volumeProfile: {
          baseVolume: 7500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.4,
          marketCapWeight: 0.29,
        },
      },

      // Industrial
      {
        symbol: "BA",
        basePrice: 185.75,
        volatility: 0.042,
        trendStrength: 0.001,
        minSpread: 0.02,
        maxSpread: 0.08,
        marketCap: 115000000000,
        sector: "Industrial",
        volumeProfile: {
          baseVolume: 4500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.8,
          marketCapWeight: 0.12,
        },
      },
      {
        symbol: "CAT",
        basePrice: 385.9,
        volatility: 0.03,
        trendStrength: 0.004,
        minSpread: 0.02,
        maxSpread: 0.06,
        marketCap: 195000000000,
        sector: "Industrial",
        volumeProfile: {
          baseVolume: 2200000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.3,
          marketCapWeight: 0.2,
        },
      },

      // Additional High-Volume Stocks
      {
        symbol: "AMD",
        basePrice: 125.85,
        volatility: 0.048,
        trendStrength: 0.015,
        minSpread: 0.01,
        maxSpread: 0.08,
        marketCap: 205000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 35000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 2.2,
          marketCapWeight: 0.21,
        },
      },
      {
        symbol: "INTC",
        basePrice: 22.45,
        volatility: 0.038,
        trendStrength: -0.005,
        minSpread: 0.01,
        maxSpread: 0.04,
        marketCap: 95000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 28000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.6,
          marketCapWeight: 0.1,
        },
      },
      {
        symbol: "PYPL",
        basePrice: 85.3,
        volatility: 0.04,
        trendStrength: 0.002,
        minSpread: 0.01,
        maxSpread: 0.06,
        marketCap: 95000000000,
        sector: "Financial Services",
        volumeProfile: {
          baseVolume: 8500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.7,
          marketCapWeight: 0.1,
        },
      },
      {
        symbol: "DIS",
        basePrice: 115.6,
        volatility: 0.035,
        trendStrength: 0.003,
        minSpread: 0.01,
        maxSpread: 0.05,
        marketCap: 205000000000,
        sector: "Communication Services",
        volumeProfile: {
          baseVolume: 6200000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.4,
          marketCapWeight: 0.21,
        },
      },

      // Emerging Growth & High Beta
      {
        symbol: "PLTR",
        basePrice: 65.25,
        volatility: 0.065,
        trendStrength: 0.025,
        minSpread: 0.01,
        maxSpread: 0.12,
        marketCap: 145000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 45000000,
          peakHours: [9, 10, 13, 14, 15, 16],
          volatilityMultiplier: 3.0,
          marketCapWeight: 0.15,
        },
      },
      {
        symbol: "RIVN",
        basePrice: 12.85,
        volatility: 0.075,
        trendStrength: 0.01,
        minSpread: 0.01,
        maxSpread: 0.15,
        marketCap: 12000000000,
        sector: "Consumer Discretionary",
        volumeProfile: {
          baseVolume: 25000000,
          peakHours: [9, 10, 13, 14, 15, 16],
          volatilityMultiplier: 3.5,
          marketCapWeight: 0.01,
        },
      },
      {
        symbol: "COIN",
        basePrice: 285.4,
        volatility: 0.08,
        trendStrength: 0.02,
        minSpread: 0.02,
        maxSpread: 0.2,
        marketCap: 75000000000,
        sector: "Financial Services",
        volumeProfile: {
          baseVolume: 15000000,
          peakHours: [9, 10, 13, 14, 15, 16],
          volatilityMultiplier: 4.0,
          marketCapWeight: 0.08,
        },
      },

      // ETFs for diversification
      {
        symbol: "SPY",
        basePrice: 585.25,
        volatility: 0.018,
        trendStrength: 0.008,
        minSpread: 0.01,
        maxSpread: 0.02,
        marketCap: 0, // ETF
        sector: "ETF",
        volumeProfile: {
          baseVolume: 35000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.0,
          marketCapWeight: 2.0,
        },
      },
      {
        symbol: "QQQ",
        basePrice: 515.8,
        volatility: 0.022,
        trendStrength: 0.012,
        minSpread: 0.01,
        maxSpread: 0.03,
        marketCap: 0, // ETF
        sector: "ETF",
        volumeProfile: {
          baseVolume: 25000000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.2,
          marketCapWeight: 1.8,
        },
      },

      // Additional symbols to reach 50+
      {
        symbol: "V",
        basePrice: 315.45,
        volatility: 0.025,
        trendStrength: 0.006,
        minSpread: 0.01,
        maxSpread: 0.04,
        marketCap: 685000000000,
        sector: "Financial Services",
        volumeProfile: {
          baseVolume: 4500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.1,
          marketCapWeight: 0.69,
        },
      },
      {
        symbol: "MA",
        basePrice: 525.3,
        volatility: 0.024,
        trendStrength: 0.007,
        minSpread: 0.02,
        maxSpread: 0.05,
        marketCap: 485000000000,
        sector: "Financial Services",
        volumeProfile: {
          baseVolume: 2800000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.0,
          marketCapWeight: 0.49,
        },
      },
      {
        symbol: "HD",
        basePrice: 415.75,
        volatility: 0.022,
        trendStrength: 0.005,
        minSpread: 0.02,
        maxSpread: 0.05,
        marketCap: 425000000000,
        sector: "Consumer Discretionary",
        volumeProfile: {
          baseVolume: 2500000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.0,
          marketCapWeight: 0.43,
        },
      },
      {
        symbol: "ADBE",
        basePrice: 485.2,
        volatility: 0.03,
        trendStrength: 0.008,
        minSpread: 0.02,
        maxSpread: 0.06,
        marketCap: 215000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 1800000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.3,
          marketCapWeight: 0.22,
        },
      },
      {
        symbol: "CRM",
        basePrice: 315.85,
        volatility: 0.033,
        trendStrength: 0.01,
        minSpread: 0.02,
        maxSpread: 0.06,
        marketCap: 310000000000,
        sector: "Technology",
        volumeProfile: {
          baseVolume: 2200000,
          peakHours: [9, 10, 15, 16],
          volatilityMultiplier: 1.4,
          marketCapWeight: 0.31,
        },
      },
    ];
  }
}
