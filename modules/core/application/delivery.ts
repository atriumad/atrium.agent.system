// modules/core/application/delivery.ts
import { eq } from "drizzle-orm";
import { STATUS_RANK } from "../domain/notifications";
import { type Database, withAgency, withTenant } from "../infra/db";
import { notifications } from "../infra/schema";
import { type GuestDeps, recordOptOut } from "./guests";

export type DeliveryEvent = { type: "delivered" | "bounced" | "complained"; providerId: string };

/**
 * A provider told us what happened to a message. The status only moves forward. A bounce or a
 * complaint on a message to a guest withdraws that guest's email consent, so nothing is sent to
 * them again. An unknown message is ignored: the provider also reports mail from other tools.
 */
export async function applyDeliveryEvent(
  db: Database,
  event: DeliveryEvent,
  deps: GuestDeps = {},
): Promise<"applied" | "ignored"> {
  const [found] = await withAgency(db, (tx) =>
    tx
      .select({
        clientId: notifications.clientId,
        recipientType: notifications.recipientType,
        recipientId: notifications.recipientId,
      })
      .from(notifications)
      .where(eq(notifications.providerId, event.providerId)),
  );
  if (!found) return "ignored";

  // The opt-out comes first and does not depend on the rank check: it is idempotent, and if it
  // fails the status has not moved yet, so the provider's retry runs it again.
  if (event.type !== "delivered" && found.recipientType === "guest") {
    const source = event.type === "bounced" ? "email_bounce" : "email_complaint";
    try {
      await withTenant(db, found.clientId, (tx) =>
        recordOptOut(tx, found.recipientId, "email", source, deps),
      );
    } catch (error) {
      // An erased guest has nothing left to withdraw.
      if (!(error instanceof Error && /unknown guest|was erased/.test(error.message))) throw error;
    }
  }

  return withAgency(db, async (tx) => {
    const [row] = await tx
      .select({ id: notifications.id, status: notifications.status })
      .from(notifications)
      .where(eq(notifications.providerId, event.providerId))
      .for("update");
    if (!row) return "ignored";
    if (STATUS_RANK[event.type] <= STATUS_RANK[row.status as keyof typeof STATUS_RANK]) {
      return "ignored";
    }
    await tx.update(notifications).set({ status: event.type }).where(eq(notifications.id, row.id));
    return "applied";
  });
}
