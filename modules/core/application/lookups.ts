import { sql } from "drizzle-orm";
import type { Database, Tx } from "../infra/db";

/**
 * The client that owns a location, or null. For public links that carry only a location; it is
 * the single question answered before a scope exists.
 */
export async function clientIdForLocation(
  db: Database,
  locationId: string,
): Promise<string | null> {
  const rows = await db.execute<{ id: string | null }>(
    sql`select core.client_id_for_location(${locationId}::uuid) as id`,
  );
  return rows[0]?.id ?? null;
}

export type AlertRecipient = { userId: string; role: string };

/** The people to tell when something needs a person: the client's owners and assigned team. */
export async function alertRecipients(tx: Tx, clientId: string): Promise<AlertRecipient[]> {
  const rows = await tx.execute<{ user_id: string; role: string }>(
    sql`select user_id, role from core.alert_recipients(${clientId}::uuid)`,
  );
  return rows.map((row) => ({ userId: row.user_id, role: row.role }));
}
