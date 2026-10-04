import type { Feature } from "@atrium/contracts";
import { z } from "zod";
import { TOOL_NAME } from "./manifest";

/**
 * Code behind a manifest's `never` rule. `rule` is the manifest line it enforces, word for word,
 * so a manifest rule with no code anywhere is found by a test instead of by an incident.
 *
 * Two honest shapes:
 *  - a `check` the engine runs before the call, on the input alone;
 *  - `enforcedBy`, for a rule that can only be judged with data inside the tool (a guest's
 *    consent, say). It names the function that enforces it, and a test in the module proves it.
 */
export type NeverCheck<I = unknown> =
  | {
      rule: string;
      /** Returns why the call breaks the rule, or null when it does not. */
      check: (input: I, context: CheckContext) => string | null;
    }
  | {
      rule: string;
      /** The function that enforces it, and where the test is. Not run by the engine. */
      enforcedBy: string;
    };

/** Facts a check may use. Looked up by the gateway, never supplied by the agent. */
export type CheckContext = { now: Date };

export type ToolSpec<I = unknown, O = unknown> = {
  /** `module.tool`: `reputation.open_case`. Specific and small. */
  name: string;
  description: string;
  /** Typed with Zod. A tool that writes must take a `reason`, which goes in the audit log. */
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  writes: boolean;
  /** The package feature that has to be live for this tool to exist for a client. */
  feature: Feature;
  /** Scopes the manifest must grant, like `reputation:read`. */
  scopes: string[];
  never?: NeverCheck<I>[];
};

export type ToolContext = {
  clientId: string;
  locationId: string | null;
  agentId: string;
  agentVersion: number;
  now: Date;
};

export type Tool<I = unknown, O = unknown, Tx = unknown> = ToolSpec<I, O> & {
  /** Calls the module's use case. Never `infra/`, never SQL. */
  handler: (input: I, context: ToolContext, tx: Tx) => Promise<O>;
};

const REASON_MIN = 10;
const REASON_MAX = 280;

/** The `reason` field every tool that writes takes. */
export const reasonField = z.string().trim().min(REASON_MIN).max(REASON_MAX);

/**
 * Declares a tool, refusing the ones that break the design rules: a module.tool name, and a
 * `reason` on every tool that writes.
 */
export function defineTool<I, O, Tx = unknown>(tool: Tool<I, O, Tx>): Tool<I, O, Tx> {
  if (!TOOL_NAME.test(tool.name)) throw new Error(`tool name must be module.tool: ${tool.name}`);
  if (tool.writes) {
    const shape = (tool.input as unknown as { shape?: Record<string, unknown> }).shape;
    if (!shape || !("reason" in shape)) {
      throw new Error(`tool ${tool.name} writes, so its input needs a reason`);
    }
  }
  return tool;
}
