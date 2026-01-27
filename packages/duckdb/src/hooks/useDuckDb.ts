import { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import { use } from "react";

import { getDuckDB } from "../init/initializeDuckDb";

/**
 * React hook to access a singleton DuckDb instance within components or other hooks.
 */
export const useDuckDb = () => {
  const db = use(getDuckDB());

  return db;
};
