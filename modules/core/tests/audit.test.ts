import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AtriumEvent } from "@atrium/contracts";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  ApprovalAlreadyDecidedError,
  ApprovalForbiddenError,
  ApprovalNotFoundError,
  createClient,
  createDatabase,
  createLocation,
  decideApproval,
  isAgentActive,
  listAudit,
  listPendingApprovals,
  requestApproval,
  type Scope,
  setOverride,
  setPackage,
  switchOff,
  switchOn,
  withAgency,
  withTenant,
  writeAudit,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);

let a: string;
let b: string;
let locA: string;

const user = (name: string) => ({ type: "user", id: `test-${name}-${suffix}` }) as const;
const agent = (name: string) => ({ type: "agent", id: `test.${name}`, agentVersion: 3 }) as const;
const inA = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, a, fn);
const inB = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, b, fn);
const agency = <T>(fn: Parameters<typeof withAgency<T>>[1]) => withAgency(db, fn);

function recorder() {
  const events: AtriumEvent[] = [];
  return { events, publish: async (e: AtriumEvent) => void events.push(e) };
}

const scope = (role: Scope["role"], clientId?: string): Scope =>
  clientId
    ? { kind: "client", userId: `u-${role}-${suffix}`, role, clientId }
    : ({ kind: "agency", userId: `u-${role}-${suffix}`, role } as Scope);

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await agency(async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `au-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `au-brasa-${suffix}` })).id;
    locA = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
  });
});

afterAll(async () => {
  await agency(async (tx) => {
    await tx.execute(sql`delete from core.kill_switches where agent_id like ${`zz${suffix}%`}`);
    await tx.execute(sql`delete from core.clients where slug like ${`au-%-${suffix}`}`);
  });
  // The app role cannot delete audit rows by design; the owner cleans up the test's global ones.
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("audit log", () => {
  test("masks personal data in input, output and reason before storing", async () => {
    await inA((tx) =>
      writeAudit(tx, {
        actor: agent("echo"),
        clientId: a,
        action: "reputation.draft_reply",
        input: { guest: { name: "Ana López", email: "ana@mail.example.com" }, reviewId: "r_1" },
        output: { text: "Call (713) 555-0142 any time" },
        decision: "drafted",
        reason: "reply to ana@mail.example.com",
      }),
    );
    const [row] = await inA((tx) => listAudit(tx, a, { actorId: "test.echo", limit: 1 }));
    expect(row?.input).toEqual({ guest: { name: "[masked]", email: "[masked]" }, reviewId: "r_1" });
    expect(row?.output).toEqual({ text: "Call [phone] any time" });
    expect(row?.reason).toBe("reply to [email]");
    expect(JSON.stringify(row)).not.toContain("mail.example.com");
  });

  test("records who acted, with which manifest version, and the cost", async () => {
    await inA((tx) =>
      writeAudit(tx, {
        actor: agent("sentiment"),
        clientId: a,
        locationId: locA,
        action: "reputation.classify_response",
        decision: "executed",
        cost: { tokens: 1840, cents: 3 },
      }),
    );
    const [row] = await inA((tx) => listAudit(tx, a, { actorId: "test.sentiment" }));
    expect(row).toMatchObject({
      actorType: "agent",
      agentVersion: 3,
      locationId: locA,
      costTokens: 1840,
      costCents: 3,
      decision: "executed",
    });
  });

  test("is append-only for the app role", async () => {
    await expect(
      inA((tx) => tx.execute(sql`update core.audit_log set reason = 'x'`)),
    ).rejects.toThrow();
    await expect(inA((tx) => tx.execute(sql`delete from core.audit_log`))).rejects.toThrow();
  });

  test("a client reads only its own history, with or without a filter", async () => {
    await inB((tx) =>
      writeAudit(tx, { actor: agent("only-b"), clientId: b, action: "x.y", decision: "executed" }),
    );
    expect(await inA((tx) => listAudit(tx, b))).toEqual([]);
    const raw = await inA((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from core.audit_log where actor_id = 'test.only-b'`,
      ),
    );
    expect(raw[0]?.n).toBe(0);
  });

  test("a client cannot write history for another client", async () => {
    await expect(
      inA((tx) =>
        writeAudit(tx, {
          actor: agent("forger"),
          clientId: b,
          action: "x.y",
          decision: "executed",
        }),
      ),
    ).rejects.toThrow();
  });

  test("agency-wide entries have no client and only the agency sees them", async () => {
    await agency((tx) =>
      writeAudit(tx, {
        actor: user("global"),
        clientId: null,
        action: "core.global",
        decision: "executed",
      }),
    );
    await expect(
      inA((tx) =>
        writeAudit(tx, {
          actor: user("sneaky"),
          clientId: null,
          action: "core.global",
          decision: "executed",
        }),
      ),
    ).rejects.toThrow();
    const seen = await inA((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from core.audit_log where client_id is null`,
      ),
    );
    expect(seen[0]?.n).toBe(0);
  });

  test("filters by decision and pages newest first", async () => {
    for (let i = 0; i < 3; i++) {
      await inA((tx) =>
        writeAudit(tx, {
          actor: agent("pager"),
          clientId: a,
          action: `x.step_${i}`,
          decision: i === 1 ? "rejected" : "executed",
        }),
      );
    }
    const all = await inA((tx) => listAudit(tx, a, { actorId: "test.pager" }));
    expect(all.map((r) => r.action)).toEqual(["x.step_2", "x.step_1", "x.step_0"]);
    const rejected = await inA((tx) =>
      listAudit(tx, a, { actorId: "test.pager", decision: "rejected" }),
    );
    expect(rejected.map((r) => r.action)).toEqual(["x.step_1"]);
    const older = await inA((tx) =>
      listAudit(tx, a, { actorId: "test.pager", before: all[0]?.seq as number }),
    );
    expect(older.map((r) => r.action)).toEqual(["x.step_1", "x.step_0"]);
  });

  test("access changes record who made them", async () => {
    const actor = user("manager");
    await agency(async (tx) => {
      await setPackage(tx, a, "pillar_2", actor);
      await setOverride(tx, a, "retention", "full", actor, { note: "CRM pilot" });
    });
    const rows = await inA((tx) => listAudit(tx, a, { actorId: actor.id }));
    expect(rows.map((r) => r.action)).toEqual(["core.set_override", "core.set_package"]);
    expect(rows[0]).toMatchObject({ reason: "CRM pilot", decision: "executed" });
  });
});

describe("approval queue", () => {
  const item = {
    itemType: "reputation.reply",
    summary: "Reply to a 2-star review",
    payload: { draft: "Thanks for telling us." },
  };

  test("a proposal is queued, audited and announced", async () => {
    const r = recorder();
    const id = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: `rev-${suffix}-1` }, agent("echo"), r),
    );
    const pending = await inA((tx) => listPendingApprovals(tx, a));
    expect(pending.map((p) => p.id)).toContain(id);
    expect(r.events.map((e) => e.type)).toEqual(["approval.requested"]);
    const audit = await inA((tx) => listAudit(tx, a, { decision: "pending_approval" }));
    expect(audit.some((e) => e.action === "core.request_approval")).toBe(true);
  });

  test("asking again for an open item returns the same request", async () => {
    const r = recorder();
    const ref = `rev-${suffix}-dup`;
    const ids = await inA(async (tx) => [
      await requestApproval(tx, a, { ...item, itemRef: ref }, agent("echo"), r),
      await requestApproval(tx, a, { ...item, itemRef: ref }, agent("echo"), r),
    ]);
    expect(ids[0]).toBe(ids[1] as string);
    expect(r.events).toHaveLength(1);
  });

  test("an invalid item type is rejected", async () => {
    await expect(
      inA((tx) =>
        requestApproval(tx, a, { ...item, itemType: "reply", itemRef: "x" }, agent("echo")),
      ),
    ).rejects.toThrow("invalid item type");
  });

  test("the client owner approves their own request, and it is audited and announced", async () => {
    const r = recorder();
    const owner = scope("client_owner", a);
    const id = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: `rev-${suffix}-ok` }, agent("echo")),
    );
    const decided = await inA((tx) =>
      decideApproval(tx, owner, id, { decision: "approve", note: "looks good" }, r),
    );
    expect(decided).toMatchObject({
      status: "approved",
      decidedBy: owner.userId,
      decisionNote: "looks good",
    });
    expect(r.events.map((e) => e.data)).toEqual([
      {
        approvalId: id,
        itemType: "reputation.reply",
        itemRef: `rev-${suffix}-ok`,
        decision: "approved",
      },
    ]);
    const audit = await inA((tx) => listAudit(tx, a, { actorId: owner.userId }));
    expect(audit[0]).toMatchObject({ action: "core.decide_approval", approverId: owner.userId });
  });

  test("approve with an edit stores the person's version and keeps the proposal", async () => {
    const id = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: `rev-${suffix}-edit` }, agent("echo")),
    );
    const decided = await inA((tx) =>
      decideApproval(tx, scope("client_owner", a), id, {
        decision: "approve",
        editedPayload: { draft: "Thank you, we will do better." },
      }),
    );
    expect(decided.editedPayload).toEqual({ draft: "Thank you, we will do better." });
    expect(decided.payload).toEqual({ draft: "Thanks for telling us." });
  });

  test("discard closes the request, and cannot carry an edit", async () => {
    const id = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: `rev-${suffix}-no` }, agent("echo")),
    );
    await expect(
      inA((tx) =>
        decideApproval(tx, scope("client_owner", a), id, {
          decision: "discard",
          editedPayload: { x: 1 },
        }),
      ),
    ).rejects.toThrow("cannot carry an edit");
    const decided = await inA((tx) =>
      decideApproval(tx, scope("client_owner", a), id, { decision: "discard" }),
    );
    expect(decided.status).toBe("discarded");
  });

  test("a decided item can be proposed again as a new request", async () => {
    const ref = `rev-${suffix}-again`;
    const first = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: ref }, agent("echo")),
    );
    await inA((tx) => decideApproval(tx, scope("client_owner", a), first, { decision: "discard" }));
    const second = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: ref }, agent("echo")),
    );
    expect(second).not.toBe(first);
  });

  test("staff roles can look but not decide", async () => {
    const id = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: `rev-${suffix}-staff` }, agent("echo")),
    );
    await expect(
      inA((tx) => decideApproval(tx, scope("client_staff", a), id, { decision: "approve" })),
    ).rejects.toBeInstanceOf(ApprovalForbiddenError);
    await expect(
      agency((tx) => decideApproval(tx, scope("agency_staff"), id, { decision: "approve" })),
    ).rejects.toBeInstanceOf(ApprovalForbiddenError);
    expect((await inA((tx) => listPendingApprovals(tx, a))).some((p) => p.id === id)).toBe(true);
  });

  test("an account manager decides for any client", async () => {
    const id = await inB((tx) =>
      requestApproval(tx, b, { ...item, itemRef: `rev-${suffix}-am` }, agent("echo")),
    );
    const decided = await agency((tx) =>
      decideApproval(tx, scope("account_manager"), id, { decision: "approve" }),
    );
    expect(decided.status).toBe("approved");
  });

  test("a client cannot decide another client's request, and cannot even see it", async () => {
    const id = await inB((tx) =>
      requestApproval(tx, b, { ...item, itemRef: `rev-${suffix}-cross` }, agent("echo")),
    );
    await expect(
      inA((tx) => decideApproval(tx, scope("client_owner", a), id, { decision: "approve" })),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
    expect((await inA((tx) => listPendingApprovals(tx, b))).length).toBe(0);
  });

  test("a scope for one client is not enough to decide another's through the scope alone", async () => {
    // Even under agency-wide database scope, a client-kind scope is checked against the request.
    const id = await inB((tx) =>
      requestApproval(tx, b, { ...item, itemRef: `rev-${suffix}-scope` }, agent("echo")),
    );
    await expect(
      agency((tx) => decideApproval(tx, scope("client_owner", a), id, { decision: "approve" })),
    ).rejects.toBeInstanceOf(ApprovalNotFoundError);
  });

  test("only one decision wins, even when two people click at once", async () => {
    const id = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: `rev-${suffix}-race` }, agent("echo")),
    );
    const results = await Promise.allSettled([
      inA((tx) => decideApproval(tx, scope("client_owner", a), id, { decision: "approve" })),
      inA((tx) => decideApproval(tx, scope("client_owner", a), id, { decision: "discard" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ApprovalAlreadyDecidedError);
  });

  test("a second decision on a decided request is rejected", async () => {
    const id = await inA((tx) =>
      requestApproval(tx, a, { ...item, itemRef: `rev-${suffix}-twice` }, agent("echo")),
    );
    await inA((tx) => decideApproval(tx, scope("client_owner", a), id, { decision: "approve" }));
    await expect(
      inA((tx) => decideApproval(tx, scope("client_owner", a), id, { decision: "discard" })),
    ).rejects.toBeInstanceOf(ApprovalAlreadyDecidedError);
  });
});

describe("kill switches", () => {
  const ag = `zz${suffix}`;
  const sub = `${ag}.recovery`;

  test("an agent is active until someone switches it off", async () => {
    expect(await inA((tx) => isAgentActive(tx, sub, a))).toBe(true);
  });

  test("switching off for one client leaves the others running", async () => {
    await agency((tx) =>
      switchOff(tx, { agentId: sub, clientId: a, reason: "owner asked to pause" }, user("ops")),
    );
    expect(await inA((tx) => isAgentActive(tx, sub, a))).toBe(false);
    expect(await inB((tx) => isAgentActive(tx, sub, b))).toBe(true);
    expect(await inA((tx) => isAgentActive(tx, `${ag}.capture`, a))).toBe(true);
  });

  test("switching back on restores it, and a second switch-on reports nothing to do", async () => {
    expect(
      await agency((tx) => switchOn(tx, { agentId: sub, clientId: a }, user("ops"), "resolved")),
    ).toBe(true);
    expect(await inA((tx) => isAgentActive(tx, sub, a))).toBe(true);
    expect(
      await agency((tx) => switchOn(tx, { agentId: sub, clientId: a }, user("ops"), "again")),
    ).toBe(false);
  });

  test("a global switch stops it for every client, and every client can see that", async () => {
    await agency((tx) =>
      switchOff(tx, { agentId: sub, clientId: null, reason: "incident" }, user("ops")),
    );
    expect(await inA((tx) => isAgentActive(tx, sub, a))).toBe(false);
    expect(await inB((tx) => isAgentActive(tx, sub, b))).toBe(false);
    await agency((tx) => switchOn(tx, { agentId: sub, clientId: null }, user("ops"), "all clear"));
    expect(await inA((tx) => isAgentActive(tx, sub, a))).toBe(true);
  });

  test("an agent name switches off all of its subagents", async () => {
    await agency((tx) =>
      switchOff(tx, { agentId: ag, clientId: a, reason: "pause the whole agent" }, user("ops")),
    );
    expect(await inA((tx) => isAgentActive(tx, `${ag}.recovery`, a))).toBe(false);
    expect(await inA((tx) => isAgentActive(tx, `${ag}.capture`, a))).toBe(false);
    await agency((tx) => switchOn(tx, { agentId: ag, clientId: a }, user("ops"), "resume"));
  });

  test("a client cannot switch an agent off or on", async () => {
    await expect(
      inA((tx) => switchOff(tx, { agentId: sub, clientId: a, reason: "sneaky" }, user("c"))),
    ).rejects.toThrow();
    await agency((tx) => switchOff(tx, { agentId: sub, clientId: a, reason: "real" }, user("ops")));
    await inA((tx) => switchOn(tx, { agentId: sub, clientId: a }, user("c"), "sneaky"));
    expect(await inA((tx) => isAgentActive(tx, sub, a))).toBe(false);
    await agency((tx) => switchOn(tx, { agentId: sub, clientId: a }, user("ops"), "done"));
  });

  test("a reason is required, and the agent id must be valid", async () => {
    await expect(
      agency((tx) => switchOff(tx, { agentId: sub, clientId: a, reason: "  " }, user("ops"))),
    ).rejects.toThrow();
    await expect(
      agency((tx) =>
        switchOff(tx, { agentId: "Not Valid", clientId: a, reason: "x" }, user("ops")),
      ),
    ).rejects.toThrow("invalid agent");
  });

  test("every switch is in the audit log", async () => {
    const rows = await inA((tx) => listAudit(tx, a, { actorId: user("ops").id }));
    const actions = new Set(rows.map((r) => r.action));
    expect(actions.has("core.kill_switch_off")).toBe(true);
    expect(actions.has("core.kill_switch_on")).toBe(true);
  });
});
