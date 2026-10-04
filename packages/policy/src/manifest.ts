import { parse } from "yaml";
import { z } from "zod";

/**
 * A subagent's manifest. Docs: architecture / Agents and MCP, guides / Create a subagent.
 * The manifest is the contract: what the agent may call, at what level, within which limits.
 * The prompt guides the agent; the manifest and the code decide what it can do.
 */
export const ENGINES = [
  "discoverability",
  "acquisition",
  "reputation",
  "retention",
  "growth",
  "orchestrator",
] as const;

export const ESCALATION_ROLES = [
  "agency_admin",
  "account_manager",
  "agency_staff",
  "client_owner",
] as const;

/** 4 runs alone, 3 asks for approval, 2 saves a draft, 1 only reads. */
export const LEVELS = [1, 2, 3, 4] as const;
export type Level = (typeof LEVELS)[number];

export const TOOL_NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
export const AGENT_ID = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

const ToolEntry = z.strictObject({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  max_per_day: z.number().int().positive().optional(),
  /** Local hours the tool may run, `from` inclusive and `to` exclusive. */
  hours: z
    .strictObject({ from: z.number().int().min(0).max(23), to: z.number().int().min(1).max(24) })
    .refine((h) => h.from < h.to, "hours.from must be before hours.to")
    .optional(),
});

export const AgentManifest = z.strictObject({
  id: z.string().regex(AGENT_ID, "id is agent.subagent in snake case"),
  version: z.number().int().positive(),
  engine: z.enum(ENGINES),
  goal: z.string().min(1).max(280),
  tools: z
    .record(z.string().regex(TOOL_NAME, "tools are module.tool in snake case"), ToolEntry)
    .refine((tools) => Object.keys(tools).length > 0, "a subagent needs at least one tool"),
  scopes: z.array(z.string().regex(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/)).min(1),
  never: z.array(z.string().min(1)).min(1),
  untrusted_input: z.array(z.string().min(1)),
  escalate_to: z.enum(ESCALATION_ROLES),
  kill_switch: z.enum(["per_client", "global"]),
  evals: z.string().min(1),
});
export type AgentManifest = z.infer<typeof AgentManifest>;

export class ManifestError extends Error {}

/** Reads a manifest from YAML text. Throws with the first problems, not a bare "invalid". */
export function parseManifest(yamlText: string): AgentManifest {
  let raw: unknown;
  try {
    raw = parse(yamlText);
  } catch (error) {
    throw new ManifestError(`manifest is not valid YAML: ${String(error)}`);
  }
  const result = AgentManifest.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
      .join("; ");
    throw new ManifestError(`manifest is invalid: ${problems}`);
  }
  return result.data;
}
