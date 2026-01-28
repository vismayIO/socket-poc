import { AsyncDuckDB } from "@duckdb/duckdb-wasm";

import { DataType, Table } from "apache-arrow";
import { DEBUG } from "../init/initializeDuckDb";
import { logElapsedTime } from "./perf";

/**
 * Execute a SQL query, and return the result as an Apache Arrow table.
 */
export const runQuery = async <T extends {
  [key: string]: DataType;
} = any>(db: AsyncDuckDB, sql: string): Promise<Table<T>> => {
  const start = performance.now();
  const conn = await db.connect();
  const arrow = await conn.query(sql);
  await conn.close();

  DEBUG && logElapsedTime(`Run query: ${sql}`, start);
  return arrow as unknown as Table<T>;
};
