import type { Database } from "@atrium/core";
import { sql } from "drizzle-orm";
import { LIMITS, retryAfterSeconds, windowStart } from "../domain/rate";

/**
 * Counts one hit against a fixed window and says whether it is still within the limit.
 * Goes through `crm.hit_rate` (security definer): the counters table is not reachable otherwise.
 */
export async function checkRate(
  db: Database,
  key: string,
  limitName: keyof typeof LIMITS,
  now: Date,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const { limit, windowSeconds } = LIMITS[limitName];
  const start = windowStart(now, windowSeconds);
  const rows = await db.execute<{ allowed: boolean }>(
    sql`select crm.hit_rate(${key}, ${start.toISOString()}::timestamptz, ${limit}::int) as allowed`,
  );
  return {
    allowed: rows[0]?.allowed === true,
    retryAfter: retryAfterSeconds(now, windowSeconds),
  };
}
