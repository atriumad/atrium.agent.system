import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AtriumEvent } from "@atrium/contracts";
import {
  createClientWithOrganization,
  createDatabase,
  createLocation,
  type Scope,
  withAgency,
  withScope,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { signQrToken } from "../../reputation/domain/invitations";
import {
  type CardView,
  type CrmDeps,
  checkRate,
  getCardByToken,
  getProgram,
  InvalidProgramError,
  issueCard,
  joinToken,
  LoyaltyForbiddenError,
  rotateJoinQr,
  signJoinToken,
  upsertProgram,
} from "../index";
import { toEventRow } from "../infra/repository";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const SECRET = "loyalty-secret-for-tests";

// A fixed clock in the middle of the current hour keeps the window counters stable for the run.
const NOW = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + 1_800_000);
const events: AtriumEvent[] = [];
const deps: CrmDeps = {
  secret: SECRET,
  now: () => NOW,
  publish: async (event) => {
    events.push(event);
  },
};

const setStatus = (id: string, status: string) =>
  withAgency(db, (tx) =>
    tx.execute(sql`update core.locations set status = ${status} where id = ${id}`),
  );

let clientId = "";
let locA = "";
let locB = "";
let locC = "";
let locD = "";
const owner = (): Scope => ({
  kind: "client",
  userId: `crm-owner-${suffix}`,
  role: "client_owner",
  clientId,
});
const staff = (): Scope => ({
  kind: "client",
  userId: `crm-staff-${suffix}`,
  role: "client_staff",
  clientId,
});
const agencyStaff: Scope = { kind: "assigned", userId: `crm-as-${suffix}`, role: "agency_staff" };
const admin_: Scope = { kind: "agency", userId: `crm-admin-${suffix}`, role: "agency_admin" };

const input = {
  name: "Coffee card",
  stampsRequired: 8,
  rewardLabel: "Free coffee",
  cooldownMinutes: 240,
  active: true,
  accent: "lime",
} as const;

let ipSeq = 0;
// Unique per run, so counters from an earlier run in the same hour never meet these.
const ipHead = `${Number.parseInt(suffix.slice(0, 2), 16)}.${Number.parseInt(suffix.slice(2, 4), 16)}`;
const nextIp = () => `${ipHead}.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
let devSeq = 0;
const nextDevice = () => `device-${suffix}-${devSeq++}`;

async function programOf(locationId: string) {
  const program = await withScope(db, owner(), (tx) => getProgram(tx, owner(), locationId));
  if (!program) throw new Error("no program");
  return program;
}

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    const c = await createClientWithOrganization(tx, { name: "Cards", slug: `crm-pc-${suffix}` });
    clientId = c.client.id;
    const mk = async (name: string) =>
      (await createLocation(tx, clientId, { name, timeZone: "America/Chicago" })).id;
    locA = await mk("Alpha");
    locB = await mk("Bravo");
    locC = await mk("Charlie");
    locD = await mk("Delta");
  });
  for (const id of [locA, locB, locC, locD]) await setStatus(id, "active");
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`crm-pc-${suffix}`}`),
  );
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("programs", () => {
  test("upsertProgram creates and then updates the one program of a location", async () => {
    const created = await withScope(db, owner(), (tx) =>
      upsertProgram(tx, owner(), locA, input, deps),
    );
    expect(created).toMatchObject({
      locationId: locA,
      name: "Coffee card",
      joinQrVersion: 1,
      accent: "lime",
    });
    const updated = await withScope(db, owner(), (tx) =>
      upsertProgram(tx, owner(), locA, { ...input, stampsRequired: 10, accent: "sage" }, deps),
    );
    expect(updated.id).toBe(created.id);
    expect(updated).toMatchObject({ stampsRequired: 10, accent: "sage" });
    const count = await admin.unsafe(
      "select count(*)::int as n from crm.loyalty_programs where location_id = $1",
      [locA],
    );
    expect(count[0].n).toBe(1);
    const audit = await admin.unsafe(
      "select input from core.audit_log where action = 'crm.loyalty.upsert_program' and actor_id = $1",
      [owner().userId],
    );
    expect(audit.length).toBe(2);
    expect(JSON.stringify(audit)).not.toContain("Free coffee");
  });

  test("an agency admin manages; client_staff and agency_staff are forbidden", async () => {
    const ok = await withScope(db, admin_, (tx) => upsertProgram(tx, admin_, locA, input, deps));
    expect(ok.locationId).toBe(locA);
    for (const scope of [staff(), agencyStaff]) {
      await expect(
        withScope(db, scope, (tx) => upsertProgram(tx, scope, locA, input, deps)),
      ).rejects.toBeInstanceOf(LoyaltyForbiddenError);
    }
    const reads = await withScope(db, staff(), (tx) => getProgram(tx, staff(), locA));
    expect(reads?.locationId).toBe(locA);
  });

  test("a location outside the staff's scope has no program to read", async () => {
    const narrow: Scope = { ...staff(), locationIds: [locB] } as Scope;
    expect(await withScope(db, narrow, (tx) => getProgram(tx, narrow, locA))).toBeNull();
  });

  test("invalid input gives InvalidProgramError", async () => {
    const bad = [
      { stampsRequired: 1 },
      { stampsRequired: 21 },
      { rewardLabel: "x".repeat(81) },
      { rewardLabel: "" },
      { cooldownMinutes: 1441 },
      { accent: "pink" as never },
    ];
    for (const patch of bad) {
      await expect(
        withScope(db, owner(), (tx) =>
          upsertProgram(tx, owner(), locA, { ...input, ...patch }, deps),
        ),
      ).rejects.toBeInstanceOf(InvalidProgramError);
    }
  });

  test("rotateJoinQr invalidates the previous join token", async () => {
    const program = await withScope(db, owner(), (tx) =>
      upsertProgram(tx, owner(), locB, input, deps),
    );
    const old = joinToken(program, SECRET);
    const rotated = await withScope(db, owner(), (tx) => rotateJoinQr(tx, owner(), program.id));
    expect(rotated.joinQrVersion).toBe(2);
    expect(
      await issueCard(db, { joinToken: old, deviceHash: nextDevice(), ip: nextIp() }, deps),
    ).toEqual({ ok: false, reason: "invalid" });
    const fresh = await issueCard(
      db,
      { joinToken: joinToken(rotated, SECRET), deviceHash: nextDevice(), ip: nextIp() },
      deps,
    );
    expect(fresh.ok).toBe(true);
    await expect(
      withScope(db, staff(), (tx) => rotateJoinQr(tx, staff(), program.id)),
    ).rejects.toBeInstanceOf(LoyaltyForbiddenError);
  });
});

describe("issueCard", () => {
  test("creates a card, returns the token once and stores only its hash", async () => {
    const program = await programOf(locA);
    events.length = 0;
    const out = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip: nextIp() },
      deps,
    );
    if (!out.ok) throw new Error(out.reason);
    expect(out.card.token).toHaveLength(22);
    expect(out.programId).toBe(program.id);
    const rows = await admin.unsafe("select * from crm.loyalty_cards where program_id = $1", [
      program.id,
    ]);
    expect(rows.length).toBe(1);
    for (const value of Object.values(rows[0])) expect(value).not.toBe(out.card.token);
    expect(rows[0].client_id).toBe(clientId);
    expect(rows[0].location_id).toBe(locA);
    expect(events.length).toBe(1);
    const event = events[0] as AtriumEvent & { data: Record<string, unknown> };
    expect(event.type).toBe("loyalty.card.issued");
    expect(event.clientId).toBe(clientId);
    expect(event.data).toEqual({ cardId: rows[0].id, programId: program.id });
  });

  test("a survey QR token, an invitation token and junk are invalid", async () => {
    for (const token of [
      signQrToken(SECRET, locA, 1),
      "A".repeat(43),
      "",
      signJoinToken("other-secret", crypto.randomUUID(), 1),
    ]) {
      expect(
        await issueCard(db, { joinToken: token, deviceHash: nextDevice(), ip: nextIp() }, deps),
      ).toEqual({ ok: false, reason: "invalid" });
    }
  });

  test("a paused program or a suspended location gives paused", async () => {
    const program = await withScope(db, owner(), (tx) =>
      upsertProgram(tx, owner(), locC, { ...input, active: false }, deps),
    );
    expect(
      await issueCard(
        db,
        { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip: nextIp() },
        deps,
      ),
    ).toEqual({ ok: false, reason: "paused" });
    const live = await withScope(db, owner(), (tx) =>
      upsertProgram(tx, owner(), locC, input, deps),
    );
    await setStatus(locC, "suspended");
    expect(
      await issueCard(
        db,
        { joinToken: joinToken(live, SECRET), deviceHash: nextDevice(), ip: nextIp() },
        deps,
      ),
    ).toEqual({ ok: false, reason: "paused" });
    await setStatus(locC, "active");
  });

  test("the same device twice on one program within 24 hours gives device_limit", async () => {
    const program = await programOf(locA);
    const device = nextDevice();
    const first = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: device, ip: nextIp() },
      deps,
    );
    expect(first.ok).toBe(true);
    const second = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: device, ip: nextIp() },
      deps,
    );
    expect(second).toMatchObject({ ok: false, reason: "device_limit" });
    if (!second.ok) expect(second.retryAfter).toBeGreaterThan(0);
  });

  test("the device is allowed again once its card is 24 hours old", async () => {
    const program = await programOf(locA);
    const device = nextDevice();
    const first = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: device, ip: nextIp() },
      deps,
    );
    expect(first.ok).toBe(true);
    await admin.unsafe(
      "update crm.loyalty_cards set created_at = $1 where program_id = $2 and device_hash = $3",
      [new Date(NOW.getTime() - 24 * 3_600_000 - 1000), program.id, device],
    );
    const again = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: device, ip: nextIp() },
      deps,
    );
    expect(again.ok).toBe(true);
  });

  test("a failed issue does not use up the device's allowance", async () => {
    const program = await programOf(locA);
    const device = nextDevice();
    const taken = "UUUU2222";
    const occupy = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip: nextIp() },
      { ...deps, generateShortCode: () => taken },
    );
    expect(occupy.ok).toBe(true);
    const stuck: CrmDeps = { ...deps, generateShortCode: () => taken };
    await expect(
      issueCard(
        db,
        { joinToken: joinToken(program, SECRET), deviceHash: device, ip: nextIp() },
        stuck,
      ),
    ).rejects.toThrow(/short code/);
    const ok = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: device, ip: nextIp() },
      deps,
    );
    expect(ok.ok).toBe(true);
  });

  test("an empty device hash is invalid", async () => {
    const program = await programOf(locA);
    for (const deviceHash of ["", "   "]) {
      expect(
        await issueCard(
          db,
          { joinToken: joinToken(program, SECRET), deviceHash, ip: nextIp() },
          deps,
        ),
      ).toEqual({ ok: false, reason: "invalid" });
    }
  });

  test("21 joins from one address in an hour give rate_limited", async () => {
    const program = await programOf(locA);
    const ip = nextIp();
    let last: Awaited<ReturnType<typeof issueCard>> | undefined;
    for (let i = 0; i < 21; i++) {
      last = await issueCard(
        db,
        { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip },
        deps,
      );
    }
    expect(last).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  test("201 cards on one program in an hour give rate_limited with retryAfter", async () => {
    const program = await withScope(db, owner(), (tx) =>
      upsertProgram(tx, owner(), locD, input, deps),
    );
    const token = joinToken(program, SECRET);
    for (let i = 0; i < 200; i++) {
      const out = await issueCard(
        db,
        { joinToken: token, deviceHash: nextDevice(), ip: nextIp() },
        deps,
      );
      if (!out.ok) throw new Error(`card ${i}: ${out.reason}`);
    }
    const over = await issueCard(
      db,
      { joinToken: token, deviceHash: nextDevice(), ip: nextIp() },
      deps,
    );
    expect(over).toMatchObject({ ok: false, reason: "rate_limited" });
    if (!over.ok) expect(over.retryAfter).toBe(1800);
    // the refused attempt left no card, so its device has not used its allowance
    const refusedDevice = nextDevice();
    await issueCard(db, { joinToken: token, deviceHash: refusedDevice, ip: nextIp() }, deps);
    const held = await admin.unsafe(
      "select count(*)::int as n from crm.loyalty_cards where device_hash = $1",
      [refusedDevice],
    );
    expect(held[0].n).toBe(0);
  }, 60_000);

  test("a short-code collision is retried", async () => {
    const program = await programOf(locA);
    const codes = ["K7M492QD", "K7M492QD", "K7M492QD", "ZZZZ2222"];
    const generate = () => codes.shift() ?? "ABCDEFGH";
    const withGen: CrmDeps = { ...deps, generateShortCode: generate };
    const a = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip: nextIp() },
      withGen,
    );
    const b = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip: nextIp() },
      withGen,
    );
    if (!a.ok || !b.ok) throw new Error("expected both to be issued");
    expect(a.card.shortCode).toBe("K7M4-92QD");
    expect(b.card.shortCode).toBe("ZZZZ-2222");
  });

  test("gives up after five collisions", async () => {
    const program = await programOf(locA);
    // its own occupied code, so the test does not lean on an earlier one
    const taken = "TTTT2222";
    const first = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip: nextIp() },
      { ...deps, generateShortCode: () => taken },
    );
    expect(first.ok).toBe(true);
    const stuck: CrmDeps = { ...deps, generateShortCode: () => taken };
    await expect(
      issueCard(
        db,
        { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip: nextIp() },
        stuck,
      ),
    ).rejects.toThrow(/short code/);
  });
});

describe("getCardByToken", () => {
  async function newCard(locationId: string): Promise<{ token: string; programId: string }> {
    const program = await programOf(locationId);
    const out = await issueCard(
      db,
      { joinToken: joinToken(program, SECRET), deviceHash: nextDevice(), ip: nextIp() },
      deps,
    );
    if (!out.ok) throw new Error(out.reason);
    return { token: out.card.token, programId: program.id };
  }

  test("returns the public view without any guest field", async () => {
    const { token } = await newCard(locA);
    const view = (await getCardByToken(db, token, deps)) as CardView;
    expect(view).toMatchObject({
      state: "active",
      locationName: "Alpha",
      programName: "Coffee card",
      rewardLabel: "Free coffee",
      accent: "lime",
      stampsInCycle: 0,
      rewardReady: false,
    });
    expect(view.stampsRequired).toBeGreaterThanOrEqual(2);
    expect(view.shortCode).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect(Object.keys(view).sort()).toEqual(
      [
        "accent",
        "etag",
        "locationName",
        "programName",
        "rewardLabel",
        "rewardReady",
        "shortCode",
        "state",
        "stampsInCycle",
        "stampsRequired",
      ].sort(),
    );
  });

  test("null for an unknown token and a one-character-off token", async () => {
    const { token } = await newCard(locA);
    const off = `${token.slice(0, 21)}${token.endsWith("A") ? "B" : "A"}`;
    expect(await getCardByToken(db, off, deps)).toBeNull();
    expect(await getCardByToken(db, "A".repeat(22), deps)).toBeNull();
    expect(await getCardByToken(db, "", deps)).toBeNull();
    expect(await getCardByToken(db, "not a token", deps)).toBeNull();
  });

  test("two reads of an unchanged card share an etag; a change moves it", async () => {
    const { token } = await newCard(locA);
    const a = await getCardByToken(db, token, deps);
    const b = await getCardByToken(db, token, deps);
    expect(a?.etag).toBe(b?.etag as string);
    await withScope(db, owner(), (tx) =>
      upsertProgram(
        tx,
        owner(),
        locA,
        { ...input, rewardLabel: "Free cake", stampsRequired: 10, accent: "sage" },
        deps,
      ),
    );
    const c = await getCardByToken(db, token, deps);
    expect(c?.etag).not.toBe(a?.etag);
    await withScope(db, owner(), (tx) =>
      upsertProgram(tx, owner(), locA, { ...input, stampsRequired: 10, accent: "sage" }, deps),
    );
  });

  test("a paused program reads paused and a closed card reads closed", async () => {
    const { token, programId } = await newCard(locA);
    await admin.unsafe("update crm.loyalty_programs set active = false where id = $1", [programId]);
    expect((await getCardByToken(db, token, deps))?.state).toBe("paused");
    await admin.unsafe("update crm.loyalty_programs set active = true where id = $1", [programId]);
    await setStatus(locA, "suspended");
    expect((await getCardByToken(db, token, deps))?.state).toBe("paused");
    await setStatus(locA, "active");
    await admin.unsafe(
      "update crm.loyalty_cards set closed_at = now() where token_hash = encode(sha256($1::bytea), 'hex')",
      [token],
    );
    expect((await getCardByToken(db, token, deps))?.state).toBe("closed");
  });

  test("progress counts stamps in (created_at, seq) order", async () => {
    const { token } = await newCard(locA);
    const card = await admin.unsafe(
      "select id from crm.loyalty_cards where token_hash = encode(sha256($1::bytea), 'hex')",
      [token],
    );
    for (let i = 0; i < 3; i++) {
      await admin.unsafe(
        "insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key) values ($1, $2, $3, 'stamp', $4)",
        [clientId, locA, card[0].id, `k${i}`],
      );
    }
    expect((await getCardByToken(db, token, deps))?.stampsInCycle).toBe(3);
  });
});

describe("mapping", () => {
  test("toEventRow converts the bigint seq a driver returns as a string", () => {
    const row = toEventRow({
      id: "e1",
      seq: "42" as unknown as number,
      kind: "stamp",
      createdAt: new Date(0),
      voidsId: null,
    });
    expect(row.seq).toBe(42);
    expect(typeof row.seq).toBe("number");
    expect(row.voidsId).toBeUndefined();
    expect(
      toEventRow({ id: "e2", seq: 7, kind: "void", createdAt: new Date(0), voidsId: "e1" }).voidsId,
    ).toBe("e1");
  });
});

describe("checkRate", () => {
  test("counts hits and reports retryAfter", async () => {
    const key = `test:${suffix}:${crypto.randomUUID()}`;
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await checkRate(db, key, "cardPerDevicePerDay", NOW));
    expect(results.map((r) => r.allowed)).toEqual([true, false, false]);
    expect(results[1]?.retryAfter).toBeGreaterThan(0);
  });
});
