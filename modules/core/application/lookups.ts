import { eq, inArray, sql } from "drizzle-orm";
import type { Database, Tx } from "../infra/db";
import { clients, locations } from "../infra/schema";

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

export type LocationLabel = { locationName: string; clientId: string; clientName: string };

/** Names for a set of locations, for screens that list rows from several clients. RLS applies. */
export async function describeLocations(
  tx: Tx,
  locationIds: string[],
): Promise<Map<string, LocationLabel>> {
  if (locationIds.length === 0) return new Map();
  const rows = await tx
    .select({
      id: locations.id,
      locationName: locations.name,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(locations)
    .innerJoin(clients, eq(clients.id, locations.clientId))
    .where(inArray(locations.id, [...new Set(locationIds)]));
  return new Map(
    rows.map((r) => [
      r.id,
      { locationName: r.locationName, clientId: r.clientId, clientName: r.clientName },
    ]),
  );
}
