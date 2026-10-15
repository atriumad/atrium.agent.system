import { describe, expect, test } from "bun:test";
import { AGENT_TASKS, TaskRequestEnvelope } from "./agent-tasks";

const id = "0b2f1c4e-6a5d-4f0e-9a39-2f6f4b8d1c11";

describe("the task contract", () => {
  test("names the four tasks of Host's three subagents", () => {
    expect(Object.keys(AGENT_TASKS).sort()).toEqual([
      "ask.schedule",
      "ask.send_due",
      "recovery.evaluate",
      "sentiment.read",
    ]);
  });

  test("each task belongs to one subagent and has a scope", () => {
    expect(AGENT_TASKS["sentiment.read"]).toMatchObject({
      agent: "host.sentiment",
      scope: "client",
    });
    expect(AGENT_TASKS["recovery.evaluate"]).toMatchObject({
      agent: "host.recovery",
      scope: "client",
    });
    expect(AGENT_TASKS["ask.schedule"]).toMatchObject({ agent: "host.ask", scope: "location" });
    expect(AGENT_TASKS["ask.send_due"]).toMatchObject({ agent: "host.ask", scope: "agency" });
  });

  test("inputs are strict: an unknown field, a bad id or a rating of 9 is refused", () => {
    const read = AGENT_TASKS["sentiment.read"].input;
    expect(read.safeParse({ responseId: id, rating: 2 }).success).toBe(true);
    expect(read.safeParse({ responseId: id, rating: 2, comment: "x" }).success).toBe(false);
    expect(read.safeParse({ responseId: "nope", rating: 2 }).success).toBe(false);
    expect(read.safeParse({ responseId: id, rating: 9 }).success).toBe(false);
  });

  test("recovery.evaluate takes either trigger, and each needs its own fields", () => {
    const input = AGENT_TASKS["recovery.evaluate"].input;
    expect(input.safeParse({ trigger: "submitted", responseId: id, rating: 1 }).success).toBe(true);
    expect(
      input.safeParse({ trigger: "read", responseId: id, concern: "high", safety: true }).success,
    ).toBe(true);
    expect(input.safeParse({ trigger: "read", responseId: id, rating: 1 }).success).toBe(false);
    expect(input.safeParse({ trigger: "other", responseId: id }).success).toBe(false);
  });

  test("the envelope carries ids and an input, and nothing else is needed", () => {
    expect(TaskRequestEnvelope.safeParse({ input: {} }).success).toBe(true);
    expect(
      TaskRequestEnvelope.safeParse({ clientId: id, locationId: null, input: {} }).success,
    ).toBe(true);
    expect(TaskRequestEnvelope.safeParse({ clientId: "x", input: {} }).success).toBe(false);
  });
});
