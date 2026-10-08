import { eq } from "drizzle-orm";
import { isValidTimeZone } from "../domain/location";
import { canTransitionLocation, type LocationStatus } from "../domain/location-status";
import type { NotificationTransport } from "../domain/notifications";
import { can, type Scope } from "../domain/roles";
import type { Tx } from "../infra/db";
import { locations } from "../infra/schema";
import { writeAudit } from "./audit";
import { alertRecipients } from "./lookups";
import { sendToUser } from "./notifications";

export class LocationForbiddenError extends Error {}
export class LocationNotFoundError extends Error {}
export class LocationStateError extends Error {}
export class InvalidLocationError extends Error {}

const ACTIONS = {
  approve: { from: "pending", to: "active" },
  reject: { from: "pending", to: "rejected" },
  suspend: { from: "active", to: "suspended" },
  reactivate: { from: "suspended", to: "active" },
} as const;
export type LocationAction = keyof typeof ACTIONS;
export const LOCATION_ACTIONS = Object.keys(ACTIONS) as LocationAction[];

const actorOf = (scope: Scope) => ({ type: "user", id: scope.userId }) as const;

/** The owner asks for a place. It stays pending, and untracked, until the agency approves. */
export async function requestLocation(
  tx: Tx,
  scope: Scope,
  input: { name: string; timeZone: string },
  transport?: NotificationTransport,
): Promise<string> {
  if (scope.kind !== "client" || !can(scope.role, "location", "request")) {
    throw new LocationForbiddenError(`role ${scope.role} cannot request locations`);
  }
  const name = input.name.trim();
  if (name.length === 0 || name.length > 120) {
    throw new InvalidLocationError("the name is 1 to 120 characters");
  }
  if (!isValidTimeZone(input.timeZone)) throw new InvalidLocationError("unknown time zone");

  const [row] = await tx
    .insert(locations)
    .values({ clientId: scope.clientId, name, timeZone: input.timeZone, status: "pending" })
    .returning({ id: locations.id });
  if (!row) throw new Error("location was not created");
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: scope.clientId,
    locationId: row.id,
    action: "core.request_location",
    input: { name },
    decision: "executed",
  });
  for (const recipient of await alertRecipients(tx, scope.clientId)) {
    if (recipient.role === "client_owner") continue;
    await sendToUser(
      tx,
      {
        clientId: scope.clientId,
        userId: recipient.userId,
        kind: "core.location_requested",
        subject: `A new location is waiting for approval: ${name}`,
        body: `${name} was requested and is pending. Open the Manager to approve or reject it.`,
      },
      transport,
    );
  }
  return row.id;
}

/** The agency moves a location along its life. Row-level security hides other teams' clients. */
export async function decideLocation(
  tx: Tx,
  scope: Scope,
  locationId: string,
  action: LocationAction,
  reason: string | null,
  transport?: NotificationTransport,
): Promise<LocationStatus> {
  if (!can(scope.role, "location", "manage")) {
    throw new LocationForbiddenError(`role ${scope.role} cannot decide on locations`);
  }
  const [row] = await tx.select().from(locations).where(eq(locations.id, locationId));
  if (!row) throw new LocationNotFoundError("location not found");
  const move = ACTIONS[action];
  const current = row.status as LocationStatus;
  if (current !== move.from || !canTransitionLocation(current, move.to)) {
    throw new LocationStateError(`a ${current} location cannot ${action}`);
  }
  await tx
    .update(locations)
    .set({
      status: move.to,
      statusChangedAt: new Date(),
      statusChangedBy: scope.userId,
      statusReason: reason,
    })
    .where(eq(locations.id, locationId));
  await writeAudit(tx, {
    actor: actorOf(scope),
    clientId: row.clientId,
    locationId,
    action: `core.location_${action}`,
    decision: "executed",
    reason,
  });
  for (const recipient of await alertRecipients(tx, row.clientId)) {
    if (recipient.role !== "client_owner") continue;
    await sendToUser(
      tx,
      {
        clientId: row.clientId,
        userId: recipient.userId,
        kind: "core.location_decided",
        subject: `${row.name} is now ${move.to}`,
        body: reason
          ? `${row.name} is now ${move.to}. ${reason}`
          : `${row.name} is now ${move.to}.`,
      },
      transport,
    );
  }
  return move.to;
}
