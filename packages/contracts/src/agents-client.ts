import { z } from "zod";
import {
  AGENT_TASKS,
  TASK_DECISIONS,
  type TaskInput,
  type TaskName,
  type TaskResponse,
} from "./agent-tasks";

/** The only error the client lets out. It holds a status and a fixed sentence: never a body. */
export class AgentsCallError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "AgentsCallError";
    this.status = status;
  }
}

export type AgentsClient = {
  call<N extends TaskName>(
    name: N,
    request: { clientId?: string; locationId?: string | null; input: TaskInput<N> },
  ): Promise<TaskResponse<N>>;
};

export type AgentsClientConfig = {
  url: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/**
 * The typed way to ask the agents service for a task. A refusal by policy comes back as a value
 * (`decision: "rejected"`); a transport or server failure throws, so a consumer retries.
 */
export function createAgentsClient(config: AgentsClientConfig): AgentsClient {
  const base = config.url.replace(/\/$/, "");
  const doFetch = config.fetch ?? fetch;
  return {
    async call(name, request) {
      let response: Response;
      try {
        response = await doFetch(`${base}/v1/tasks/${name}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...(request.clientId ? { clientId: request.clientId } : {}),
            ...(request.locationId !== undefined ? { locationId: request.locationId } : {}),
            input: request.input,
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
        });
      } catch {
        throw new AgentsCallError("the agents service is unreachable", null);
      }
      if (!response.ok) {
        throw new AgentsCallError(
          `the agents service answered ${response.status}`,
          response.status,
        );
      }
      const schema = z.object({
        decision: z.enum(TASK_DECISIONS),
        result: AGENT_TASKS[name].result.optional(),
        reason: z.string().optional(),
      });
      const parsed = schema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new AgentsCallError(
          "the agents service sent an answer that does not match",
          response.status,
        );
      }
      return parsed.data as TaskResponse<typeof name>;
    },
  };
}
