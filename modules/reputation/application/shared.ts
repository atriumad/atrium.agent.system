import type { AtriumEvent } from "@atrium/contracts";
import type { NotificationTransport, Tx } from "@atrium/core";

/** What the use cases may be handed. Everything is optional so a test can pass what it needs. */
export type ReputationDeps = {
  /** Enqueues an event inside the transaction. `bus.publish` has this shape. */
  publish?: (event: AtriumEvent, tx: Tx) => Promise<void>;
  transport?: NotificationTransport;
  now?: () => Date;
};

export const clock = (deps: ReputationDeps) => deps.now?.() ?? new Date();

export function envelope(clientId: string, locationId: string | null, at: Date) {
  return { id: crypto.randomUUID(), occurredAt: at.toISOString(), clientId, locationId };
}
