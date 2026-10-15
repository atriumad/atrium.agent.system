import { describe, expect, test } from "bun:test";
import { AgentsCallError, type AgentsClient } from "@atrium/contracts";
import { agentConsumers } from "../src/agents";

const id = "0b2f1c4e-6a5d-4f0e-9a39-2f6f4b8d1c11";
const place = "7c1d2e3f-0a1b-4c2d-8e3f-4a5b6c7d8e9f";

function recording(answer: (name: string) => unknown) {
  const calls: { name: string; request: unknown }[] = [];
  const agents = {
    async call(name: string, request: unknown) {
      calls.push({ name, request });
      return answer(name);
    },
  } as unknown as AgentsClient;
  return { calls, agents };
}
const handlerOf = (agents: AgentsClient, name: string) => {
  const consumer = agentConsumers(agents).consumers.find((c) => c.name === name);
  if (!consumer) throw new Error(`no consumer ${name}`);
  return consumer.handler as unknown as (event: unknown, tx: unknown) => Promise<void>;
};

describe("Host's consumers only call tasks", () => {
  test("keep the names the queues already use", () => {
    const { agents } = recording(() => ({ decision: "executed" }));
    const { consumers, jobs } = agentConsumers(agents);
    expect(consumers.map((c) => c.name).sort()).toEqual([
      "host.ask.schedule",
      "host.recovery.read",
      "host.recovery.read_sentiment",
      "host.sentiment.read",
    ]);
    expect(jobs.map((j) => j.name)).toEqual(["host.ask.send_due"]);
    expect(jobs[0]?.cron).toBe("* * * * *");
  });

  test("a visit becomes ask.schedule with the guest and the date", async () => {
    const { agents, calls } = recording(() => ({
      decision: "executed",
      result: { status: "scheduled" },
    }));
    await handlerOf(agents, "host.ask.schedule")(
      { clientId: id, locationId: place, data: { guestId: id, date: "2026-10-05" } },
      {},
    );
    expect(calls).toEqual([
      {
        name: "ask.schedule",
        request: {
          clientId: id,
          locationId: place,
          input: { guestId: id, visitDate: "2026-10-05" },
        },
      },
    ]);
  });

  test("a visit with no place calls nothing", async () => {
    const { agents, calls } = recording(() => ({ decision: "executed" }));
    await handlerOf(agents, "host.ask.schedule")(
      { clientId: id, locationId: null, data: { guestId: id, date: "2026-10-05" } },
      {},
    );
    expect(calls).toHaveLength(0);
  });

  test("a survey response asks Recovery and Sentiment; a reading asks Recovery again", async () => {
    const { agents, calls } = recording(() => ({ decision: "executed" }));
    const submitted = { clientId: id, locationId: place, data: { responseId: id, rating: 2 } };
    await handlerOf(agents, "host.recovery.read")(submitted, {});
    await handlerOf(agents, "host.sentiment.read")(submitted, {});
    await handlerOf(agents, "host.recovery.read_sentiment")(
      { clientId: id, locationId: place, data: { responseId: id, concern: "high", safety: true } },
      {},
    );
    expect(calls.map((c) => c.name)).toEqual([
      "recovery.evaluate",
      "sentiment.read",
      "recovery.evaluate",
    ]);
    expect(calls[0]?.request).toEqual({
      clientId: id,
      locationId: place,
      input: { trigger: "submitted", responseId: id, rating: 2 },
    });
    expect(calls[2]?.request).toEqual({
      clientId: id,
      locationId: place,
      input: { trigger: "read", responseId: id, concern: "high", safety: true },
    });
  });

  test("a refusal does not throw; an unreachable service does, so the queue retries", async () => {
    const refused = recording(() => ({ decision: "rejected", reason: "agent is off" }));
    await handlerOf(refused.agents, "host.sentiment.read")(
      { clientId: id, locationId: place, data: { responseId: id, rating: 2 } },
      {},
    );
    const down = {
      call: async () => {
        throw new AgentsCallError("the agents service is unreachable", null);
      },
    } as unknown as AgentsClient;
    await expect(
      handlerOf(down, "host.sentiment.read")(
        { clientId: id, locationId: place, data: { responseId: id, rating: 2 } },
        {},
      ),
    ).rejects.toBeInstanceOf(AgentsCallError);
  });

  test("the cron job calls ask.send_due and throws when the service is down", async () => {
    const ok = recording(() => ({
      decision: "executed",
      result: { sent: 0, deferred: 0, dropped: 0 },
    }));
    await agentConsumers(ok.agents).jobs[0]?.run();
    expect(ok.calls).toEqual([{ name: "ask.send_due", request: { input: {} } }]);
    const down = {
      call: async () => {
        throw new AgentsCallError("the agents service is unreachable", null);
      },
    } as unknown as AgentsClient;
    await expect(agentConsumers(down).jobs[0]?.run()).rejects.toBeInstanceOf(AgentsCallError);
  });
});
