import { type TradingData, type User } from "../../generated/prisma/client";
import { prisma } from "./prisma";

/**
 * Initialize Database (Connect Prisma)
*/


/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
    await prisma.$disconnect();
    console.log("Prisma connection closed");
}

// ============ User Operations ============

export type DBUser = User;

/**
 * Insert a new user
 */
export async function insertUser(user: Omit<DBUser, "created_at">): Promise<void> {
    await prisma.user.create({
        data: {
            id: user.id,
            username: user.username,
            password_hash: user.password_hash,
            nkey_seed: user.nkey_seed,
            nkey_public: user.nkey_public,
            jwt: user.jwt,
        },
    });
}

/**
 * Find user by username
 */
export async function findUserByUsername(username: string): Promise<DBUser | null> {
    return await prisma.user.findUnique({
        where: { username },
    });
}

/**
 * Find user by ID
 */
export async function findUserById(id: string): Promise<DBUser | null> {
    return await prisma.user.findUnique({
        where: { id },
    });
}

// ============ Trading Data Operations ============

export interface DBTradingData {
    id: number;
    timestamp: number;
    price: number;
    volume: number;
    symbol: string;
    created_at: Date;
}

/**
 * Insert trading data
 */
export async function insertTradingData(data: {
    timestamp: number;
    price: number;
    volume: number;
    symbol: string;
}): Promise<void> {
    await prisma.tradingData.create({
        data: {
            timestamp: BigInt(data.timestamp),
            price: data.price,
            volume: data.volume,
            symbol: data.symbol,
        },
    });
}

/**
 * Get recent trading data
 */
export async function getRecentTradingData(
    symbol: string,
    limit: number = 100
): Promise<DBTradingData[]> {
    const results = await prisma.tradingData.findMany({
        where: { symbol },
        orderBy: { timestamp: "desc" },
        take: limit,
    });

    return results.map((r: TradingData) => ({
        ...r,
        timestamp: Number(r.timestamp)
    }));
}

/**
 * Get trading data in time range
 */
export async function getTradingDataInRange(
    symbol: string,
    startTime: number,
    endTime: number
): Promise<DBTradingData[]> {
    const results = await prisma.tradingData.findMany({
        where: {
            symbol,
            timestamp: {
                gte: BigInt(startTime),
                lte: BigInt(endTime),
            },
        },
        orderBy: { timestamp: "asc" },
    });

    return results.map((r: TradingData) => ({
        ...r,
        timestamp: Number(r.timestamp)
    }));
}

/**
 * Get all trading data (limited)
 */
export async function getAllTradingData(limit: number = 100): Promise<DBTradingData[]> {
    const results = await prisma.tradingData.findMany({
        orderBy: { timestamp: "desc" },
        take: limit,
    });

    return results.map((r: TradingData) => ({
        ...r,
        timestamp: Number(r.timestamp)
    }));
}
