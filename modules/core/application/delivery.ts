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
  const row = await withAgency(db, async (tx) => {
    const [found] = await tx
      .select({
        id: notifications.id,
        clientId: notifications.clientId,
        status: notifications.status,
        recipientType: notifications.recipientType,
        recipientId: notifications.recipientId,
      })
      .from(notifications)
      .where(eq(notifications.providerId, event.providerId));
    if (!found) return null;
    if (STATUS_RANK[event.type] <= STATUS_RANK[found.status as keyof typeof STATUS_RANK])
      return null;
    await tx
      .update(notifications)
      .set({ status: event.type })
      .where(eq(notifications.id, found.id));
    return found;
  });
  if (!row) return "ignored";
  if (event.type !== "delivered" && row.recipientType === "guest") {
    const source = event.type === "bounced" ? "email_bounce" : "email_complaint";
    try {
      await withTenant(db, row.clientId, (tx) =>
        recordOptOut(tx, row.recipientId, "email", source, deps),
      );
    } catch (error) {
      // An erased guest has nothing left to withdraw.
      if (!(error instanceof Error && /unknown guest|was erased/.test(error.message))) throw error;
    }
  }
  return "applied";
}
