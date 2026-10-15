import { askSchedule, askSendDue } from "./ask";
import { recoveryEvaluate } from "./recovery";
import { sentimentRead } from "./sentiment";
import type { Task } from "./task";

export type { RunRequest, Task, TaskContext, TaskOutcome } from "./task";
export { defineTask } from "./task";

/** Every task the service answers. A module's agent adds its tasks here, and nowhere else. */
export function buildAgentTasks(): Task[] {
  return [sentimentRead, recoveryEvaluate, askSchedule, askSendDue] as unknown as Task[];
}
