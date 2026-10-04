import { type AtriumEvent, parseEvent, type SignalRow } from "@atrium/contracts";
import {
  type Database,
  findLocationClients,
  type Tx,
  withAgency,
  withEachTenant,
} from "@atrium/core";
import { sql } from "drizzle-orm";
import { checkBatch, monthsOf, type Principal, type Problem, summarize } from "../domain/ingestion";
import { signalsDaily } from "../infra/schema";

/** The batch was refused as a whole. Nothing was written. */
export class IngestionRejected extends Error {
  constructor(readonly problems: Problem[]) {
    super(`batch rejected: ${problems.length} problem(s)`);
  }
}

export type IngestDeps = {
  /** Enqueues an event inside the transaction. `bus.publish` has this shape. */
  publish?: (event: AtriumEvent, tx: Tx) => Promise<void>;
  /** Injectable clock, for tests. */
  now?: () => Date;
};

export type IngestResult = { inserted: number; updated: number; clients: number };

const CHUNK = 1000;

/**
 * Accepts a batch from a connector. All or nothing: every row is checked first, then every
 * client's rows are written in one transaction with RLS scoped to that client. A re-run replaces
 * the day (same natural key, new value), so a connector can always retry.
 */
export async function ingestSignals(
  db: Database,
  principal: Principal,
  rows: readonly SignalRow[],
  deps: IngestDeps = {},
): Promise<IngestResult> {
  const today = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);

  // Reading which client owns a location needs portfolio scope. It is a read only; every write
  // below runs scoped to a single client, and the token's client list is checked first.
  const locationClient = await withAgency(db, (tx) =>
    findLocationClients(tx, [...new Set(rows.map((row) => row.locationId))]),
  );
  const { problems, byClient } = checkBatch(rows, { principal, locationClient, today });
  if (problems.length > 0) throw new IngestionRejected(problems);

  const clientIds = [...byClient.keys()];
  const counts = await withEachTenant(db, clientIds, async (tx, clientId) => {
    const group = byClient.get(clientId) ?? [];

    for (const month of monthsOf(group)) {
      await tx.execute(sql`select signals.ensure_partition(${month}::date)`);
    }

    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < group.length; i += CHUNK) {
      const result = await tx
        .insert(signalsDaily)
        .values(
          group.slice(i, i + CHUNK).map((row) => ({
            clientId,
            locationId: row.locationId,
            date: row.date,
            source: row.source,
            platform: row.platform,
            elementId: row.elementId,
            signalType: row.signalType,
            value: row.value,
            meta: row.meta,
            guestId: row.guestId,
          })),
        )
        .onConflictDoUpdate({
          target: [
            signalsDaily.date,
            signalsDaily.locationId,
            signalsDaily.source,
            signalsDaily.platform,
            signalsDaily.elementId,
            signalsDaily.signalType,
          ],
          set: {
            clientId: sql`excluded.client_id`,
            value: sql`excluded.value`,
            meta: sql`excluded.meta`,
            guestId: sql`excluded.guest_id`,
            ingestedAt: sql`now()`,
            revision: sql`${signalsDaily.revision} + 1`,
          },
        })
        .returning({ revision: signalsDaily.revision });
      for (const row of result) {
        if (row.revision === 1) inserted++;
        else updated++;
      }
    }

    // One event per source for this client: the rollup job needs the range to rebuild.
    for (const source of new Set(group.map((row) => row.source))) {
      const sourceRows = group.filter((row) => row.source === source);
      await deps.publish?.(
        parseEvent({
          type: "signals.ingested",
          version: 1,
          id: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          clientId,
          locationId: null,
          data: { source, ...summarize(sourceRows) },
        }),
        tx,
      );
    }
    return { inserted, updated };
  });

  return {
    inserted: counts.reduce((sum, c) => sum + c.inserted, 0),
    updated: counts.reduce((sum, c) => sum + c.updated, 0),
    clients: clientIds.length,
  };
}
