import { describe, expect, test } from "bun:test";
import { AgentsCallError, createAgentsClient } from "./agents-client";

const id = "0b2f1c4e-6a5d-4f0e-9a39-2f6f4b8d1c11";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the agents client", () => {
  test("posts the task with the bearer token and returns the typed answer", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const client = createAgentsClient({
      url: "http://agents.test",
      token: "secret-token",
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return json({ decision: "executed", result: { status: "read" } });
      }) as unknown as typeof fetch,
    });
    const answer = await client.call("sentiment.read", {
      clientId: id,
      locationId: id,
      input: { responseId: id, rating: 2 },
    });
    expect(answer).toEqual({ decision: "executed", result: { status: "read" } });
    expect(seen?.url).toBe("http://agents.test/v1/tasks/sentiment.read");
    expect((seen?.init.headers as Record<string, string>).authorization).toBe(
      "Bearer secret-token",
    );
    expect(JSON.parse(String(seen?.init.body))).toEqual({
      clientId: id,
      locationId: id,
      input: { responseId: id, rating: 2 },
    });
  });

  test("a refusal is an answer, not an error", async () => {
    const client = createAgentsClient({
      url: "http://agents.test",
      token: "t",
      fetch: (async () =>
        json({ decision: "rejected", reason: "agent is off" })) as unknown as typeof fetch,
    });
    const answer = await client.call("ask.send_due", { input: {} });
    expect(answer).toEqual({ decision: "rejected", reason: "agent is off" });
  });

  test("a 502, a 401 and a 500 throw AgentsCallError with the status and no body", async () => {
    for (const status of [502, 401, 500]) {
      const client = createAgentsClient({
        url: "http://agents.test",
        token: "t",
        fetch: (async () =>
          json(
            { kind: "timeout", comment: "the soup was cold" },
            status,
          )) as unknown as typeof fetch,
      });
      const error = await client.call("ask.send_due", { input: {} }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(AgentsCallError);
      expect((error as AgentsCallError).status).toBe(status);
      expect(String((error as Error).message)).not.toContain("soup");
    }
  });

  test("an unreachable service throws AgentsCallError with no status", async () => {
    const client = createAgentsClient({
      url: "http://agents.test",
      token: "t",
      fetch: (async () => {
        throw new TypeError("connect ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    const error = await client.call("ask.send_due", { input: {} }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AgentsCallError);
    expect((error as AgentsCallError).status).toBeNull();
  });

  test("an answer that does not match the task's contract throws", async () => {
    const client = createAgentsClient({
      url: "http://agents.test",
      token: "t",
      fetch: (async () =>
        json({ decision: "executed", result: { sent: "many" } })) as unknown as typeof fetch,
    });
    const error = await client.call("ask.send_due", { input: {} }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AgentsCallError);
  });
});
