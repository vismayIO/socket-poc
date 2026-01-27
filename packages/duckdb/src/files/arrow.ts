import { Table as Arrow, tableFromIPC, tableToIPC, type TypeMap } from "apache-arrow";
export type { Table as Arrow } from "apache-arrow";

import type { BunFile } from "bun";
import type { JSONObject } from "../util/types";

export const ARROW_MIME_TYPE = "application/vnd.apache.arrow.file";

/**
 * Is a given object an Arrow table?
 */
export const isArrow = (obj: unknown): obj is Arrow => obj instanceof Arrow;

/**
 * Is a given File a valid Arrow IPC file?
 */
export const isArrowFile = async (file: BunFile) => {
  try {
    const buffer = await file.arrayBuffer();
    arrayBufferToArrow(buffer);
    return true;
  } catch {}

  return false;
};

/**
 * Load an Arrow table from an IPC file, as an ArrayBuffer.
 */
export const arrayBufferToArrow = <T extends TypeMap = any>(arrayBuffer: ArrayBuffer) => {
  const arrow = tableFromIPC<T>(new Uint8Array(arrayBuffer));
  return arrow;
};

/**
 * Convert an Arrow to an IPC file, as an ArrayBuffer.
 */
export const arrowToArrayBuffer = (arrow: Arrow) => {
  const array = tableToIPC(arrow, "file");
  return array.buffer;
};

/**
 * Convert an Apache Arrow table to an array of JSON row objects.
 */
export function arrowToJSON(arrow: Arrow) {
  const rows: Record<string, JSONObject>[] = [];
  for (let i = 0; i < arrow.numRows; i++) {
    const row = arrow.get(i);
    if (row) {
      rows.push(row.toJSON());
    }
  }
  return rows;
}
