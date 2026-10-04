import { and, eq, isNull, or } from "drizzle-orm";
import { type Actor } from "../domain/audit";
import { isValidAgentSelector, matchesSwitch } from "../domain/kill-switch";
import type { Tx } from "../infra/db";
import { killSwitches } from "../infra/schema";
import { writeAudit } from "./audit";

/**
 * Turns an agent off for one client, or for every client when `clientId` is null. Needs agency
 * scope (RLS). Switching off twice keeps the first reason.
 */
export async function switchOff(
  tx: Tx,
  input: { agentId: string; clientId: string | null; reason: string },
  actor: Actor,
) {
  if (!isValidAgentSelector(input.agentId)) throw new Error(`invalid agent: ${input.agentId}`);
  await tx
    .insert(killSwitches)
    .values({
      agentId: input.agentId,
      clientId: input.clientId,
      reason: input.reason,
      setBy: actor.id,
    })
    .onConflictDoNothing();
  await writeAudit(tx, {
    actor,
    clientId: input.clientId,
    action: "core.kill_switch_off",
    input: { agentId: input.agentId },
    decision: "executed",
    reason: input.reason,
  });
}

export async function switchOn(
  tx: Tx,
  input: { agentId: string; clientId: string | null },
  actor: Actor,
  reason: string,
) {
  const removed = await tx
    .delete(killSwitches)
    .where(
      and(
        eq(killSwitches.agentId, input.agentId),
        input.clientId ? eq(killSwitches.clientId, input.clientId) : isNull(killSwitches.clientId),
      ),
    )
    .returning({ id: killSwitches.id });
  if (removed.length === 0) return false;
  await writeAudit(tx, {
    actor,
    clientId: input.clientId,
    action: "core.kill_switch_on",
    input: { agentId: input.agentId },
    decision: "executed",
    reason,
  });
  return true;
}

/** The first check the policy engine runs on every call: is this agent on for this client? */
export async function isAgentActive(tx: Tx, agentId: string, clientId: string): Promise<boolean> {
  const rows = await tx
    .select({ agentId: killSwitches.agentId })
    .from(killSwitches)
    .where(or(isNull(killSwitches.clientId), eq(killSwitches.clientId, clientId)));
  return !rows.some((row) => matchesSwitch(row.agentId, agentId));
}
