import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { type AuditEntry, type Decision, maskPersonalData } from "../domain/audit";
import type { Tx } from "../infra/db";
import { auditLog } from "../infra/schema";

/**
 * Appends one entry. Input and output are masked here, on the way in, so nothing a caller passes
 * can reach the table with a guest's contact in it.
 */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    clientId: entry.clientId,
    locationId: entry.locationId ?? null,
    actorType: entry.actor.type,
    actorId: entry.actor.id,
    agentVersion: entry.actor.agentVersion ?? null,
    action: entry.action,
    input: (maskPersonalData(entry.input) ?? null) as never,
    output: (maskPersonalData(entry.output) ?? null) as never,
    decision: entry.decision,
    approverId: entry.approverId ?? null,
    reason: entry.reason ? (maskPersonalData(entry.reason) as string) : null,
    costTokens: entry.cost?.tokens ?? null,
    costCents: entry.cost?.cents ?? null,
  });
}

export type AuditFilter = {
  actorId?: string;
  decision?: Decision;
  before?: number;
  limit?: number;
};

/** Newest first. Every query names the client; RLS is the second defense. */
export function listAudit(tx: Tx, clientId: string, filter: AuditFilter = {}) {
  return tx
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.clientId, clientId),
        filter.actorId ? eq(auditLog.actorId, filter.actorId) : undefined,
        filter.decision ? eq(auditLog.decision, filter.decision) : undefined,
        filter.before ? lt(auditLog.seq, filter.before) : undefined,
      ),
    )
    .orderBy(desc(auditLog.seq))
    .limit(Math.min(filter.limit ?? 50, 200));
}

/** How many audit entries of an action by an actor, for a client, since a moment. For daily limits. */
export async function countAuditSince(
  tx: Tx,
  clientId: string,
  filter: { actorId: string; action: string; decisions: Decision[]; since: Date },
): Promise<number> {
  const rows = await tx
    .select({ seq: auditLog.seq })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.clientId, clientId),
        eq(auditLog.actorId, filter.actorId),
        eq(auditLog.action, filter.action),
        inArray(auditLog.decision, filter.decisions),
        gte(auditLog.at, filter.since),
      ),
    );
  return rows.length;
}
