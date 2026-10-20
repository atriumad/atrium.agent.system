import type { Tx } from "@atrium/core";
import { asc, eq } from "drizzle-orm";
import type { EventRow, LoyaltyEventKind } from "../domain/loyalty";
import { loyaltyEvents } from "./schema";

type EventRecord = {
  id: string;
  /** Postgres returns a bigint as a string; the mapping below is where it becomes a number. */
  seq: number | string | bigint;
  kind: string;
  createdAt: Date;
  voidsId: string | null;
};

/** The one place a database event row becomes the domain's `EventRow`. */
export function toEventRow(row: EventRecord): EventRow {
  return {
    id: row.id,
    seq: Number(row.seq),
    kind: row.kind as LoyaltyEventKind,
    at: row.createdAt,
    ...(row.voidsId ? { voidsId: row.voidsId } : {}),
  };
}

/** A card's events in the order progress needs: (created_at, seq), ascending. */
export async function listCardEvents(tx: Tx, cardId: string): Promise<EventRow[]> {
  const rows = await tx
    .select({
      id: loyaltyEvents.id,
      seq: loyaltyEvents.seq,
      kind: loyaltyEvents.kind,
      createdAt: loyaltyEvents.createdAt,
      voidsId: loyaltyEvents.voidsId,
    })
    .from(loyaltyEvents)
    .where(eq(loyaltyEvents.cardId, cardId))
    .orderBy(asc(loyaltyEvents.createdAt), asc(loyaltyEvents.seq));
  return rows.map(toEventRow);
}
