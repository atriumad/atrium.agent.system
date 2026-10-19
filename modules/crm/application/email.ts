import {
  type Database,
  IdentityConflictError,
  InvalidContactError,
  recordConsent,
  resolveGuest,
  withTenant,
} from "@atrium/core";
import { eq, sql } from "drizzle-orm";
import { hashCardToken, looksLikeCardToken } from "../domain/tokens";
import { loyaltyCards } from "../infra/schema";
import { type CrmDeps, clock, envelope } from "./shared";

export type AttachEmailResult =
  | { ok: true }
  | { ok: false; reason: "invalid_email" | "unavailable" | "consent_required" };

const UNAVAILABLE = { ok: false, reason: "unavailable" } as const;

/** Thrown to roll the transaction back when the address already belongs to a guest. */
class AddressTaken extends Error {}

/**
 * Links an anonymous card to a guest who left an email and agreed to marketing. The guest comes
 * from Core's `resolveGuest` and the consent from `recordConsent`; the address is never stored
 * or published here. An address that already belongs to a guest, an unknown token and a closed
 * card all answer `unavailable`, so the answer says nothing about who else is on file.
 */
export async function attachEmail(
  db: Database,
  input: { cardToken: string; email: string; consent: true },
  deps: CrmDeps,
): Promise<AttachEmailResult> {
  if (input.consent !== true) return { ok: false, reason: "consent_required" };
  if (typeof input.cardToken !== "string" || !looksLikeCardToken(input.cardToken)) {
    return UNAVAILABLE;
  }
  const found = await db.execute<{ card_id: string; client_id: string; location_id: string }>(
    sql`select * from crm.card_scope(${hashCardToken(input.cardToken)})`,
  );
  const scope = found[0];
  if (!scope) return UNAVAILABLE;

  try {
    return await withTenant(db, scope.client_id, async (tx): Promise<AttachEmailResult> => {
      // the same lock the stamp use cases take, so one card changes one thing at a time
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${scope.card_id}, 0))`);
      const [card] = await tx.select().from(loyaltyCards).where(eq(loyaltyCards.id, scope.card_id));
      if (!card || card.closedAt) return UNAVAILABLE;
      if (card.guestId) return { ok: true };

      const now = clock(deps);
      let created = false;
      const publish = async (...args: Parameters<NonNullable<CrmDeps["publish"]>>) => {
        if (args[0].type === "guest.identified") created = true;
        await deps.publish?.(...args);
      };
      const guestId = await resolveGuest(tx, card.clientId, { email: input.email }, { publish });
      // an existing guest means the address is on file already: reveal nothing, link nothing
      if (!created) throw new AddressTaken();
      await recordConsent(tx, guestId, "email", "marketing", "loyalty_card", { publish });
      await tx.update(loyaltyCards).set({ guestId }).where(eq(loyaltyCards.id, card.id));
      await deps.publish?.(
        {
          ...envelope(card.clientId, card.locationId, now),
          type: "contact.captured",
          version: 1,
          data: { guestId, source: "loyalty_card" },
        },
        tx,
      );
      return { ok: true };
    });
  } catch (error) {
    if (error instanceof InvalidContactError) return { ok: false, reason: "invalid_email" };
    if (error instanceof IdentityConflictError || error instanceof AddressTaken) return UNAVAILABLE;
    throw error;
  }
}
