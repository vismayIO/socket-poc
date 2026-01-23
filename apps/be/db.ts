import * as duckdb from "duckdb";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";

// Database file path
const DB_DIR = "./data";
const DB_PATH = `${DB_DIR}/trading.db`;

// DuckDB instance
let db: duckdb.Database | null = null;
let connection: duckdb.Connection | null = null;

/**
 * Initialize DuckDB database and create tables
 */
export async function initDatabase(): Promise<void> {
    // Ensure data directory exists
    if (!existsSync(DB_DIR)) {
        await mkdir(DB_DIR, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        db = new duckdb.Database(DB_PATH, (err) => {
            if (err) {
                console.error("Failed to open DuckDB:", err);
                reject(err);
                return;
            }

            connection = db!.connect();
            console.log(`✅ DuckDB initialized at ${DB_PATH}`);

            // Create tables
            createTables()
                .then(() => resolve())
                .catch(reject);
        });
    });
}

/**
 * Create database tables
 */
async function createTables(): Promise<void> {
    if (!connection) throw new Error("Database not initialized");

    // Users table
    await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR PRIMARY KEY,
      username VARCHAR UNIQUE NOT NULL,
      password_hash VARCHAR NOT NULL,
      nkey_seed VARCHAR NOT NULL,
      nkey_public VARCHAR NOT NULL,
      jwt VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Trading data table
    await runQuery(`
    CREATE TABLE IF NOT EXISTS trading_data (
      id INTEGER PRIMARY KEY,
      timestamp BIGINT NOT NULL,
      price DOUBLE NOT NULL,
      volume INTEGER NOT NULL,
      symbol VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Create sequence for trading_data id
    await runQuery(`CREATE SEQUENCE IF NOT EXISTS trading_data_seq START 1`);

    console.log("✅ Database tables created");
}

/**
 * Run a query that doesn't return results
 */
function runQuery(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!connection) {
            reject(new Error("Database not initialized"));
            return;
        }
        connection.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * Run a query and return all results
 */
export function queryAll<T>(sql: string, ...params: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
        if (!connection) {
            reject(new Error("Database not initialized"));
            return;
        }
        connection.all(sql, ...params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows as T[]);
        });
    });
}

/**
 * Run a parameterized query
 */
export function run(sql: string, ...params: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!connection) {
            reject(new Error("Database not initialized"));
            return;
        }
        connection.run(sql, ...params, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============ User Operations ============

export interface DBUser {
    id: string;
    username: string;
    password_hash: string;
    nkey_seed: string;
    nkey_public: string;
    jwt: string;
    created_at: Date;
}

/**
 * Insert a new user
 */
export async function insertUser(user: Omit<DBUser, "created_at">): Promise<void> {
    await run(
        `INSERT INTO users (id, username, password_hash, nkey_seed, nkey_public, jwt) 
     VALUES (?, ?, ?, ?, ?, ?)`,
        user.id,
        user.username,
        user.password_hash,
        user.nkey_seed,
        user.nkey_public,
        user.jwt
    );
}

/**
 * Find user by username
 */
export async function findUserByUsername(username: string): Promise<DBUser | null> {
    const rows = await queryAll<DBUser>(
        `SELECT * FROM users WHERE username = ?`,
        username
    );
    return rows[0] ?? null;
}

/**
 * Find user by ID
 */
export async function findUserById(id: string): Promise<DBUser | null> {
    const rows = await queryAll<DBUser>(
        `SELECT * FROM users WHERE id = ?`,
        id
    );
    return rows[0] ?? null;
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
    await run(
        `INSERT INTO trading_data (id, timestamp, price, volume, symbol) 
     VALUES (nextval('trading_data_seq'), ?, ?, ?, ?)`,
        data.timestamp,
        data.price,
        data.volume,
        data.symbol
    );
}

/**
 * Get recent trading data
 */
export async function getRecentTradingData(
    symbol: string,
    limit: number = 100
): Promise<DBTradingData[]> {
    return queryAll<DBTradingData>(
        `SELECT * FROM trading_data 
     WHERE symbol = ? 
     ORDER BY timestamp DESC 
     LIMIT ?`,
        symbol,
        limit
    );
}

/**
 * Get trading data in time range
 */
export async function getTradingDataInRange(
    symbol: string,
    startTime: number,
    endTime: number
): Promise<DBTradingData[]> {
    return queryAll<DBTradingData>(
        `SELECT * FROM trading_data 
     WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp ASC`,
        symbol,
        startTime,
        endTime
    );
}

/**
 * Get all trading data (limited)
 */
export async function getAllTradingData(limit: number = 100): Promise<DBTradingData[]> {
    return queryAll<DBTradingData>(
        `SELECT * FROM trading_data ORDER BY timestamp DESC LIMIT ?`,
        limit
    );
}

/**
 * Close database connection
 */
export function closeDatabase(): Promise<void> {
    return new Promise((resolve) => {
        if (connection) {
            connection.close(() => {
                if (db) {
                    db.close(() => {
                        console.log("DuckDB connection closed");
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}
