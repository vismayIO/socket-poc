import { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import { Table as Arrow, DataType } from "apache-arrow";

import { logElapsedTime } from "../util/perf";
import { DEBUG } from "../init/initializeDuckDb";

/**
 * Execute a SQL query, and return the result as an Apache Arrow table.
 */
export const runQuery = async <T extends {
        [key: string]: DataType;
    } = any>(db: AsyncDuckDB, sql: string) => {
  const start = performance.now();
  const conn = await db.connect();
  const arrow = await conn.query<T>(sql);
  await conn.close();

  DEBUG && logElapsedTime(`Run query: ${sql}`, start);
  return arrow;
};
