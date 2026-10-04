import {
  type ConsumerDefinition,
  type Database,
  defineConsumer,
  type JobDefinition,
  type Tx,
} from "@atrium/core";
import { and, eq, sql } from "drizzle-orm";
import { signalsDaily } from "../infra/schema";

/** How many months past the current one keep a ready partition. The database caps it at ~13. */
export const PARTITION_MONTHS_AHEAD = 12;

/** First day of the month, `months` after the given date's month. UTC. */
function monthStart(from: Date, months: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Makes sure the current month and the next `monthsAhead` have a partition, so an ingestion on
 * the first of a month never pays for (or races on) creating one. Safe to run any time.
 */
export async function ensureFuturePartitions(
  db: Database,
  options: { from?: Date; monthsAhead?: number } = {},
): Promise<string[]> {
  const monthsAhead = options.monthsAhead ?? PARTITION_MONTHS_AHEAD;
  if (!Number.isInteger(monthsAhead) || monthsAhead < 0 || monthsAhead > 12) {
    throw new Error("monthsAhead must be an integer from 0 to 12");
  }
  const from = options.from ?? new Date();
  const months: string[] = [];
  for (let i = 0; i <= monthsAhead; i++) months.push(monthStart(from, i));
  await db.transaction(async (tx) => {
    for (const month of months)
      await tx.execute(sql`select signals.ensure_partition(${month}::date)`);
  });
  return months;
}

/**
 * Erasure: a guest's signals stay (the counts are real) but stop pointing at the person.
 * Scoped to the client, so another client's rows cannot be touched. Returns the rows scrubbed.
 */
export async function scrubErasedGuest(tx: Tx, clientId: string, guestId: string): Promise<number> {
  const scrubbed = await tx
    .update(signalsDaily)
    .set({ guestId: null })
    .where(and(eq(signalsDaily.clientId, clientId), eq(signalsDaily.guestId, guestId)))
    .returning({ date: signalsDaily.date });
  return scrubbed.length;
}

export const signalsConsumers: ConsumerDefinition[] = [
  defineConsumer({
    name: "signals.erase_guest",
    event: "guest.erased",
    handler: async (event, tx) => {
      await scrubErasedGuest(tx, event.clientId, event.data.guestId);
    },
  }) as ConsumerDefinition,
];

export function signalsJobs(db: Database): JobDefinition[] {
  return [
    {
      name: "signals.ensure_partitions",
      // The first of each month, 03:00 UTC, well before the first ingestion of the day.
      cron: "0 3 1 * *",
      run: async () => {
        await ensureFuturePartitions(db);
      },
    },
  ];
}
