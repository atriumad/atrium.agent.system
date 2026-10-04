import type { AccessLevel } from "@atrium/contracts";
import type { AgentManifest } from "./manifest";
import type { CheckContext, NeverCheck, ToolSpec } from "./tool";

/**
 * The policy engine. Docs: architecture / Agents and MCP (What the policy engine decides).
 * Pure: every fact it needs is handed in, so the same call always gets the same answer and a
 * test can cover every branch. The first "no" ends the decision, in this order:
 *   1 kill switch · 2 module and manifest · 3 scopes · 4 limits · 5 never rules · 6 level
 */
export type Facts = {
  /** False when a kill switch covers this agent for this client. */
  agentActive: boolean;
  /** The client's access to the tool's feature, from its package and overrides. */
  featureLevel: AccessLevel;
  /** How many times this agent ran this tool for this client today. */
  usageToday: number;
  now: Date;
  /** The location's local hour (0 to 23), for tools with a schedule. */
  localHour: number;
};

export type Verdict =
  | { decision: "execute"; step: 6; reason: string }
  | { decision: "approval"; step: 6; reason: string }
  | { decision: "draft"; step: 6; reason: string }
  | { decision: "reject"; step: 1 | 2 | 3 | 4 | 5 | 6; reason: string };

export function decide(input: {
  manifest: AgentManifest;
  tool: Pick<ToolSpec, "name" | "writes" | "scopes" | "never">;
  callInput: unknown;
  facts: Facts;
}): Verdict {
  const { manifest, tool, facts } = input;
  const reject = (step: 1 | 2 | 3 | 4 | 5 | 6, reason: string): Verdict => ({
    decision: "reject",
    step,
    reason,
  });

  // 1. Is the subagent active for this client?
  if (!facts.agentActive) return reject(1, `${manifest.id} is switched off for this client`);

  // 2. Is the tool in the manifest, and is its module unlocked by the client's package?
  const entry = manifest.tools[tool.name];
  if (!entry) return reject(2, `${tool.name} is not in the manifest of ${manifest.id}`);
  if (facts.featureLevel === "locked") {
    return reject(2, `${tool.name} belongs to a module the client's package does not include`);
  }

  // 3. Is the data within the manifest's scopes?
  const missing = tool.scopes.filter((scope) => !manifest.scopes.includes(scope));
  if (missing.length > 0) {
    return reject(3, `${manifest.id} has no scope ${missing.join(", ")} for ${tool.name}`);
  }

  // 4. Are the limits respected?
  if (entry.max_per_day !== undefined && facts.usageToday >= entry.max_per_day) {
    return reject(4, `${tool.name} reached its limit of ${entry.max_per_day} per day`);
  }
  if (entry.hours && (facts.localHour < entry.hours.from || facts.localHour >= entry.hours.to)) {
    return reject(
      4,
      `${tool.name} only runs between ${entry.hours.from}:00 and ${entry.hours.to}:00 local time`,
    );
  }

  // 5. Does it pass the checks for the manifest's `never` rules tied to the tool?
  const context: CheckContext = { now: facts.now };
  for (const rule of (tool.never ?? []) as NeverCheck[]) {
    if (!("check" in rule)) continue; // enforced inside the tool; see NeverCheck
    const violation = rule.check(input.callInput, context);
    if (violation) return reject(5, `breaks a rule (${rule.rule}): ${violation}`);
  }

  // 6. By level. A tool that only reads runs at any level; a tool that writes follows the level.
  if (!tool.writes) return { decision: "execute", step: 6, reason: "read-only tool" };
  switch (entry.level) {
    case 4:
      return { decision: "execute", step: 6, reason: "level 4: runs alone" };
    case 3:
      return { decision: "approval", step: 6, reason: "level 3: needs a person's approval" };
    case 2:
      return { decision: "draft", step: 6, reason: "level 2: saved as a proposal" };
    default:
      return reject(6, `level 1 can only read, and ${tool.name} writes`);
  }
}

/**
 * Every `never` rule of a manifest must have a check in code. Returns the rules that do not,
 * so a test can fail on them: a rule nobody enforces is a wish.
 */
export function uncoveredRules(
  manifest: AgentManifest,
  tools: readonly Pick<ToolSpec, "name" | "never">[],
): string[] {
  const covered = new Set<string>();
  for (const tool of tools) {
    if (manifest.tools[tool.name]) for (const check of tool.never ?? []) covered.add(check.rule);
  }
  return manifest.never.filter((rule) => !covered.has(rule));
}
