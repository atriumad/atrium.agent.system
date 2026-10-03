import { eq } from "drizzle-orm";
import { isValidTimeZone } from "../domain/location";
import type { Tx } from "./db";
import { clients, locations } from "./schema";

export type NewClient = { name: string; slug: string };
export type NewLocation = { name: string; timeZone: string; radiusMiles?: number };

/** Portfolio-level: call inside withAgency. */
export async function createClient(tx: Tx, input: NewClient) {
  const [row] = await tx.insert(clients).values(input).returning();
  if (!row) throw new Error("client was not created");
  return row;
}

/** Every query below requires the client. RLS is the second defense, not the first. */
export function listLocations(tx: Tx, clientId: string) {
  return tx.select().from(locations).where(eq(locations.clientId, clientId));
}

export async function createLocation(tx: Tx, clientId: string, input: NewLocation) {
  if (!isValidTimeZone(input.timeZone)) throw new Error(`unknown time zone: ${input.timeZone}`);
  const [row] = await tx
    .insert(locations)
    .values({ ...input, clientId })
    .returning();
  if (!row) throw new Error("location was not created");
  return row;
}
