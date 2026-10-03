import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
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

/** Runs `fn` in a transaction scoped to one client. RLS shows only that client's rows. */
export function withTenant<T>(db: Database, clientId: string, fn: (tx: Tx) => Promise<T>) {
  if (!UUID.test(clientId)) throw new Error("withTenant requires a client uuid");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.client_id', ${clientId}, true)`);
    return fn(tx);
  });
}

/** Runs `fn` with portfolio scope. For agency roles only; the caller checks the role. */
export function withAgency<T>(db: Database, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.scope', 'agency', true)`);
    return fn(tx);
  });
}
