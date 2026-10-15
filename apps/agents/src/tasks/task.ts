import {
  AGENT_TASKS,
  type TaskDecision,
  type TaskName,
  type TaskParsed,
  type TaskResult,
} from "@atrium/contracts";
import type { Database } from "@atrium/core";
import type { CallResult, Gateway } from "@atrium/policy";

/** What every task can use. The model is not here: a task that needs one reads it through a tool. */
export type TaskContext = {
  gateway: Gateway;
  db: Database;
  now: () => Date;
  /** Which models are configured. A task that needs one and finds it missing answers `rejected`. */
  models: { sentiment: boolean };
};

export type TaskOutcome<N extends TaskName> = {
  decision: TaskDecision;
  result?: TaskResult<N>;
  reason?: string;
};

type Scope<N extends TaskName> = (typeof AGENT_TASKS)[N]["scope"];

/** The ids a task receives depend on its scope; the server has already checked them. */
export type RunRequest<N extends TaskName> =
  Scope<N> extends "agency"
    ? { input: TaskParsed<N> }
    : Scope<N> extends "location"
      ? { clientId: string; locationId: string; input: TaskParsed<N> }
      : { clientId: string; locationId: string | null; input: TaskParsed<N> };

export type Task<N extends TaskName = TaskName> = {
  name: N;
  run: (ctx: TaskContext, request: RunRequest<N>) => Promise<TaskOutcome<N>>;
};

export function defineTask<N extends TaskName>(task: Task<N>): Task<N> {
  return task;
}

/** A gateway call that did not run, as a task answer. A refusal is a decision, not a failure. */
export function refusal(call: Exclude<CallResult, { decision: "executed" }>): {
  decision: TaskDecision;
  reason: string;
} {
  return { decision: call.decision, reason: call.reason };
}
