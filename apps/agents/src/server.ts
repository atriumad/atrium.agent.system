import { timingSafeEqual } from "node:crypto";
import { AGENT_TASKS, type TaskName, TaskRequestEnvelope } from "@atrium/contracts";
import { Hono } from "hono";
import type { UsageMeter } from "./runtime/meter";
import { ModelUnavailableError } from "./runtime/model";
import type { Task, TaskContext } from "./tasks";

export type Logger = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

export const jsonLogger: Logger = {
  info: (message, fields) => console.log(JSON.stringify({ level: "info", message, ...fields })),
  error: (message, fields) => console.error(JSON.stringify({ level: "error", message, ...fields })),
};

export type AgentsAppDeps = {
  tasks: readonly Task[];
  ctx: TaskContext;
  token: string;
  meter: UsageMeter;
  log?: Logger;
};

function authorized(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.startsWith("Bearer ") ? header.slice(7) : "");
  const wanted = Buffer.from(token);
  // timingSafeEqual needs equal lengths; a different length is a "no" without comparing.
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * The service. One route runs a task by name. Nothing a caller sends comes back in an answer or a
 * log: errors carry a fixed word, a kind or a status.
 */
export function createAgentsApp({ tasks, ctx, token, meter, log = jsonLogger }: AgentsAppDeps) {
  const byName = new Map(tasks.map((task) => [task.name as string, task]));
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.post("/v1/tasks/:name", async (c) => {
    if (!authorized(c.req.header("authorization"), token)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const name = c.req.param("name");
    const task = byName.get(name);
    if (!task || !Object.hasOwn(AGENT_TASKS, name)) return c.json({ error: "unknown_task" }, 404);
    const spec = AGENT_TASKS[name as TaskName];

    const envelope = TaskRequestEnvelope.safeParse(await c.req.json().catch(() => null));
    if (!envelope.success) return c.json({ error: "invalid_request" }, 400);
    const { clientId, locationId, input } = envelope.data;

    const parsed = spec.input.safeParse(input);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "input"))];
      return c.json({ error: "invalid_input", fields }, 400);
    }
    if (spec.scope !== "agency" && !clientId) return c.json({ error: "client_required" }, 400);
    if (spec.scope === "location" && !locationId)
      return c.json({ error: "location_required" }, 400);

    const request =
      spec.scope === "agency"
        ? { input: parsed.data }
        : { clientId, locationId: locationId ?? null, input: parsed.data };

    const started = Date.now();
    try {
      const outcome = await meter.run(() => task.run(ctx, request as never));
      log.info("task.done", { task: name, decision: outcome.decision, ms: Date.now() - started });
      return c.json(outcome, 200);
    } catch (error) {
      if (error instanceof ModelUnavailableError) {
        log.error("task.model_unavailable", { task: name, kind: error.kind, status: error.status });
        return c.json(
          { kind: error.kind, ...(error.status !== undefined ? { status: error.status } : {}) },
          502,
        );
      }
      log.error("task.failed", {
        task: name,
        error: error instanceof Error ? error.name : "unknown",
      });
      return c.json({ error: "task_error" }, 500);
    }
  });

  return app;
}
