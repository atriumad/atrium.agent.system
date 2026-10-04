import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import type { Scope } from "../domain/roles";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new SQL(url);
  const db = drizzle({ client, schema });
  return { db, close: () => client.close() };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The nil uuid matches nothing: an empty location list must never read as "no restriction". */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Runs `fn` in a transaction scoped to one client. RLS shows only that client's rows.
 * `locationIds` narrows locations to those ids (client staff); an empty list shows none.
 */
export function withTenant<T>(
  db: Database,
  clientId: string,
  fn: (tx: Tx) => Promise<T>,
  options: { locationIds?: string[] } = {},
) {
  if (!UUID.test(clientId)) throw new Error("withTenant requires a client uuid");
  const locationIds = options.locationIds;
  if (locationIds?.some((id) => !UUID.test(id)))
    throw new Error("withTenant requires location uuids");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.client_id', ${clientId}, true)`);
    if (locationIds) {
      const list = locationIds.length ? locationIds.join(",") : NIL_UUID;
      await tx.execute(sql`select set_config('app.location_ids', ${list}, true)`);
    }
    return fn(tx);
  });
}

/** Runs `fn` for a user who sees only the clients assigned to them. */
export function withAssigned<T>(db: Database, userId: string, fn: (tx: Tx) => Promise<T>) {
  if (!userId) throw new Error("withAssigned requires a user id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'assigned', true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/** The one door from a resolved scope to a transaction. Prefer it over the three above. */
export function withScope<T>(db: Database, scope: Scope, fn: (tx: Tx) => Promise<T>) {
  switch (scope.kind) {
    case "agency":
      return withAgency(db, fn);
    case "assigned":
      return withAssigned(db, scope.userId, fn);
    case "client":
      return withTenant(db, scope.clientId, fn, {
        ...(scope.locationIds ? { locationIds: scope.locationIds } : {}),
      });
  }
}

/** Runs `fn` with portfolio scope. For agency roles only; the caller checks the role. */
export function withAgency<T>(db: Database, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'agency', true)`);
    return fn(tx);
  });
}
