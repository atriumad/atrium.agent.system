/**
 * What an agent asks of the system, and what it gets back. The gateway (apps/agents) implements
 * this; a module that wires an agent only needs the shape.
 */
export type AgentCall = {
  /** `agent.subagent`: who is asking. The runtime sets it; the agent cannot claim another. */
  agentId: string;
  /** The task's client, fixed by the runtime. */
  clientId: string;
  locationId?: string | null;
  tool: string;
  input: unknown;
};

export type CallResult =
  | { decision: "executed"; output: unknown }
  | { decision: "pending_approval"; approvalId: string; reason: string }
  | { decision: "drafted"; reason: string }
  | { decision: "rejected"; reason: string };

export interface Gateway {
  call(call: AgentCall): Promise<CallResult>;
}
