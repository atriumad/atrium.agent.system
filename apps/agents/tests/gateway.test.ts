import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createClient,
  createDatabase,
  createLocation,
  listAudit,
  listPendingApprovals,
  setOverride,
  setPackage,
  switchOff,
  type Tx,
  withAgency,
  withTenant,
} from "@atrium/core";
import { defineTool, parseManifest, reasonField, type Tool } from "@atrium/policy";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { migrate } from "../../../scripts/migrate";
import { createGateway } from "../src";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const ops = { type: "user", id: `gw-ops-${suffix}` } as const;
const NOW = new Date("2026-10-06T17:00:00Z"); // 12:00 in Chicago

let a: string;
let b: string;
let locA: string;
const ran: string[] = [];

const manifest = (name: string, level: number, extra = "") =>
  parseManifest(`
id: ${name}
version: 7
engine: reputation
goal: "A test agent"
tools:
  reputation.read_thing: { level: ${level} }
  reputation.write_thing: { level: ${level}${extra} }
  reputation.write_other: { level: ${level} }
scopes: [reputation:read, reputation:write]
never:
  - never say the forbidden word
untrusted_input: []
escalate_to: account_manager
kill_switch: per_client
evals: none
`);

const tools: Tool<never, unknown, Tx>[] = [
  defineTool({
    name: "reputation.read_thing",
    description: "reads",
    input: z.object({ id: z.string() }),
    output: z.object({ ok: z.boolean() }),
    writes: false,
    feature: "reputation",
    scopes: ["reputation:read"],
    never: [{ rule: "never say the forbidden word", enforcedBy: "n/a in this test" }],
    handler: async () => {
      ran.push("read");
      return { ok: true };
    },
  }),
  defineTool({
    name: "reputation.write_thing",
    description: "writes",
    input: z.object({ text: z.string(), reason: reasonField }),
    output: z.object({ wrote: z.string() }),
    writes: true,
    feature: "reputation",
    scopes: ["reputation:write"],
    never: [
      {
        rule: "never say the forbidden word",
        check: (input) =>
          (input as { text: string }).text.includes("forbidden")
            ? "contains the forbidden word"
            : null,
      },
    ],
    handler: async (input) => {
      ran.push(`write:${(input as { text: string }).text}`);
      return { wrote: (input as { text: string }).text };
    },
  }),
  defineTool({
    name: "reputation.write_other",
    description: "writes, then fails",
    input: z.object({ reason: reasonField, mode: z.enum(["boom", "bad_output"]) }),
    output: z.object({ fine: z.literal(true) }),
    writes: true,
    feature: "reputation",
    scopes: ["reputation:write"],
    never: [{ rule: "never say the forbidden word", enforcedBy: "n/a in this test" }],
    handler: async (input, _ctx, tx: Tx) => {
      await tx.execute(sql`insert into core.guests (client_id, name) values (${a}, 'rolled-back')`);
      if ((input as { mode: string }).mode === "boom") throw new Error("the tool blew up");
      return { fine: false } as never;
    },
  }),
] as unknown as Tool<never, unknown, Tx>[];

const gatewayFor = (...manifests: ReturnType<typeof manifest>[]) =>
  createGateway({ db, manifests, tools, now: () => NOW });

const write = (agentId: string, text = "hello", clientId = a) => ({
  agentId,
  clientId,
  // A location belongs to one client: only client A has the one this test created.
  locationId: clientId === a ? locA : null,
  tool: "reputation.write_thing",
  input: { text, reason: "a perfectly good reason" },
});

const auditOf = (agentId: string) =>
  withTenant(db, a, (tx) => listAudit(tx, a, { actorId: agentId, limit: 50 }));

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `gw-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `gw-brasa-${suffix}` })).id;
    locA = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
    await setPackage(tx, a, "pillar_2", ops);
    await setPackage(tx, b, "pillar_2", ops);
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.kill_switches where agent_id like ${`gw${suffix}%`}`),
  );
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`gw-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or actor_id like $2", [
    `%${suffix}%`,
    `gw%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

describe("levels", () => {
  test("level 4 runs the tool and audits it with the agent, its version and the output", async () => {
    const id = `gw${suffix}.exec`;
    const result = await gatewayFor(manifest(id, 4)).call(write(id));
    expect(result).toEqual({ decision: "executed", output: { wrote: "hello" } });
    expect(ran).toContain("write:hello");
    const [row] = await auditOf(id);
    expect(row).toMatchObject({
      actorType: "agent",
      actorId: id,
      agentVersion: 7,
      decision: "executed",
      action: "reputation.write_thing",
    });
    expect(row?.output).toEqual({ wrote: "hello" });
  });

  test("an executed call records the cost the runtime reports; a draft does not", async () => {
    const id = `gw${suffix}.cost`;
    const priced = createGateway({
      db,
      manifests: [manifest(id, 4)],
      tools,
      now: () => NOW,
      costOf: () => ({ tokens: 42 }),
    });
    await priced.call(write(id, "priced"));
    const [row] = await auditOf(id);
    expect(row).toMatchObject({ decision: "executed", costTokens: 42 });

    const drafting = `gw${suffix}.costdraft`;
    const draftGateway = createGateway({
      db,
      manifests: [manifest(drafting, 2)],
      tools,
      now: () => NOW,
      costOf: () => ({ tokens: 42 }),
    });
    await draftGateway.call(write(drafting, "unpriced"));
    const [draft] = await auditOf(drafting);
    expect(draft).toMatchObject({ decision: "drafted" });
    expect(draft?.costTokens).toBeNull();
  });

  test("level 3 queues an approval and does not run the tool", async () => {
    const id = `gw${suffix}.approve`;
    const before = ran.length;
    const result = await gatewayFor(manifest(id, 3)).call(write(id, "needs a person"));
    expect(result.decision).toBe("pending_approval");
    expect(ran.length).toBe(before);
    const pending = await withTenant(db, a, (tx) => listPendingApprovals(tx, a));
    const mine = pending.find((p) => p.requestedById === id);
    expect(mine).toMatchObject({
      itemType: "reputation.write_thing",
      payload: { tool: "reputation.write_thing", input: { text: "needs a person" } },
    });
    expect((await auditOf(id)).some((r) => r.decision === "pending_approval")).toBe(true);
  });

  test("asking twice for the same thing queues one approval", async () => {
    const id = `gw${suffix}.approve2`;
    const gw = gatewayFor(manifest(id, 3));
    const first = await gw.call(write(id, "same"));
    const second = await gw.call(write(id, "same"));
    expect(
      first.decision === "pending_approval" &&
        second.decision === "pending_approval" &&
        first.approvalId === second.approvalId,
    ).toBe(true);
  });

  test("level 2 saves a draft and does not run the tool", async () => {
    const id = `gw${suffix}.draft`;
    const before = ran.length;
    expect((await gatewayFor(manifest(id, 2)).call(write(id))).decision).toBe("drafted");
    expect(ran.length).toBe(before);
    expect((await auditOf(id))[0]).toMatchObject({ decision: "drafted" });
  });

  test("level 1 refuses a write but still reads", async () => {
    const id = `gw${suffix}.observe`;
    const gw = gatewayFor(manifest(id, 1));
    expect(await gw.call(write(id))).toMatchObject({ decision: "rejected", step: 6 });
    const read = await gw.call({
      agentId: id,
      clientId: a,
      tool: "reputation.read_thing",
      input: { id: "x" },
    });
    expect(read).toEqual({ decision: "executed", output: { ok: true } });
  });
});

describe("the steps", () => {
  test("1 · a kill switch stops one client and leaves the other running", async () => {
    const id = `gw${suffix}.switch`;
    const gw = gatewayFor(manifest(id, 4));
    await withAgency(db, (tx) =>
      switchOff(tx, { agentId: id, clientId: a, reason: "owner asked to pause" }, ops),
    );
    const before = ran.length;
    expect(await gw.call(write(id))).toMatchObject({ decision: "rejected", step: 1 });
    expect(ran.length).toBe(before);
    expect((await gw.call(write(id, "for b", b))).decision).toBe("executed");
    expect((await auditOf(id))[0]).toMatchObject({ decision: "rejected" });
  });

  test("2 · a package without the module locks the tool, and an override can open it", async () => {
    const id = `gw${suffix}.locked`;
    const gw = gatewayFor(manifest(id, 4));
    await withAgency(db, (tx) => setOverride(tx, a, "reputation", "locked", ops));
    expect(await gw.call(write(id))).toMatchObject({ decision: "rejected", step: 2 });
    await withAgency(db, (tx) => setOverride(tx, a, "reputation", "full", ops));
    expect((await gw.call(write(id))).decision).toBe("executed");
  });

  test("2 · a tool the manifest does not list is refused", async () => {
    const id = `gw${suffix}.narrow`;
    const narrow = parseManifest(`
id: ${id}
version: 1
engine: reputation
goal: "Only reads"
tools:
  reputation.read_thing: { level: 4 }
scopes: [reputation:read]
never:
  - never say the forbidden word
untrusted_input: []
escalate_to: account_manager
kill_switch: per_client
evals: none
`);
    const gw = createGateway({ db, manifests: [narrow], tools, now: () => NOW }).call(write(id));
    expect(await gw).toMatchObject({ decision: "rejected", step: 2 });
  });

  test("3 · a tool needing a scope the manifest lacks is refused", async () => {
    const id = `gw${suffix}.noscope`;
    const readOnly = parseManifest(`
id: ${id}
version: 1
engine: reputation
goal: "No write scope"
tools:
  reputation.write_thing: { level: 4 }
scopes: [reputation:read]
never:
  - never say the forbidden word
untrusted_input: []
escalate_to: account_manager
kill_switch: per_client
evals: none
`);
    expect(
      await createGateway({ db, manifests: [readOnly], tools, now: () => NOW }).call(write(id)),
    ).toMatchObject({ decision: "rejected", step: 3 });
  });

  test("4 · the daily limit counts this agent and this client only", async () => {
    const id = `gw${suffix}.limited`;
    const other = `gw${suffix}.limited2`;
    // Audit rows are stamped by the database clock, so the limit is exercised with the real one.
    const gw = createGateway({
      db,
      manifests: [manifest(id, 4, ", max_per_day: 2"), manifest(other, 4, ", max_per_day: 2")],
      tools,
    });
    const results = [];
    for (const text of ["one", "two", "three"])
      results.push((await gw.call(write(id, text))).decision);
    expect(results).toEqual(["executed", "executed", "rejected"]);
    expect(await gw.call(write(id, "fourth"))).toMatchObject({ step: 4 });
    expect((await gw.call(write(other, "fresh"))).decision).toBe("executed");
    expect((await gw.call(write(id, "other client", b))).decision).toBe("executed");
  });

  test("4 · hours are the location's local time, not the server's", async () => {
    const id = `gw${suffix}.hours`;
    const day = parseManifest(`
id: ${id}
version: 1
engine: reputation
goal: "Daytime only"
tools:
  reputation.write_thing: { level: 4, hours: { from: 9, to: 21 } }
scopes: [reputation:write]
never:
  - never say the forbidden word
untrusted_input: []
escalate_to: account_manager
kill_switch: per_client
evals: none
`);
    const noon = createGateway({ db, manifests: [day], tools, now: () => NOW });
    expect((await noon.call(write(id))).decision).toBe("executed");
    const night = createGateway({
      db,
      manifests: [day],
      tools,
      now: () => new Date("2026-10-07T03:30:00Z"),
    }); // 22:30 in Chicago
    expect(await night.call(write(id, "late"))).toMatchObject({ decision: "rejected", step: 4 });
  });

  test("5 · a never rule that fires rejects with the rule and the reason", async () => {
    const id = `gw${suffix}.never`;
    const result = await gatewayFor(manifest(id, 4)).call(write(id, "this is forbidden text"));
    expect(result).toMatchObject({ decision: "rejected", step: 5 });
    expect((result as { reason: string }).reason).toContain("never say the forbidden word");
  });
});

describe("locations that are not active", () => {
  test("a pending or suspended location is refused before the tool runs", async () => {
    const id = `gw${suffix}.inactive`;
    const loc = await withAgency(db, async (tx) => {
      const made = await createLocation(tx, a, { name: "Waiting", timeZone: "America/Chicago" });
      await tx.execute(sql`update core.locations set status = 'pending' where id = ${made.id}`);
      return made.id;
    });
    const before = ran.length;
    const result = await gatewayFor(manifest(id, 4)).call({ ...write(id), locationId: loc });
    expect(result).toMatchObject({ decision: "rejected", step: 0 });
    expect((result as { reason: string }).reason).toContain("not active");
    expect(ran.length).toBe(before);
    await withAgency(db, (tx) =>
      tx.execute(sql`update core.locations set status = 'suspended' where id = ${loc}`),
    );
    expect(await gatewayFor(manifest(id, 4)).call({ ...write(id), locationId: loc })).toMatchObject(
      {
        decision: "rejected",
        step: 0,
      },
    );
  });
});

describe("malformed calls", () => {
  test("an unknown agent, tool or bad input is refused, never run", async () => {
    const id = `gw${suffix}.bad`;
    const gw = gatewayFor(manifest(id, 4));
    const before = ran.length;
    expect(await gw.call({ ...write(id), agentId: `gw${suffix}.ghost` })).toMatchObject({
      decision: "rejected",
      step: 0,
    });
    expect(await gw.call({ ...write(id), tool: "reputation.nothing" })).toMatchObject({
      decision: "rejected",
      step: 0,
    });
    expect(await gw.call({ ...write(id), input: { text: "no reason here" } })).toMatchObject({
      decision: "rejected",
      step: 0,
    });
    expect(
      await gw.call({ ...write(id), input: { text: "short reason", reason: "short" } }),
    ).toMatchObject({ decision: "rejected", step: 0 });
    expect(ran.length).toBe(before);
  });

  test("a call with a client that does not exist is refused without crashing", async () => {
    const id = `gw${suffix}.noclient`;
    const result = await gatewayFor(manifest(id, 4)).call({ ...write(id), clientId: "not-a-uuid" });
    expect(result).toMatchObject({ decision: "rejected", step: 0 });
  });
});

describe("failures", () => {
  test("a tool that throws rolls its effect back, is audited, and the error reaches the caller", async () => {
    const id = `gw${suffix}.boom`;
    const gw = gatewayFor(manifest(id, 4));
    await expect(
      gw.call({
        agentId: id,
        clientId: a,
        tool: "reputation.write_other",
        input: { reason: "a perfectly good reason", mode: "boom" },
      }),
    ).rejects.toThrow("blew up");
    const left = await admin.unsafe("select 1 from core.guests where name = 'rolled-back'");
    expect(left).toHaveLength(0);
    expect((await auditOf(id))[0]).toMatchObject({ decision: "rejected" });
    expect(String((await auditOf(id))[0]?.reason)).toContain("tool_error");
  });

  test("a tool whose output breaks its contract fails the same way", async () => {
    const id = `gw${suffix}.badout`;
    await expect(
      gatewayFor(manifest(id, 4)).call({
        agentId: id,
        clientId: a,
        tool: "reputation.write_other",
        input: { reason: "a perfectly good reason", mode: "bad_output" },
      }),
    ).rejects.toThrow();
    const left = await admin.unsafe("select 1 from core.guests where name = 'rolled-back'");
    expect(left).toHaveLength(0);
  });
});

describe("startup checks", () => {
  test("a manifest that lists a tool that does not exist stops the gateway from starting", () => {
    const ghost = parseManifest(`
id: gw.ghost
version: 1
engine: reputation
goal: "Lists a missing tool"
tools:
  reputation.vanished: { level: 4 }
scopes: [reputation:read]
never:
  - never say the forbidden word
untrusted_input: []
escalate_to: account_manager
kill_switch: per_client
evals: none
`);
    expect(() => createGateway({ db, manifests: [ghost], tools })).toThrow("not a tool");
  });

  test("a never rule with no code behind it stops the gateway from starting", () => {
    const wish = parseManifest(`
id: gw.wish
version: 1
engine: reputation
goal: "A rule nobody enforces"
tools:
  reputation.read_thing: { level: 4 }
scopes: [reputation:read]
never:
  - never say the forbidden word
  - be nice at all times
untrusted_input: []
escalate_to: account_manager
kill_switch: per_client
evals: none
`);
    expect(() => createGateway({ db, manifests: [wish], tools })).toThrow("be nice at all times");
  });
});

describe("isolation", () => {
  test("a call for client B never reaches client A's data", async () => {
    const id = `gw${suffix}.iso`;
    const probe = defineTool({
      name: "reputation.read_thing",
      description: "counts guests it can see",
      input: z.object({ id: z.string() }),
      output: z.object({ seen: z.number() }),
      writes: false,
      feature: "reputation",
      scopes: ["reputation:read"],
      handler: async (_i, _c, tx: Tx) => {
        const rows = await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from core.clients where slug like ${`gw-%-${suffix}`}`,
        );
        return { seen: rows[0]?.n ?? -1 };
      },
    }) as unknown as Tool<never, unknown, Tx>;
    const gw = createGateway({
      db,
      manifests: [manifest(id, 4)],
      tools: [probe, ...tools.slice(1)],
      now: () => NOW,
    });
    const result = await gw.call({
      agentId: id,
      clientId: b,
      tool: "reputation.read_thing",
      input: { id: "x" },
    });
    expect(result).toEqual({ decision: "executed", output: { seen: 1 } });
  });
});
