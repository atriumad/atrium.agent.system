import { lt } from "drizzle-orm";
import { type Database, type Tx, withAgency } from "../infra/db";
import type { JobDefinition } from "../infra/event-bus";
import { processedEvents } from "../infra/schema";

/** Days a consumer remembers an event id. Redelivery stops long before this. */
export const PROCESSED_EVENT_RETENTION_DAYS = 30;

/**
 * Deletes idempotency records older than the retention window. Needs agency scope (every client's
 * rows). Returns how many it removed.
 */
export async function pruneProcessedEvents(
  tx: Tx,
  now: Date = new Date(),
  retentionDays: number = PROCESSED_EVENT_RETENTION_DAYS,
): Promise<number> {
  if (retentionDays < 1) throw new Error("retention must be at least one day");
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const removed = await tx
    .delete(processedEvents)
    .where(lt(processedEvents.processedAt, cutoff))
    .returning({ eventId: processedEvents.eventId });
  return removed.length;
}

/** The recurring jobs Core owns, ready for the worker to schedule. */
export function coreJobs(db: Database): JobDefinition[] {
  return [
    {
      name: "core.prune_processed_events",
      cron: "30 3 * * *",
      run: async () => {
        await withAgency(db, (tx) => pruneProcessedEvents(tx));
      },
    },
  ];
}
