import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  assignClient,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  PERMISSION_MATRIX,
  type Scope,
  withAgency,
  withScope,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  CardNotFoundError,
  type CrmDeps,
  issueCard,
  joinToken,
  LoyaltyForbiddenError,
  lookupCard,
  redeemReward,
  stampCard,
  upsertProgram,
  voidLastStamp,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const SECRET = "loyalty-secret-for-tests-0123456789abcdef";
const now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + 1_800_000);
const deps: CrmDeps = { secret: SECRET, now: () => now, publish: async () => {} };

let clientId = "";
let otherClientId = "";
const owner = (): Scope => ({
  kind: "client",
  userId: `lk-owner-${suffix}`,
  role: "client_owner",
  clientId,
});
const staffAt = (...locationIds: string[]): Scope =>
  ({
    kind: "client",
    userId: `lk-staff-${suffix}`,
    role: "client_staff",
    clientId,
    locationIds,
  }) as Scope;
const otherOwner = (): Scope => ({
  kind: "client",
  userId: `lk-owner2-${suffix}`,
  role: "client_owner",
  clientId: otherClientId,
});
const admin_: Scope = { kind: "agency", userId: `lk-admin-${suffix}`, role: "agency_admin" };
const agencyStaff: Scope = { kind: "assigned", userId: `lk-as-${suffix}`, role: "agency_staff" };

let ipSeq = 0;
const ipHead = `${Number.parseInt(suffix.slice(0, 2), 16)}.${Number.parseInt(suffix.slice(2, 4), 16)}`;
const nextIp = () => `${ipHead}.${Math.floor(ipSeq / 250) + 100}.${(ipSeq++ % 250) + 1}`;
let seq = 0;
const key = () => `k-${suffix}-${seq++}`;

async function fixture() {
  const locationId = await withAgency(db, async (tx) => {
    const id = (
      await createLocation(tx, clientId, { name: `LK-${suffix}-${seq++}`, timeZone: "UTC" })
    ).id;
    await tx.execute(sql`update core.locations set status = 'active' where id = ${id}`);
    return id;
  });
  const program = await withScope(db, admin_, (tx) =>
    upsertProgram(
      tx,
      admin_,
      locationId,
      {
        name: "Coffee card",
        stampsRequired: 3,
        rewardLabel: "Free coffee",
        cooldownMinutes: 0,
        active: true,
        accent: "lime",
      },
      deps,
    ),
  );
  const issued = await issueCard(
    db,
    { joinToken: joinToken(program, SECRET), deviceHash: `dev-${suffix}-${seq++}`, ip: nextIp() },
    deps,
  );
  if (!issued.ok) throw new Error(`issue failed: ${issued.reason}`);
  const [row] = await admin.unsafe("select id from crm.loyalty_cards where location_id = $1", [
    locationId,
  ]);
  return {
    locationId,
    cardId: row.id as string,
    code: issued.card.shortCode,
    token: issued.card.token,
  };
}
type F = Awaited<ReturnType<typeof fixture>>;

const stamp = (f: F, scope: Scope = owner()) =>
  withScope(db, scope, (tx) =>
    stampCard(
      tx,
      scope,
      { locationId: f.locationId, code: f.code },
      { idempotencyKey: key() },
      deps,
    ),
  );
const lookup = (f: { locationId: string }, code: string, scope: Scope = owner()) =>
  withScope(db, scope, (tx) => lookupCard(tx, scope, { locationId: f.locationId, code }));

beforeAll(async () => {
  await migrate(ADMIN_URL);
  for (const [id, name] of [
    [`lk-owner-${suffix}`, "Olga Owner"],
    [`lk-staff-${suffix}`, "Sam Staff"],
  ] as const) {
    await admin.unsafe("insert into core.users (id, name, email) values ($1, $2, $3)", [
      id,
      name,
      `${id}@lk.atrium.dev`,
    ]);
  }
  await withAgency(db, async (tx) => {
    const c = await createClientWithOrganization(tx, { name: "LK", slug: `crm-lk-${suffix}` });
    clientId = c.client.id;
    const o = await createClientWithOrganization(tx, { name: "LK2", slug: `crm-lk2-${suffix}` });
    otherClientId = o.client.id;
    await assignClient(tx, `lk-owner-${suffix}`, clientId, {
      type: "user",
      id: admin_.userId,
    }).catch(() => {});
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`crm-lk%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.users where id like $1", [`lk-%-${suffix}`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("lookupCard", () => {
  test("staff of the place finds a card by code, with its accent, pending rewards and last 5 events newest first", async () => {
    const f = await fixture();
    const staff = staffAt(f.locationId);
    for (let i = 0; i < 3; i++) await stamp(f, staff);
    const mid = await lookup(f, f.code, staff);
    expect(mid).toMatchObject({
      cardId: f.cardId,
      accent: "lime",
      shortCode: f.code,
      locationId: f.locationId,
      programName: "Coffee card",
      rewardLabel: "Free coffee",
      stampsRequired: 3,
      rewardReady: true,
      rewardsPending: 1,
      state: "active",
    });
    // 3 stamps and a reward_earned: 4 events, newest first
    expect(mid.recent.map((r) => r.kind)).toEqual(["reward_earned", "stamp", "stamp", "stamp"]);

    await withScope(db, staff, (tx) =>
      redeemReward(
        tx,
        staff,
        { locationId: f.locationId, code: f.code },
        { idempotencyKey: key() },
        deps,
      ),
    );
    await stamp(f, staff);
    await stamp(f, staff);
    const card = await lookup(f, f.code, staff);
    expect(card.recent).toHaveLength(5);
    for (let i = 1; i < card.recent.length; i++) {
      expect(card.recent[i - 1]!.at >= card.recent[i]!.at).toBe(true);
    }
    expect(card.recent[0]!.kind).toBe("stamp");
    expect(card.recent[1]!.kind).toBe("stamp");
    expect(card.recent[2]!.kind).toBe("reward_redeemed");
    expect(card.rewardsPending).toBe(0);
    expect(card.recent[0]!.cardShortCode).toBe(f.code);
    expect(card.recent[0]!.actorName).toBe("Sam Staff");

    const voider = owner();
    await withScope(db, voider, (tx) =>
      voidLastStamp(
        tx,
        voider,
        { cardId: f.cardId, reason: "wrong card", idempotencyKey: key() },
        deps,
      ),
    );
    const voided = await lookup(f, f.code, staff);
    expect(voided.recent[0]).toMatchObject({ kind: "void", note: "wrong card" });
    expect(voided.recent.slice(1).every((r) => r.note === null)).toBe(true);
  });

  test("a code with dashes or lower case finds the same card", async () => {
    const f = await fixture();
    const plain = await lookup(f, f.code);
    const lower = await lookup(f, f.code.toLowerCase());
    const spaced = await lookup(f, ` ${f.code.replace("-", "")} `.toLowerCase());
    expect(lower).toEqual(plain);
    expect(spaced).toEqual(plain);
    expect(plain.cardId).toBe(f.cardId);
  });

  test("an unknown code, a malformed code and a place outside the scope are all CardNotFoundError", async () => {
    const f = await fixture();
    const g = await fixture();
    const attempts: Promise<unknown>[] = [
      lookup(f, "AAAA-AAAA"),
      lookup(f, "x"),
      lookup(f, ""),
      lookup(f, 12 as unknown as string),
      lookup({ locationId: "not-a-uuid" }, f.code),
      lookup({ locationId: crypto.randomUUID() }, f.code),
      lookup(f, f.code, staffAt(g.locationId)),
      lookup(f, f.code, otherOwner()),
    ];
    const errors = await Promise.all(attempts.map((p) => p.catch((e) => e)));
    for (const e of errors) {
      expect(e).toBeInstanceOf(CardNotFoundError);
      expect((e as Error).message).toBe((errors[0] as Error).message);
    }
  });

  test("a role without loyalty:read is LoyaltyForbiddenError", async () => {
    const f = await fixture();
    // every shipped role may read, so the grant is taken away for the length of the call
    const grants = PERMISSION_MATRIX.agency_staff;
    const kept = grants.loyalty ?? [];
    try {
      (grants as { loyalty?: readonly string[] }).loyalty = [];
      await expect(lookup(f, f.code, agencyStaff)).rejects.toBeInstanceOf(LoyaltyForbiddenError);
    } finally {
      (grants as { loyalty?: readonly string[] }).loyalty = kept;
    }
  });

  test("the result holds no token, hash, device or guest field", async () => {
    const f = await fixture();
    await stamp(f);
    const card = await lookup(f, f.code);
    expect(Object.keys(card).sort()).toEqual([
      "accent",
      "cardId",
      "locationId",
      "locationName",
      "programName",
      "recent",
      "rewardLabel",
      "rewardReady",
      "rewardsPending",
      "shortCode",
      "stampsInCycle",
      "stampsRequired",
      "state",
    ]);
    const text = JSON.stringify(card);
    expect(text).not.toContain(f.token);
    for (const row of card.recent) {
      expect(Object.keys(row).sort()).toEqual([
        "actorName",
        "at",
        "cardShortCode",
        "id",
        "kind",
        "locationId",
        "locationName",
        "note",
      ]);
    }
  });
});
