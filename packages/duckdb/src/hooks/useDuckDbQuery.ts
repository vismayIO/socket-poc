
import { use, useCallback } from "react";
import { runQuery } from "../util/runQuery";
import { useDuckDb } from "./useDuckDb";

export const useDuckDbQuery = (
  sql: string | undefined,
) => {
  const db = useDuckDb();

  const dbQuery  = useCallback(async () => {
    if (!db || !sql) {
      return undefined;
    }

    const arrow = await runQuery(db, sql);
    return arrow;
  }, [db, sql]);

  const arrow = use(dbQuery());

  return arrow;
};
