import { createHash } from "node:crypto";
import {
  accessLevel,
  countAuditSince,
  type Database,
  isAgentActive,
  listLocations,
  requestApproval,
  type Tx,
  withTenant,
  writeAudit,
} from "@atrium/core";
import {
  type AgentCall,
  type AgentManifest,
  type CallResult,
  decide,
  type Facts,
  type Gateway,
  type Tool,
  uncoveredRules,
} from "@atrium/policy";

/**
 * The gateway. Docs: architecture / Agents and MCP. Every call an agent makes comes through here:
 * it fixes the client, validates the input, asks the policy engine, runs the tool or turns the
 * call into an approval or a draft, and writes one audit entry. The agent never touches a use
 * case, a table or another client directly.
 *
 * It runs in-process for now; the MCP transport sits in front of the same `call`.
 */
export type GatewayDeps = {
  db: Database;
  manifests: readonly AgentManifest[];
  tools: readonly Tool<never, unknown, Tx>[];
  now?: () => Date;
};

const ALL = ["executed", "pending_approval"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function hourIn(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" })
    .formatToParts(now)
    .find((p) => p.type === "hour")?.value;
  return Number(hour);
}

/**
 * Builds the gateway, and refuses to start if the setup is not sound: every tool in a manifest
 * must exist, and every `never` rule in a manifest must have code behind it.
 */
export function createGateway(deps: GatewayDeps): Gateway {
  const manifests = new Map(deps.manifests.map((m) => [m.id, m]));
  const tools = new Map(
    deps.tools.map((t) => [t.name, t as unknown as Tool<unknown, unknown, Tx>]),
  );

  for (const manifest of manifests.values()) {
    for (const name of Object.keys(manifest.tools)) {
      if (!tools.has(name)) throw new Error(`${manifest.id} lists ${name}, which is not a tool`);
    }
    const uncovered = uncoveredRules(manifest, [...tools.values()]);
    if (uncovered.length > 0) {
      throw new Error(
        `${manifest.id} has never rules with no code behind them: ${uncovered.join("; ")}`,
      );
    }
  }

  const clock = () => deps.now?.() ?? new Date();

  async function reject(
    call: AgentCall,
    step: number,
    reason: string,
    manifest?: AgentManifest,
  ): Promise<CallResult> {
    // Best effort: a malformed call may not even name a real client.
    try {
      await withTenant(deps.db, call.clientId, (tx) =>
        writeAudit(tx, {
          actor: {
            type: "agent",
            id: call.agentId,
            ...(manifest ? { agentVersion: manifest.version } : {}),
          },
          clientId: call.clientId,
          locationId: call.locationId ?? null,
          action: call.tool,
          input: call.input,
          decision: "rejected",
          reason,
        }),
      );
    } catch {
      // nothing to audit against
    }
    return { decision: "rejected", reason, step };
  }

  return {
    async call(call) {
      // The runtime fixes the client, but a bad id is a malformed call: refuse it, do not crash.
      if (!UUID.test(call.clientId) || (call.locationId && !UUID.test(call.locationId))) {
        return { decision: "rejected", reason: "the call does not name a valid client", step: 0 };
      }
      const manifest = manifests.get(call.agentId);
      if (!manifest) return reject(call, 0, `unknown agent: ${call.agentId}`);
      const tool = tools.get(call.tool);
      if (!tool) return reject(call, 0, `unknown tool: ${call.tool}`, manifest);

      const parsed = tool.input.safeParse(call.input);
      if (!parsed.success) {
        const why = parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
          .join("; ");
        return reject(call, 0, `invalid input: ${why}`, manifest);
      }

      const now = clock();
      const actor = { type: "agent", id: manifest.id, agentVersion: manifest.version } as const;
      const locationId = call.locationId ?? null;

      try {
        return await withTenant(deps.db, call.clientId, async (tx): Promise<CallResult> => {
          const timeZone = locationId
            ? ((await listLocations(tx, call.clientId)).find((l) => l.id === locationId)
                ?.timeZone ?? "UTC")
            : "UTC";
          const facts: Facts = {
            agentActive: await isAgentActive(tx, manifest.id, call.clientId),
            featureLevel: await accessLevel(tx, call.clientId, locationId, tool.feature),
            usageToday: await countAuditSince(tx, call.clientId, {
              actorId: manifest.id,
              action: tool.name,
              decisions: [...ALL],
              since: startOfUtcDay(now),
            }),
            now,
            localHour: hourIn(now, timeZone),
          };
          const verdict = decide({ manifest, tool, callInput: parsed.data, facts });
          const audit = (
            decision: "executed" | "pending_approval" | "drafted" | "rejected",
            output?: unknown,
          ) =>
            writeAudit(tx, {
              actor,
              clientId: call.clientId,
              locationId,
              action: tool.name,
              input: parsed.data,
              ...(output !== undefined ? { output } : {}),
              decision,
              reason: verdict.reason,
            });

          if (verdict.decision === "reject") {
            await audit("rejected");
            return { decision: "rejected", reason: verdict.reason, step: verdict.step };
          }
          if (verdict.decision === "draft") {
            await audit("drafted");
            return { decision: "drafted", reason: verdict.reason };
          }
          if (verdict.decision === "approval") {
            const digest = createHash("sha256")
              .update(JSON.stringify(parsed.data))
              .digest("hex")
              .slice(0, 32);
            const approvalId = await requestApproval(
              tx,
              call.clientId,
              {
                itemType: tool.name,
                itemRef: digest,
                summary: `${manifest.id} proposes ${tool.name}`,
                payload: { tool: tool.name, input: parsed.data as Record<string, unknown> },
                ...(locationId ? { locationId } : {}),
              },
              actor,
            );
            await audit("pending_approval");
            return { decision: "pending_approval", approvalId, reason: verdict.reason };
          }

          const output = tool.output.parse(
            await tool.handler(
              parsed.data,
              {
                clientId: call.clientId,
                locationId,
                agentId: manifest.id,
                agentVersion: manifest.version,
                now,
              },
              tx,
            ),
          );
          await audit("executed", output);
          return { decision: "executed", output };
        });
      } catch (error) {
        // The effect rolled back with the transaction. The failure is recorded and re-raised, so
        // a consumer retries and a dead letter shows it, instead of the call vanishing.
        await reject(
          call,
          0,
          `tool_error: ${error instanceof Error ? error.message : String(error)}`,
          manifest,
        );
        throw error;
      }
    },
  };
}
