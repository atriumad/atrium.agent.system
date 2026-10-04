import { type ConsumerDefinition, defineConsumer, type Tx } from "@atrium/core";
import { eq } from "drizzle-orm";
import { recoveryCases, reviewRequests, surveyInvitations, surveyResponses } from "../infra/schema";

/**
 * Erasure: everything here that points at a guest stops pointing. The free-text comment of an
 * erased guest goes too, since it can say who they are. Ratings and counts stay.
 */
export async function scrubErasedGuest(tx: Tx, guestId: string): Promise<number> {
  const responses = await tx
    .update(surveyResponses)
    .set({ guestId: null, comment: null })
    .where(eq(surveyResponses.guestId, guestId))
    .returning({ id: surveyResponses.id });
  await tx
    .update(surveyInvitations)
    .set({ guestId: null })
    .where(eq(surveyInvitations.guestId, guestId));
  await tx
    .update(recoveryCases)
    .set({ guestId: null, note: null })
    .where(eq(recoveryCases.guestId, guestId));
  // A pending request for an erased guest must never send, and it no longer names anyone.
  await tx.delete(reviewRequests).where(eq(reviewRequests.guestId, guestId));
  return responses.length;
}

export const erasureConsumer: ConsumerDefinition = defineConsumer({
  name: "reputation.erase_guest",
  event: "guest.erased",
  handler: async (event, tx) => {
    await scrubErasedGuest(tx, event.data.guestId);
  },
}) as ConsumerDefinition;
