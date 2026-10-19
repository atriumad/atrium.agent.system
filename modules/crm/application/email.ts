import {
  contactFor,
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

/**
 * Links an anonymous card to a guest who left an email and agreed to marketing. The guest comes
 * from Core's `resolveGuest` and the consent from `recordConsent`; the address is never stored
 * or published here. An address already on file links the card to that guest and answers exactly
 * like a new one, so the answer says nothing about who is on file. An unknown token, a closed card
 * and an identity conflict answer `unavailable`.
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
      const guestDeps = deps.publish ? { publish: deps.publish } : {};
      // the guest behind this address, new or already on file: the answer is the same either way
      const guestId = await resolveGuest(tx, card.clientId, { email: input.email }, guestDeps);
      // an explicit withdrawal is never overturned by a card: link it, leave the decision alone
      const standing = await contactFor(tx, guestId, "email", "marketing");
      if (standing.allowed || standing.reason !== "opted_out") {
        await recordConsent(tx, guestId, "email", "marketing", "loyalty_card", guestDeps);
      }
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
    if (error instanceof IdentityConflictError) return UNAVAILABLE;
    throw error;
  }
}
