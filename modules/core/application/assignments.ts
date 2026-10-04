import { and, eq } from "drizzle-orm";
import type { Actor } from "../domain/audit";
import type { Tx } from "../infra/db";
import { assignments, locationAssignments } from "../infra/schema";
import { writeAudit } from "./audit";

/**
 * Assigns an agency user (account manager or agency staff) to a client. Only agency scope can:
 * RLS rejects it from any other session. Returns whether anything changed.
 */
export async function assignClient(
  tx: Tx,
  userId: string,
  clientId: string,
  actor: Actor,
): Promise<boolean> {
  const added = await tx
    .insert(assignments)
    .values({ userId, clientId, createdBy: actor.id })
    .onConflictDoNothing()
    .returning({ userId: assignments.userId });
  if (added.length === 0) return false;
  await writeAudit(tx, {
    actor,
    clientId,
    action: "core.assign_client",
    input: { userId },
    decision: "executed",
  });
  return true;
}

export async function unassignClient(
  tx: Tx,
  userId: string,
  clientId: string,
  actor: Actor,
): Promise<boolean> {
  const removed = await tx
    .delete(assignments)
    .where(and(eq(assignments.userId, userId), eq(assignments.clientId, clientId)))
    .returning({ userId: assignments.userId });
  if (removed.length === 0) return false;
  await writeAudit(tx, {
    actor,
    clientId,
    action: "core.unassign_client",
    input: { userId },
    decision: "executed",
  });
  return true;
}

/** The clients a user is assigned to. A user can read their own; the agency reads anyone's. */
export async function listAssignedClientIds(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ clientId: assignments.clientId })
    .from(assignments)
    .where(eq(assignments.userId, userId));
  return rows.map((row) => row.clientId);
}

/**
 * Assigns client staff to a location of their client. The agency or the client's own owner can;
 * the location must belong to the client (composite foreign key).
 */
export async function assignLocation(
  tx: Tx,
  userId: string,
  clientId: string,
  locationId: string,
  actor: Actor,
): Promise<boolean> {
  const added = await tx
    .insert(locationAssignments)
    .values({ userId, clientId, locationId, createdBy: actor.id })
    .onConflictDoNothing()
    .returning({ userId: locationAssignments.userId });
  if (added.length === 0) return false;
  await writeAudit(tx, {
    actor,
    clientId,
    locationId,
    action: "core.assign_location",
    input: { userId },
    decision: "executed",
  });
  return true;
}

export async function unassignLocation(
  tx: Tx,
  userId: string,
  clientId: string,
  locationId: string,
  actor: Actor,
): Promise<boolean> {
  const removed = await tx
    .delete(locationAssignments)
    .where(
      and(
        eq(locationAssignments.userId, userId),
        eq(locationAssignments.clientId, clientId),
        eq(locationAssignments.locationId, locationId),
      ),
    )
    .returning({ userId: locationAssignments.userId });
  if (removed.length === 0) return false;
  await writeAudit(tx, {
    actor,
    clientId,
    locationId,
    action: "core.unassign_location",
    input: { userId },
    decision: "executed",
  });
  return true;
}
