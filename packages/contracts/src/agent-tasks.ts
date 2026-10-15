import { z } from "zod";
import { CONCERNS } from "./sentiment";

const id = z.string().uuid();
const rating = z.number().int().min(1).max(5);

export const TASK_DECISIONS = ["executed", "pending_approval", "drafted", "rejected"] as const;
export type TaskDecision = (typeof TASK_DECISIONS)[number];

/**
 * What the agents service can be asked to do. A caller sends ids and the little it knows from the
 * event; the service reads the rest through the gateway. `scope` says which ids a call must carry:
 * `client` needs a client, `location` also needs a place, `agency` needs neither.
 */
export const AGENT_TASKS = {
  "sentiment.read": {
    agent: "host.sentiment",
    scope: "client",
    input: z.strictObject({ responseId: id, rating }),
    result: z.strictObject({ status: z.enum(["read", "already_read", "no_text"]) }),
  },
  "recovery.evaluate": {
    agent: "host.recovery",
    scope: "client",
    input: z.discriminatedUnion("trigger", [
      z.strictObject({ trigger: z.literal("submitted"), responseId: id, rating }),
      z.strictObject({
        trigger: z.literal("read"),
        responseId: id,
        concern: z.enum(CONCERNS),
        safety: z.boolean(),
      }),
    ]),
    result: z.strictObject({ opened: z.boolean() }),
  },
  "ask.schedule": {
    agent: "host.ask",
    scope: "location",
    input: z.strictObject({ guestId: id, visitDate: z.string().min(1) }),
    result: z.strictObject({ status: z.enum(["scheduled", "skipped", "duplicate"]) }),
  },
  "ask.send_due": {
    agent: "host.ask",
    scope: "agency",
    input: z.strictObject({}),
    result: z.strictObject({
      sent: z.number().int(),
      deferred: z.number().int(),
      dropped: z.number().int(),
    }),
  },
} as const;

export type TaskName = keyof typeof AGENT_TASKS;
export type TaskInput<N extends TaskName> = z.input<(typeof AGENT_TASKS)[N]["input"]>;
export type TaskParsed<N extends TaskName> = z.output<(typeof AGENT_TASKS)[N]["input"]>;
export type TaskResult<N extends TaskName> = z.output<(typeof AGENT_TASKS)[N]["result"]>;

export type TaskResponse<N extends TaskName> = {
  decision: TaskDecision;
  result?: TaskResult<N>;
  reason?: string;
};

export const TaskRequestEnvelope = z.object({
  clientId: id.optional(),
  locationId: id.nullish(),
  input: z.unknown(),
});
export type TaskRequestEnvelope = z.infer<typeof TaskRequestEnvelope>;
