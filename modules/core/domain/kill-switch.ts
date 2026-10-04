/**
 * A kill switch turns a subagent off, for one client or for everyone, without a deploy.
 * `*` is every agent; an agent name without a dot (`host`) is all of its subagents;
 * a full id (`host.recovery`) is exactly one.
 */
export const ALL_AGENTS = "*";

export function matchesSwitch(switchedOff: string, agentId: string): boolean {
  if (switchedOff === ALL_AGENTS) return true;
  if (switchedOff === agentId) return true;
  return !switchedOff.includes(".") && agentId.startsWith(`${switchedOff}.`);
}

/** `agent.subagent`, or an agent name on its own, or `*`. */
export function isValidAgentSelector(value: string): boolean {
  return value === ALL_AGENTS || /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/.test(value);
}
