import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AtriumEvent } from "@atrium/contracts";
import {
  assignClient,
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
import {
  CardNotFoundError,
  type CrmDeps,
  getProgram,
  InvalidStampInputError,
  issueCard,
  joinToken,
  LoyaltyForbiddenError,
  NoRewardError,
  NothingToVoidError,
  redeemReward,
  StampRefusedError,
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
const SECRET = "loyalty-secret-for-tests";

let now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + 1_800_000);
const published: AtriumEvent[] = [];
const deps: CrmDeps = {
  secret: SECRET,
  now: () => now,
  publish: async (event) => {
    published.push(event);
  },
};
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

let clientId = "";
const owner = (): Scope => ({
  kind: "client",
  userId: `st-owner-${suffix}`,
  role: "client_owner",
  clientId,
});
const staffAt = (...locationIds: string[]): Scope =>
  ({
    kind: "client",
    userId: `st-staff-${suffix}`,
    role: "client_staff",
    clientId,
    ...(locationIds.length ? { locationIds } : {}),
  }) as Scope;
const manager: Scope = { kind: "assigned", userId: `st-am-${suffix}`, role: "account_manager" };
const admin_: Scope = { kind: "agency", userId: `st-admin-${suffix}`, role: "agency_admin" };

let ipSeq = 0;
const ipHead = `${Number.parseInt(suffix.slice(0, 2), 16)}.${Number.parseInt(suffix.slice(2, 4), 16)}`;
const nextIp = () => `${ipHead}.${Math.floor(ipSeq / 250) + 100}.${(ipSeq++ % 250) + 1}`;
let keySeq = 0;
const key = () => `k-${suffix}-${keySeq++}`;

type Fixture = { locationId: string; cardId: string; token: string; code: string };

/** A new active location with a program and one issued card. */
async function fixture(options: { cooldown?: number; required?: number } = {}): Promise<Fixture> {
  const locationId = await withAgency(db, async (tx) => {
    const id = (
      await createLocation(tx, clientId, { name: `L${keySeq++}`, timeZone: "America/Chicago" })
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
        stampsRequired: options.required ?? 8,
        rewardLabel: "Free coffee",
        cooldownMinutes: options.cooldown ?? 0,
        active: true,
        accent: "lime",
      },
      deps,
    ),
  );
  const issued = await issueCard(
    db,
    {
      joinToken: joinToken(program, SECRET),
      deviceHash: `dev-${suffix}-${keySeq++}`,
      ip: nextIp(),
    },
    deps,
  );
  if (!issued.ok) throw new Error(`issue failed: ${issued.reason}`);
  const [row] = await admin.unsafe("select id from crm.loyalty_cards where location_id = $1", [
    locationId,
  ]);
  return {
    locationId,
    cardId: row.id,
    token: issued.card.token,
    code: issued.card.shortCode,
  };
}

const stamp = (
  f: Fixture,
  scope: Scope = owner(),
  k: string = key(),
  by: "code" | "token" = "code",
) =>
  withScope(db, scope, (tx) =>
    stampCard(
      tx,
      scope,
      by === "code"
        ? { locationId: f.locationId, code: f.code }
        : { locationId: f.locationId, cardToken: f.token },
      { idempotencyKey: k },
      deps,
    ),
  );
const redeem = (f: Fixture, scope: Scope = owner(), k: string = key()) =>
  withScope(db, scope, (tx) =>
    redeemReward(
      tx,
      scope,
      { locationId: f.locationId, code: f.code },
      { idempotencyKey: k },
      deps,
    ),
  );
const voidLast = (f: Fixture, scope: Scope = owner(), reason = "wrong card", k: string = key()) =>
  withScope(db, scope, (tx) =>
    voidLastStamp(tx, scope, { cardId: f.cardId, reason, idempotencyKey: k }, deps),
  );
const count = async (f: Fixture, kind?: string) =>
  (
    await admin.unsafe(
      "select count(*)::int as n from crm.loyalty_events where card_id = $1 and ($2::text is null or kind = $2)",
      [f.cardId, kind ?? null],
    )
  )[0].n as number;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await admin.unsafe("insert into core.users (id, name, email) values ($1, 'Manager', $2)", [
    manager.userId,
    `${manager.userId}@st.atrium.dev`,
  ]);
  await withAgency(db, async (tx) => {
    const c = await createClientWithOrganization(tx, { name: "Stamps", slug: `crm-st-${suffix}` });
    clientId = c.client.id;
    await assignClient(tx, manager.userId, clientId, { type: "user", id: admin_.userId });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`crm-st-${suffix}`}`),
  );
  await admin.unsafe("delete from core.users where id = $1", [manager.userId]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("stamping", () => {
  test("eight stamps earn one reward; the ninth starts a new cycle", async () => {
    const f = await fixture();
    let last = await stamp(f);
    for (let i = 2; i <= 8; i++) last = await stamp(f);
    expect(last).toMatchObject({
      cardId: f.cardId,
      stampsInCycle: 8,
      stampsRequired: 8,
      rewardEarned: true,
      rewardReady: true,
    });
    expect(await count(f, "reward_earned")).toBe(1);
    const rewards = await admin.unsafe("select * from crm.loyalty_rewards where card_id = $1", [
      f.cardId,
    ]);
    expect(rewards.length).toBe(1);
    const ninth = await stamp(f);
    expect(ninth).toMatchObject({ stampsInCycle: 1, rewardEarned: false, rewardReady: true });
    expect(await count(f, "reward_earned")).toBe(1);
  });

  test("a stamp copies client and location from the card and records the actor", async () => {
    const f = await fixture();
    await stamp(f, staffAt());
    const [e] = await admin.unsafe(
      "select e.client_id, e.location_id, e.actor_id, e.kind, c.last_stamp_at from crm.loyalty_events e join crm.loyalty_cards c on c.id = e.card_id where e.card_id = $1",
      [f.cardId],
    );
    expect(e.client_id).toBe(clientId);
    expect(e.location_id).toBe(f.locationId);
    expect(e.actor_id).toBe(`st-staff-${suffix}`);
    expect(e.kind).toBe("stamp");
    expect(new Date(e.last_stamp_at).getTime()).toBe(now.getTime());
  });

  test("the cooldown blocks inside the window, with retryAt, and allows the exact boundary", async () => {
    const f = await fixture({ cooldown: 240 });
    const start = now;
    await stamp(f);
    now = new Date(start.getTime() + 239 * 60_000);
    const refused = await stamp(f).catch((e) => e);
    expect(refused).toBeInstanceOf(StampRefusedError);
    expect(refused.reason).toBe("cooldown");
    expect(refused.retryAt.getTime()).toBe(start.getTime() + 240 * 60_000);
    expect(await count(f, "stamp")).toBe(1);
    now = new Date(start.getTime() + 240 * 60_000);
    expect((await stamp(f)).stampsInCycle).toBe(2);
    now = start;
  });

  test("a paused program refuses with reason paused", async () => {
    const f = await fixture();
    await withScope(db, admin_, async (tx) => {
      const p = await getProgram(tx, admin_, f.locationId);
      if (!p) throw new Error("no program");
      await upsertProgram(tx, admin_, f.locationId, { ...p, active: false }, deps);
    });
    const refused = await stamp(f).catch((e) => e);
    expect(refused).toBeInstanceOf(StampRefusedError);
    expect(refused.reason).toBe("paused");
  });

  test("a closed card refuses with reason closed", async () => {
    const f = await fixture();
    await admin.unsafe("update crm.loyalty_cards set closed_at = now() where id = $1", [f.cardId]);
    const refused = await stamp(f).catch((e) => e);
    expect(refused).toBeInstanceOf(StampRefusedError);
    expect(refused.reason).toBe("closed");
  });

  test("the card is found by token and by a lower case code with a dash", async () => {
    const f = await fixture();
    const byToken = await stamp(f, owner(), key(), "token");
    expect(byToken.cardId).toBe(f.cardId);
    const lower = f.code.toLowerCase();
    expect(lower).toContain("-");
    const scope = owner();
    const byCode = await withScope(db, scope, (tx) =>
      stampCard(
        tx,
        scope,
        { locationId: f.locationId, code: lower },
        { idempotencyKey: key() },
        deps,
      ),
    );
    expect(byCode).toMatchObject({ cardId: f.cardId, stampsInCycle: 2 });
  });

  test("unknown code, malformed token and a card of another location are all CardNotFoundError", async () => {
    const a = await fixture();
    const b = await fixture();
    const scope = owner();
    const tryLookup = (lookup: Parameters<typeof stampCard>[2]) =>
      withScope(db, scope, (tx) => stampCard(tx, scope, lookup, { idempotencyKey: key() }, deps));
    await expect(tryLookup({ locationId: a.locationId, code: "ZZZZ-ZZZZ" })).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
    await expect(tryLookup({ locationId: a.locationId, code: "!" })).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
    await expect(tryLookup({ locationId: a.locationId, cardToken: "nope" })).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
    // right card, wrong location in the request
    await expect(tryLookup({ locationId: a.locationId, code: b.code })).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
    await expect(
      tryLookup({ locationId: a.locationId, cardToken: b.token }),
    ).rejects.toBeInstanceOf(CardNotFoundError);
    expect(await count(b)).toBe(0);
  });

  test("client_staff limited to location A cannot stamp a card of location B", async () => {
    const a = await fixture();
    const b = await fixture();
    const narrow = staffAt(a.locationId);
    await expect(stamp(b, narrow)).rejects.toBeInstanceOf(CardNotFoundError);
    expect((await stamp(a, narrow)).stampsInCycle).toBe(1);
    expect(await count(b)).toBe(0);
  });

  test("agency roles cannot stamp or redeem", async () => {
    const f = await fixture();
    for (const scope of [admin_, manager]) {
      await expect(stamp(f, scope)).rejects.toBeInstanceOf(LoyaltyForbiddenError);
      await expect(redeem(f, scope)).rejects.toBeInstanceOf(LoyaltyForbiddenError);
    }
    expect(await count(f)).toBe(0);
  });

  test("invalid idempotency keys give InvalidStampInputError", async () => {
    const f = await fixture();
    for (const bad of ["", "   ", "x".repeat(201)]) {
      await expect(stamp(f, owner(), bad)).rejects.toBeInstanceOf(InvalidStampInputError);
    }
    expect(await count(f)).toBe(0);
  });
});

describe("idempotency and concurrency", () => {
  test("replaying a key after the card moved on returns the first result and adds no event", async () => {
    const f = await fixture();
    const k = key();
    const first = await stamp(f, owner(), k);
    await stamp(f);
    await stamp(f);
    const again = await stamp(f, owner(), k);
    expect(again).toEqual(first);
    expect(first.stampsInCycle).toBe(1);
    expect(await count(f, "stamp")).toBe(3);
  });

  test("replaying the key of the stamp that earned the reward reports the same result", async () => {
    const f = await fixture({ required: 2 });
    await stamp(f);
    const k = key();
    const first = await stamp(f, owner(), k);
    expect(first).toMatchObject({ rewardEarned: true, stampsInCycle: 2 });
    await stamp(f);
    expect(await stamp(f, owner(), k)).toEqual(first);
    expect(await count(f, "reward_earned")).toBe(1);
  });

  test("a key used for another kind of action is refused", async () => {
    const f = await fixture();
    const k = key();
    await stamp(f, owner(), k);
    await expect(redeem(f, owner(), k)).rejects.toBeInstanceOf(InvalidStampInputError);
  });

  test("two concurrent stamps with different keys inside the cooldown produce one stamp", async () => {
    const f = await fixture({ cooldown: 240 });
    const results = await Promise.allSettled([stamp(f), stamp(f)]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StampRefusedError);
    expect(rejected.reason.reason).toBe("cooldown");
    expect(await count(f, "stamp")).toBe(1);
  });

  test("two concurrent stamps with the same key produce one stamp and the same result", async () => {
    const f = await fixture({ cooldown: 240 });
    const k = key();
    const [a, b] = await Promise.all([stamp(f, owner(), k), stamp(f, owner(), k)]);
    expect(a).toEqual(b);
    expect(await count(f, "stamp")).toBe(1);
  });

  test("many concurrent stamps without a cooldown all land, and exactly one reward is earned", async () => {
    const f = await fixture({ required: 4 });
    const results = await Promise.all(Array.from({ length: 4 }, () => stamp(f)));
    expect(results.filter((r) => r.rewardEarned).length).toBe(1);
    expect(await count(f, "stamp")).toBe(4);
    expect(await count(f, "reward_earned")).toBe(1);
  });

  test("two concurrent redeems of one reward: exactly one wins", async () => {
    const f = await fixture({ required: 2 });
    await stamp(f);
    await stamp(f);
    const results = await Promise.allSettled([redeem(f), redeem(f)]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(NoRewardError);
    expect(await count(f, "reward_redeemed")).toBe(1);
  });
});

describe("clock, keys and scope hardening", () => {
  test("a clock that runs backwards keeps the log ordered: no lost stamp, a void still cancels", async () => {
    const f = await fixture();
    const start = now;
    await stamp(f);
    now = new Date(start.getTime() - 60 * 60_000);
    expect((await stamp(f)).stampsInCycle).toBe(2);
    expect((await stamp(f)).stampsInCycle).toBe(3);
    expect((await voidLast(f)).stampsInCycle).toBe(2);
    expect((await voidLast(f)).stampsInCycle).toBe(1);
    const rows = await admin.unsafe(
      "select kind, created_at from crm.loyalty_events where card_id = $1 order by seq",
      [f.cardId],
    );
    const times = rows.map((r: { created_at: Date }) => new Date(r.created_at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    now = start;
  });

  test("the reserved earned: prefix is refused as a key", async () => {
    const f = await fixture();
    await expect(stamp(f, owner(), "earned:abc")).rejects.toBeInstanceOf(InvalidStampInputError);
    await expect(redeem(f, owner(), "earned:abc")).rejects.toBeInstanceOf(InvalidStampInputError);
    await expect(voidLast(f, admin_, "r", "earned:abc")).rejects.toBeInstanceOf(
      InvalidStampInputError,
    );
  });

  test("a location or card id that is not a uuid is CardNotFoundError, not a database error", async () => {
    const f = await fixture();
    const scope = owner();
    await expect(
      withScope(db, scope, (tx) =>
        stampCard(tx, scope, { locationId: "nope", code: f.code }, { idempotencyKey: key() }, deps),
      ),
    ).rejects.toBeInstanceOf(CardNotFoundError);
    await expect(
      withScope(db, admin_, (tx) =>
        voidLastStamp(tx, admin_, { cardId: "nope", reason: "x", idempotencyKey: key() }, deps),
      ),
    ).rejects.toBeInstanceOf(CardNotFoundError);
  });

  test("staff limited to location A cannot redeem a card at location B", async () => {
    const a = await fixture({ required: 2 });
    const b = await fixture({ required: 2 });
    await stamp(b);
    await stamp(b);
    await expect(redeem(b, staffAt(a.locationId))).rejects.toBeInstanceOf(CardNotFoundError);
    expect(await count(b, "reward_redeemed")).toBe(0);
  });
});

describe("redeeming", () => {
  test("with no reward it throws NoRewardError", async () => {
    const f = await fixture();
    await stamp(f);
    await expect(redeem(f)).rejects.toBeInstanceOf(NoRewardError);
    expect(await count(f, "reward_redeemed")).toBe(0);
  });

  test("redeeming clears rewardReady; a second redeem with a new key throws", async () => {
    const f = await fixture({ required: 2 });
    await stamp(f);
    await stamp(f);
    const k = key();
    const done = await redeem(f, staffAt(), k);
    expect(done.cardId).toBe(f.cardId);
    const [reward] = await admin.unsafe("select * from crm.loyalty_rewards where card_id = $1", [
      f.cardId,
    ]);
    expect(reward.id).toBe(done.rewardId);
    expect(reward.redeemed_at).not.toBeNull();
    expect(reward.redeemed_by).toBe(`st-staff-${suffix}`);
    await expect(redeem(f)).rejects.toBeInstanceOf(NoRewardError);
    // replay of the first key returns the first result
    expect(await redeem(f, owner(), k)).toEqual(done);
    expect(await count(f, "reward_redeemed")).toBe(1);
    expect((await stamp(f)).rewardReady).toBe(false);
  });

  test("the oldest reward is redeemed first", async () => {
    const f = await fixture({ required: 2 });
    for (let i = 0; i < 4; i++) await stamp(f);
    const rewards = await admin.unsafe(
      "select id from crm.loyalty_rewards where card_id = $1 order by earned_at, id",
      [f.cardId],
    );
    expect(rewards.length).toBe(2);
    expect((await redeem(f)).rewardId).toBe(rewards[0].id);
    expect((await redeem(f)).rewardId).toBe(rewards[1].id);
  });
});

describe("voiding", () => {
  test("void removes the last stamp from the count, and a second void the one before", async () => {
    const f = await fixture();
    await stamp(f);
    await stamp(f);
    await stamp(f);
    expect((await voidLast(f)).stampsInCycle).toBe(2);
    expect((await voidLast(f)).stampsInCycle).toBe(1);
    expect(await count(f, "stamp")).toBe(3);
    expect(await count(f, "void")).toBe(2);
    const voids = await admin.unsafe(
      "select v.voids_id, s.kind from crm.loyalty_events v join crm.loyalty_events s on s.id = v.voids_id where v.card_id = $1 and v.kind = 'void'",
      [f.cardId],
    );
    expect(voids.every((r: { kind: string }) => r.kind === "stamp")).toBe(true);
    expect(new Set(voids.map((r: { voids_id: string }) => r.voids_id)).size).toBe(2);
  });

  test("agency roles can void; client_staff cannot", async () => {
    const f = await fixture();
    for (let i = 0; i < 3; i++) await stamp(f);
    expect((await voidLast(f, admin_)).stampsInCycle).toBe(2);
    expect((await voidLast(f, manager)).stampsInCycle).toBe(1);
    await expect(voidLast(f, staffAt())).rejects.toBeInstanceOf(LoyaltyForbiddenError);
  });

  test("with nothing to void it throws, also right after a reward was earned", async () => {
    const f = await fixture({ required: 2 });
    await expect(voidLast(f)).rejects.toBeInstanceOf(NothingToVoidError);
    await stamp(f);
    await stamp(f);
    await expect(voidLast(f)).rejects.toBeInstanceOf(NothingToVoidError);
    expect(await count(f, "void")).toBe(0);
  });

  test("an unknown card is CardNotFoundError; the reason must be 1 to 200 characters", async () => {
    const f = await fixture();
    await stamp(f);
    const scope = admin_;
    await expect(
      withScope(db, scope, (tx) =>
        voidLastStamp(
          tx,
          scope,
          { cardId: crypto.randomUUID(), reason: "x", idempotencyKey: key() },
          deps,
        ),
      ),
    ).rejects.toBeInstanceOf(CardNotFoundError);
    for (const bad of ["", "  ", "x".repeat(201)]) {
      await expect(voidLast(f, admin_, bad)).rejects.toBeInstanceOf(InvalidStampInputError);
    }
    expect(await count(f, "void")).toBe(0);
  });

  test("replaying a void key returns the first result with no second void", async () => {
    const f = await fixture();
    await stamp(f);
    await stamp(f);
    const k = key();
    const first = await voidLast(f, admin_, "typo", k);
    const again = await voidLast(f, admin_, "typo", k);
    expect(again).toEqual(first);
    expect(await count(f, "void")).toBe(1);
  });

  test("a voided stamp does not hold the cooldown", async () => {
    const f = await fixture({ cooldown: 240 });
    await stamp(f);
    await voidLast(f);
    expect((await stamp(f)).stampsInCycle).toBe(1);
  });
});

describe("audit, events and the log", () => {
  test("every success writes one audit row with ids only; published events carry ids only", async () => {
    const f = await fixture({ required: 2 });
    published.length = 0;
    const scope = staffAt();
    await stamp(f, scope);
    await stamp(f, scope);
    await redeem(f, scope);
    await stamp(f, scope);
    await voidLast(f, admin_, "customer asked");
    const rows = await admin.unsafe(
      "select action, input, output, reason from core.audit_log where client_id = $1 and location_id = $2",
      [clientId, f.locationId],
    );
    const actions = rows
      .map((r: { action: string }) => r.action)
      .filter((a: string) => a.startsWith("crm.loyalty."))
      .filter((a: string) => !["crm.loyalty.upsert_program"].includes(a));
    expect(actions.filter((a: string) => a === "crm.loyalty.stamp").length).toBe(3);
    expect(actions.filter((a: string) => a === "crm.loyalty.redeem").length).toBe(1);
    expect(actions.filter((a: string) => a === "crm.loyalty.void").length).toBe(1);
    const blob = JSON.stringify(rows) + JSON.stringify(published);
    expect(blob).not.toContain(f.token);
    expect(blob).not.toContain(f.code);
    expect(blob).not.toContain(f.code.replace("-", ""));
    const types = published.map((e) => e.type);
    expect(types.filter((t) => t === "loyalty.stamp.added").length).toBe(3);
    expect(types.filter((t) => t === "loyalty.reward.earned").length).toBe(1);
    expect(types.filter((t) => t === "loyalty.reward.redeemed").length).toBe(1);
    for (const e of published) {
      expect(e.clientId).toBe(clientId);
      expect(e.locationId).toBe(f.locationId);
    }
  });

  test("a replay writes no audit row and publishes nothing", async () => {
    const f = await fixture();
    const k = key();
    await stamp(f, owner(), k);
    published.length = 0;
    await stamp(f, owner(), k);
    expect(published.length).toBe(0);
    const rows = await admin.unsafe(
      "select count(*)::int as n from core.audit_log where action = 'crm.loyalty.stamp' and location_id = $1",
      [f.locationId],
    );
    expect(rows[0].n).toBe(1);
  });

  test("events are never updated: ids and created_at are stable across later activity", async () => {
    const f = await fixture();
    await stamp(f);
    const before = await admin.unsafe(
      "select id, seq, kind, created_at, voids_id, note from crm.loyalty_events where card_id = $1 order by seq",
      [f.cardId],
    );
    await stamp(f);
    await voidLast(f);
    const after = await admin.unsafe(
      "select id, seq, kind, created_at, voids_id, note from crm.loyalty_events where card_id = $1 order by seq limit 1",
      [f.cardId],
    );
    expect(after[0]).toEqual(before[0]);
    expect(await count(f)).toBe(3);
  });
});
