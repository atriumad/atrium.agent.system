import { type ConsumerDefinition, defineConsumer, type Tx } from "@atrium/core";
import { eq } from "drizzle-orm";
import { loyaltyCards } from "../infra/schema";

/**
 * Erasure: the card stops pointing at the guest. It stays a working card with its stamps and
 * rewards, now anonymous, as it was before the guest left an email. Returns the cards changed.
 */
export async function eraseGuestCards(tx: Tx, guestId: string): Promise<number> {
  const rows = await tx
    .update(loyaltyCards)
    .set({ guestId: null })
    .where(eq(loyaltyCards.guestId, guestId))
    .returning({ id: loyaltyCards.id });
  return rows.length;
}

export const crmErasureConsumer: ConsumerDefinition = defineConsumer({
  name: "crm.erase_guest",
  event: "guest.erased",
  handler: async (event, tx) => {
    await eraseGuestCards(tx, event.data.guestId);
  },
}) as ConsumerDefinition;
