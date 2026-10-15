import { describe, expect, test } from "bun:test";
import type { Gateway } from "@atrium/policy";
import { createUsageMeter } from "../src/runtime/meter";
import { ModelUnavailableError } from "../src/runtime/model";
import { createAgentsApp } from "../src/server";
import { defineTask, type Task, type TaskContext } from "../src/tasks";

const id = "0b2f1c4e-6a5d-4f0e-9a39-2f6f4b8d1c11";
const place = "7c1d2e3f-0a1b-4c2d-8e3f-4a5b6c7d8e9f";
const TOKEN = "service-token-of-some-length";

const ctx: TaskContext = {
  gateway: { call: async () => ({ decision: "executed", output: {} }) } as Gateway,
  db: undefined as never,
  now: () => new Date("2026-10-06T17:00:00Z"),
  models: { sentiment: true },
};

const logs: { message: string; fields?: Record<string, unknown> }[] = [];
const log = {
  info: (message: string, fields?: Record<string, unknown>) =>
    void logs.push({ message, ...(fields ? { fields } : {}) }),
  error: (message: string, fields?: Record<string, unknown>) =>
    void logs.push({ message, ...(fields ? { fields } : {}) }),
};

function appWith(run: Task<"sentiment.read">["run"]) {
  const ran: unknown[] = [];
  const read = defineTask({
    name: "sentiment.read",
    run: async (c, request) => {
      ran.push(request);
      return run(c, request);
    },
  });
  return {
    ran,
    app: createAgentsApp({
      tasks: [read as unknown as Task],
      ctx,
      token: TOKEN,
      meter: createUsageMeter(),
      log,
    }),
  };
}

const post = (
  app: ReturnType<typeof createAgentsApp>,
  name: string,
  body: unknown,
  token: string | null = TOKEN,
) =>
  app.request(`/v1/tasks/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const valid = { clientId: id, locationId: place, input: { responseId: id, rating: 2 } };

describe("the agents service", () => {
  test("health answers without a token", async () => {
    const { app } = appWith(async () => ({ decision: "executed", result: { status: "read" } }));
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  test("a body over 16 KB is a 413, but a missing token is still a 401", async () => {
    const { app, ran } = appWith(async () => ({
      decision: "executed",
      result: { status: "read" },
    }));
    const big = JSON.stringify({ ...valid, pad: "x".repeat(20_000) });
    const tooBig = await post(app, "sentiment.read", big);
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ error: "payload_too_large" });
    const unauth = await post(app, "sentiment.read", big, null);
    expect(unauth.status).toBe(401);
    expect(ran).toHaveLength(0);
  });

  test("a task runs and answers with its decision", async () => {
    const { app, ran } = appWith(async () => ({
      decision: "executed",
      result: { status: "read" },
    }));
    const res = await post(app, "sentiment.read", valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decision: "executed", result: { status: "read" } });
    expect(ran).toHaveLength(1);
  });

  test("a missing, wrong or different-length token is 401 and the task never runs", async () => {
    const { app, ran } = appWith(async () => ({
      decision: "executed",
      result: { status: "read" },
    }));
    for (const token of [null, "wrong-token-of-the-same-len!", "short", `${TOKEN}-and-more`]) {
      const res = await post(app, "sentiment.read", valid, token);
      expect(res.status).toBe(401);
    }
    expect(ran).toHaveLength(0);
  });

  test("an unknown task is 404, a bad body is 400, a missing client for a client task is 400", async () => {
    const { app, ran } = appWith(async () => ({
      decision: "executed",
      result: { status: "read" },
    }));
    expect((await post(app, "nope.nothing", valid)).status).toBe(404);
    expect((await post(app, "__proto__", valid)).status).toBe(404);
    expect((await post(app, "sentiment.read", "not json")).status).toBe(400);
    expect(
      (await post(app, "sentiment.read", { ...valid, input: { responseId: id, rating: 9 } }))
        .status,
    ).toBe(400);
    expect((await post(app, "sentiment.read", { input: valid.input })).status).toBe(400);
    expect(ran).toHaveLength(0);
  });

  test("a 400 says which field, and never repeats the input back", async () => {
    const { app } = appWith(async () => ({ decision: "executed", result: { status: "read" } }));
    const res = await post(app, "sentiment.read", {
      ...valid,
      input: { responseId: id, rating: 9, comment: "the soup was cold" },
    });
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(text).not.toContain("soup");
  });

  test("a provider failure is 502 with a kind and a status, and no text from the error", async () => {
    logs.length = 0;
    const { app } = appWith(async () => {
      const error = new ModelUnavailableError("rate_limited", 429);
      error.message = "rate limited while reading: the soup was cold";
      throw error;
    });
    const res = await post(app, "sentiment.read", valid);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ kind: "rate_limited", status: 429 });
    expect(JSON.stringify(logs)).not.toContain("soup");
  });

  test("any other failure is 500 with a fixed body, and the log holds no message text", async () => {
    logs.length = 0;
    const { app } = appWith(async () => {
      throw new Error("tool blew up near: the soup was cold");
    });
    const res = await post(app, "sentiment.read", valid);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "task_error" });
    expect(JSON.stringify(logs)).not.toContain("soup");
  });

  test("a task runs inside the usage meter", async () => {
    const meter = createUsageMeter();
    let seen: { tokens: number } | undefined;
    const read = defineTask({
      name: "sentiment.read",
      run: async () => {
        meter.add(9);
        seen = meter.current();
        return { decision: "executed", result: { status: "read" } };
      },
    });
    const app = createAgentsApp({
      tasks: [read as unknown as Task],
      ctx,
      token: TOKEN,
      meter,
      log,
    });
    await post(app, "sentiment.read", valid);
    expect(seen).toEqual({ tokens: 9 });
  });
});
