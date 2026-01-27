import type { BunFile } from "bun";

export const PARQUET_MIME_TYPE = "application/vnd.apache.parquet";

/**
 * Is a given file a Parquet file?
 */
export const isParquetFile = async (file: BunFile) => {
  const buf = await file.slice(0, 4).arrayBuffer();
  return new TextDecoder().decode(buf) === "PAR1";
};
