import { and, asc, eq } from "drizzle-orm";
import { canDecideApproval, isValidItemType } from "../domain/approvals";
import { type Actor } from "../domain/audit";
import type { Scope } from "../domain/roles";
import type { Tx } from "../infra/db";
import { approvalRequests, clients, locations } from "../infra/schema";
import { writeAudit } from "./audit";
import type { GuestDeps } from "./guests";

export class ApprovalNotFoundError extends Error {}
export class ApprovalAlreadyDecidedError extends Error {}
export class ApprovalForbiddenError extends Error {}

export type ApprovalItem = {
  /** `module.thing`, e.g. `reputation.reply`. */
  itemType: string;
  /** The module's own record. The queue points at it, it never copies it. */
  itemRef: string;
  summary: string;
  /** What the person sees and may edit (a draft reply, a launch plan). */
  payload?: Record<string, unknown>;
  locationId?: string;
};

const envelope = (clientId: string, locationId: string | null) => ({
  id: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  clientId,
  locationId,
});

/**
 * Puts a proposal in the queue. Idempotent per open item: asking again while one is pending
 * returns the same request instead of stacking a duplicate.
 */
export async function requestApproval(
  tx: Tx,
  clientId: string,
  item: ApprovalItem,
  requester: Actor,
  deps: GuestDeps = {},
): Promise<string> {
  if (!isValidItemType(item.itemType)) throw new Error(`invalid item type: ${item.itemType}`);

  const [created] = await tx
    .insert(approvalRequests)
    .values({
      clientId,
      locationId: item.locationId ?? null,
      requestedByType: requester.type,
      requestedById: requester.id,
      itemType: item.itemType,
      itemRef: item.itemRef,
      summary: item.summary,
      payload: item.payload ?? {},
    })
    .onConflictDoNothing()
    .returning({ id: approvalRequests.id });

  if (!created) {
    const [open] = await tx
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.clientId, clientId),
          eq(approvalRequests.itemType, item.itemType),
          eq(approvalRequests.itemRef, item.itemRef),
          eq(approvalRequests.status, "pending"),
        ),
      );
    if (!open) throw new Error("approval request was not created");
    return open.id;
  }

  await writeAudit(tx, {
    actor: requester,
    clientId,
    locationId: item.locationId ?? null,
    action: "core.request_approval",
    input: { itemType: item.itemType, itemRef: item.itemRef },
    output: { approvalId: created.id },
    decision: "pending_approval",
  });
  await deps.publish?.(
    {
      ...envelope(clientId, item.locationId ?? null),
      type: "approval.requested",
      version: 1,
      data: { approvalId: created.id, itemType: item.itemType, itemRef: item.itemRef },
    },
    tx,
  );
  return created.id;
}

/** Oldest first: the queue is first in, first out. */
export function listPendingApprovals(tx: Tx, clientId: string) {
  return tx
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.clientId, clientId), eq(approvalRequests.status, "pending")))
    .orderBy(asc(approvalRequests.createdAt));
}

export type ApprovalOutcome = {
  decision: "approve" | "discard";
  /** Approve with changes: the person's edit replaces the proposal. */
  editedPayload?: Record<string, unknown>;
  note?: string;
};

/**
 * A person decides. The role comes from the resolved scope, never from the caller, and a client
 * can only decide its own requests. Exactly one decision wins: a second one is rejected.
 */
export async function decideApproval(
  tx: Tx,
  scope: Scope,
  approvalId: string,
  outcome: ApprovalOutcome,
  deps: GuestDeps = {},
) {
  if (!canDecideApproval(scope.role)) {
    throw new ApprovalForbiddenError(`role ${scope.role} cannot decide approvals`);
  }
  if (outcome.decision === "discard" && outcome.editedPayload) {
    throw new Error("a discarded proposal cannot carry an edit");
  }

  const [request] = await tx
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalId));
  if (!request || (scope.kind === "client" && request.clientId !== scope.clientId)) {
    throw new ApprovalNotFoundError("approval request not found");
  }

  const status = outcome.decision === "approve" ? "approved" : "discarded";
  const [decided] = await tx
    .update(approvalRequests)
    .set({
      status,
      decidedBy: scope.userId,
      decidedAt: new Date(),
      decisionNote: outcome.note ?? null,
      editedPayload: outcome.editedPayload ?? null,
    })
    .where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.status, "pending")))
    .returning();
  if (!decided) throw new ApprovalAlreadyDecidedError("approval request was already decided");

  await writeAudit(tx, {
    actor: { type: "user", id: scope.userId },
    clientId: decided.clientId,
    locationId: decided.locationId,
    action: "core.decide_approval",
    input: { approvalId, decision: outcome.decision, edited: outcome.editedPayload !== undefined },
    output: { status },
    decision: "executed",
    approverId: scope.userId,
    reason: outcome.note ?? null,
  });
  await deps.publish?.(
    {
      ...envelope(decided.clientId, decided.locationId),
      type: "approval.decided",
      version: 1,
      data: {
        approvalId,
        itemType: decided.itemType,
        itemRef: decided.itemRef,
        decision: status,
      },
    },
    tx,
  );
  return decided;
}

export type PendingApproval = {
  id: string;
  clientId: string;
  clientName: string;
  locationId: string | null;
  locationName: string | null;
  itemType: string;
  summary: string;
  createdAt: Date;
};

/**
 * Every pending approval request the caller's transaction can see, oldest first, in one query.
 * RLS does the scoping; `clientId` only narrows. The client is joined, so a client with no
 * places still shows up.
 */
export function listAllPendingApprovals(
  tx: Tx,
  filter: { clientId?: string | undefined } = {},
): Promise<PendingApproval[]> {
  return tx
    .select({
      id: approvalRequests.id,
      clientId: approvalRequests.clientId,
      clientName: clients.name,
      locationId: approvalRequests.locationId,
      locationName: locations.name,
      itemType: approvalRequests.itemType,
      summary: approvalRequests.summary,
      createdAt: approvalRequests.createdAt,
    })
    .from(approvalRequests)
    .innerJoin(clients, eq(clients.id, approvalRequests.clientId))
    .leftJoin(locations, eq(locations.id, approvalRequests.locationId))
    .where(
      and(
        eq(approvalRequests.status, "pending"),
        filter.clientId === undefined ? undefined : eq(approvalRequests.clientId, filter.clientId),
      ),
    )
    .orderBy(asc(approvalRequests.createdAt));
}
