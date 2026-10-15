import { describe, expect, test } from "bun:test";
import type { AgentCall, CallResult, Gateway } from "@atrium/policy";
import { buildAgentTasks } from "../src/tasks";
import { recoveryEvaluate } from "../src/tasks/recovery";
import { sentimentRead } from "../src/tasks/sentiment";
import type { TaskContext } from "../src/tasks/task";

const id = "0b2f1c4e-6a5d-4f0e-9a39-2f6f4b8d1c11";
const place = "7c1d2e3f-0a1b-4c2d-8e3f-4a5b6c7d8e9f";

function scripted(script: (call: AgentCall) => CallResult) {
  const calls: AgentCall[] = [];
  const gateway: Gateway = {
    async call(call) {
      calls.push(call);
      return script(call);
    },
  };
  return { calls, gateway };
}

const ctx = (gateway: Gateway, sentiment = true): TaskContext => ({
  gateway,
  db: undefined as never,
  now: () => new Date("2026-10-06T17:00:00Z"),
  models: { sentiment },
});

describe("the registry", () => {
  test("registers exactly the tasks of the contract", () => {
    expect(
      buildAgentTasks()
        .map((t) => t.name)
        .sort(),
    ).toEqual(["ask.schedule", "ask.send_due", "recovery.evaluate", "sentiment.read"]);
  });
});

describe("sentiment.read", () => {
  test("without a model it refuses, calls nothing and says why", async () => {
    const { gateway, calls } = scripted(() => ({ decision: "executed", output: {} }));
    const out = await sentimentRead.run(ctx(gateway, false), {
      clientId: id,
      locationId: place,
      input: { responseId: id, rating: 2 },
    });
    expect(out).toEqual({ decision: "rejected", reason: "no model is configured for sentiment" });
    expect(calls).toHaveLength(0);
  });

  test("passes ids and a reason only, never the guest's text, and returns the status", async () => {
    const { gateway, calls } = scripted(() => ({
      decision: "executed",
      output: { status: "read", sentiment: "negative", concern: "high", safety: false },
    }));
    const out = await sentimentRead.run(ctx(gateway), {
      clientId: id,
      locationId: place,
      input: { responseId: id, rating: 2 },
    });
    expect(out).toEqual({ decision: "executed", result: { status: "read" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      agentId: "host.sentiment",
      clientId: id,
      locationId: place,
      tool: "reputation.read_response",
    });
    expect(Object.keys(calls[0]?.input as object).sort()).toEqual(["reason", "responseId"]);
  });

  test("a refusal by the gateway is returned as a decision", async () => {
    const { gateway } = scripted(() => ({ decision: "rejected", reason: "agent is off", step: 1 }));
    const out = await sentimentRead.run(ctx(gateway), {
      clientId: id,
      locationId: null,
      input: { responseId: id, rating: 4 },
    });
    expect(out).toEqual({ decision: "rejected", reason: "agent is off" });
  });
});

describe("recovery.evaluate", () => {
  const classify =
    (severity: string | null, shouldOpen: boolean) =>
    (call: AgentCall): CallResult =>
      call.tool === "reputation.classify_response"
        ? { decision: "executed", output: { severity, shouldOpen } }
        : { decision: "executed", output: { caseId: id, status: "open" } };

  test("a poor rating classifies, then opens a case", async () => {
    const { gateway, calls } = scripted(classify("medium", true));
    const out = await recoveryEvaluate.run(ctx(gateway), {
      clientId: id,
      locationId: place,
      input: { trigger: "submitted", responseId: id, rating: 2 },
    });
    expect(out).toEqual({ decision: "executed", result: { opened: true } });
    expect(calls.map((c) => c.tool)).toEqual([
      "reputation.classify_response",
      "reputation.open_case",
    ]);
    expect(calls[1]?.input).toMatchObject({ responseId: id, severity: "medium" });
    expect((calls[1]?.input as { reason: string }).reason).toContain("rating of 2 of 5");
  });

  test("nothing to follow up: one call and no case", async () => {
    const { gateway, calls } = scripted(classify(null, false));
    const out = await recoveryEvaluate.run(ctx(gateway), {
      clientId: id,
      locationId: place,
      input: { trigger: "submitted", responseId: id, rating: 5 },
    });
    expect(out).toEqual({ decision: "executed", result: { opened: false } });
    expect(calls).toHaveLength(1);
  });

  test("a refused classification stops there, and says why", async () => {
    const { gateway, calls } = scripted(() => ({
      decision: "rejected",
      reason: "agent is off",
      step: 1,
    }));
    const out = await recoveryEvaluate.run(ctx(gateway), {
      clientId: id,
      locationId: place,
      input: { trigger: "submitted", responseId: id, rating: 1 },
    });
    expect(out).toEqual({ decision: "rejected", reason: "agent is off" });
    expect(calls).toHaveLength(1);
  });

  test("the reading trigger names the concern and safety in its reasons", async () => {
    const { gateway, calls } = scripted(classify("high", true));
    await recoveryEvaluate.run(ctx(gateway), {
      clientId: id,
      locationId: place,
      input: { trigger: "read", responseId: id, concern: "high", safety: true },
    });
    expect((calls[0]?.input as { reason: string }).reason).toContain("concern high");
    expect((calls[1]?.input as { reason: string }).reason).toContain("safety true");
  });
});

describe("ask.send_due time budget", () => {
  test("new sends stop once the budget is spent", async () => {
    const { budgetSpent, SEND_DUE_BUDGET_MS } = await import("../src/tasks/ask");
    const started = new Date("2026-10-06T17:00:00Z");
    expect(budgetSpent(started, new Date(started.getTime() + SEND_DUE_BUDGET_MS - 1))).toBe(false);
    expect(budgetSpent(started, new Date(started.getTime() + SEND_DUE_BUDGET_MS))).toBe(true);
  });
});
