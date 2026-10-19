import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AtriumEvent } from "@atrium/contracts";
import {
  assignClient,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  eraseGuest,
  type Scope,
  withAgency,
  withScope,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { generateShortCode } from "../domain/tokens";
import {
  attachEmail,
  CardNotFoundError,
  type CrmDeps,
  crmErasureConsumer,
  crmTools,
  eraseGuestCards,
  issueCard,
  joinToken,
  listActivity,
  loyaltySummary,
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
const SECRET = "loyalty-secret-for-tests";

const now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + 1_800_000);
const published: AtriumEvent[] = [];
const deps: CrmDeps = {
  secret: SECRET,
  now: () => now,
  publish: async (event) => {
    published.push(event);
  },
};
const later = new Date(now.getTime() + 60_000);

let clientId = "";
let otherClientId = "";
const owner = (): Scope => ({
  kind: "client",
  userId: `ea-owner-${suffix}`,
  role: "client_owner",
  clientId,
});
const staffAt = (...locationIds: string[]): Scope =>
  ({
    kind: "client",
    userId: `ea-staff-${suffix}`,
    role: "client_staff",
    clientId,
    locationIds,
  }) as Scope;
const otherOwner = (): Scope => ({
  kind: "client",
  userId: `ea-owner2-${suffix}`,
  role: "client_owner",
  clientId: otherClientId,
});
const manager: Scope = { kind: "assigned", userId: `ea-am-${suffix}`, role: "account_manager" };
const admin_: Scope = { kind: "agency", userId: `ea-admin-${suffix}`, role: "agency_admin" };

let ipSeq = 0;
const ipHead = `${Number.parseInt(suffix.slice(0, 2), 16)}.${Number.parseInt(suffix.slice(2, 4), 16)}`;
const nextIp = () => `${ipHead}.${Math.floor(ipSeq / 250) + 100}.${(ipSeq++ % 250) + 1}`;
let seq = 0;
const key = () => `k-${suffix}-${seq++}`;

type Fixture = {
  locationId: string;
  cardId: string;
  token: string;
  code: string;
  programId: string;
};

async function fixture(forClient = clientId, scope: Scope = admin_): Promise<Fixture> {
  const locationId = await withAgency(db, async (tx) => {
    const id = (
      await createLocation(tx, forClient, { name: `EA-${suffix}-${seq++}`, timeZone: "UTC" })
    ).id;
    await tx.execute(sql`update core.locations set status = 'active' where id = ${id}`);
    return id;
  });
  const program = await withScope(db, scope, (tx) =>
    upsertProgram(
      tx,
      scope,
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
    {
      joinToken: joinToken(program, SECRET),
      deviceHash: `dev-${suffix}-${seq++}`,
      ip: nextIp(),
    },
    deps,
  );
  if (!issued.ok) throw new Error(`issue failed: ${issued.reason}`);
  const [row] = await admin.unsafe(
    "select id, program_id from crm.loyalty_cards where location_id = $1",
    [locationId],
  );
  return {
    locationId,
    cardId: row.id,
    programId: row.program_id,
    token: issued.card.token,
    code: issued.card.shortCode,
  };
}

const stamp = (f: Fixture, scope: Scope = owner()) =>
  withScope(db, scope, (tx) =>
    stampCard(
      tx,
      scope,
      { locationId: f.locationId, code: f.code },
      { idempotencyKey: key() },
      deps,
    ),
  );

const emailFor = (label: string) => `${label}-${suffix}@guests.example.com`;
const attach = (token: string, email: string, consent: boolean | null = true) =>
  attachEmail(db, { cardToken: token, email, consent: consent as true }, deps);

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await admin.unsafe("insert into core.users (id, name, email) values ($1, 'Mara Manager', $2)", [
    manager.userId,
    `${manager.userId}@ea.atrium.dev`,
  ]);
  await admin.unsafe("insert into core.users (id, name, email) values ($1, 'Olga Owner', $2)", [
    `ea-owner-${suffix}`,
    `ea-owner-${suffix}@ea.atrium.dev`,
  ]);
  await withAgency(db, async (tx) => {
    const c = await createClientWithOrganization(tx, { name: "EA", slug: `crm-ea-${suffix}` });
    clientId = c.client.id;
    const o = await createClientWithOrganization(tx, { name: "EA2", slug: `crm-ea2-${suffix}` });
    otherClientId = o.client.id;
    await assignClient(tx, manager.userId, clientId, { type: "user", id: admin_.userId });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`crm-ea%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.users where id = $1 or id = $2", [
    manager.userId,
    `ea-owner-${suffix}`,
  ]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("attachEmail", () => {
  test("creates a guest and a marketing consent, links the card, publishes ids only, once", async () => {
    const f = await fixture();
    const email = emailFor("one");
    const before = published.length;
    expect(await attach(f.token, email)).toEqual({ ok: true });

    const [card] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
      f.cardId,
    ]);
    expect(card.guest_id).toBeTruthy();
    const consents = await admin.unsafe(
      "select channel, purpose, granted, source from core.consents where guest_id = $1",
      [card.guest_id],
    );
    expect(consents).toEqual([
      { channel: "email", purpose: "marketing", granted: true, source: "loyalty_card" },
    ]);
    const captured = published.slice(before).filter((e) => e.type === "contact.captured");
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      clientId,
      locationId: f.locationId,
      data: { guestId: card.guest_id, source: "loyalty_card" },
    });
    expect(JSON.stringify(published.slice(before))).not.toContain(email);

    // a second call for the same card (even with another address) changes and publishes nothing
    const again = published.length;
    expect(await attach(f.token, emailFor("two"))).toEqual({ ok: true });
    expect(published.length).toBe(again);
    const [after] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
      f.cardId,
    ]);
    expect(after.guest_id).toBe(card.guest_id);
    expect(
      await admin.unsafe("select 1 from core.guest_identifiers where value = $1", [
        emailFor("two"),
      ]),
    ).toHaveLength(0);
  });

  test("no crm table text column and no event or audit row holds the address", async () => {
    const f = await fixture();
    const email = emailFor("leak");
    expect(await attach(f.token, email)).toEqual({ ok: true });
    await stamp(f);
    const cols = await admin.unsafe(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'crm' and data_type in ('text', 'character varying', 'jsonb', 'json')`,
    );
    for (const c of cols) {
      const rows = await admin.unsafe(
        `select 1 from crm."${c.table_name}" where "${c.column_name}"::text ilike $1`,
        [`%${email}%`],
      );
      expect(rows).toHaveLength(0);
    }
    expect(JSON.stringify(published)).not.toContain(email);
    const audit = await admin.unsafe(
      "select 1 from core.audit_log where input::text ilike $1 or output::text ilike $1",
      [`%${email}%`],
    );
    expect(audit).toHaveLength(0);
  });

  test("without consent: true nothing is created", async () => {
    const f = await fixture();
    const email = emailFor("noconsent");
    expect(await attach(f.token, email, false)).toEqual({ ok: false, reason: "consent_required" });
    expect(await attach(f.token, email, null)).toEqual({
      ok: false,
      reason: "consent_required",
    });
    expect(
      await admin.unsafe("select 1 from core.guest_identifiers where value = $1", [email]),
    ).toHaveLength(0);
    const [card] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
      f.cardId,
    ]);
    expect(card.guest_id).toBeNull();
  });

  test("a bad email is invalid_email and leaves the card alone", async () => {
    const f = await fixture();
    expect(await attach(f.token, "not-an-email")).toEqual({ ok: false, reason: "invalid_email" });
    const [card] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
      f.cardId,
    ]);
    expect(card.guest_id).toBeNull();
  });

  test("an email of another guest answers exactly like an unknown token and changes nothing", async () => {
    const a = await fixture();
    const b = await fixture();
    const email = emailFor("shared");
    expect(await attach(a.token, email)).toEqual({ ok: true });
    const [ga] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
      a.cardId,
    ]);
    const before = published.length;
    const taken = await attach(b.token, email);
    const unknown = await attach("x".repeat(43), emailFor("nobody"));
    expect(taken).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(taken)).toBe(JSON.stringify(unknown));
    expect(published.length).toBe(before);
    const [gb] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
      b.cardId,
    ]);
    expect(gb.guest_id).toBeNull();
    const consents = await admin.unsafe("select 1 from core.consents where guest_id = $1", [
      ga.guest_id,
    ]);
    expect(consents).toHaveLength(1);
  });

  test("unknown, malformed and closed cards are unavailable", async () => {
    const f = await fixture();
    await admin.unsafe("update crm.loyalty_cards set closed_at = now() where id = $1", [f.cardId]);
    expect(await attach(f.token, emailFor("closed"))).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await attach("short", emailFor("short"))).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("erasure", () => {
  test("erasing the guest detaches the card and keeps its stamps", async () => {
    const f = await fixture();
    expect(await attach(f.token, emailFor("erase"))).toEqual({ ok: true });
    await stamp(f);
    const [card] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
      f.cardId,
    ]);
    await withTenant(db, clientId, (tx) => eraseGuest(tx, card.guest_id, deps));
    const erased = published.filter((e) => e.type === "guest.erased").at(-1);
    expect(erased?.data).toMatchObject({ guestId: card.guest_id });
    expect(crmErasureConsumer.event).toBe("guest.erased");
    expect(crmErasureConsumer.name).toBe("crm.erase_guest");

    const n = await withTenant(db, clientId, (tx) => eraseGuestCards(tx, card.guest_id));
    expect(n).toBe(1);
    const [after] = await admin.unsafe("select guest_id from crm.loyalty_cards where id = $1", [
      f.cardId,
    ]);
    expect(after.guest_id).toBeNull();
    const [events] = await admin.unsafe(
      "select count(*)::int as n from crm.loyalty_events where card_id = $1",
      [f.cardId],
    );
    expect(events.n).toBe(1);
    expect(await withTenant(db, clientId, (tx) => eraseGuestCards(tx, card.guest_id))).toBe(0);
  });
});

describe("listActivity", () => {
  const query = (over: Partial<Parameters<typeof listActivity>[2]> = {}) => ({
    range: "7d" as const,
    page: 1,
    pageSize: 25,
    sort: "date" as const,
    dir: "asc" as const,
    now: later,
    ...over,
  });
  const list = (scope: Scope, over: Partial<Parameters<typeof listActivity>[2]> = {}) =>
    withScope(db, scope, (tx) => listActivity(tx, scope, query(over)));

  test("rows by kind and place, ordered, with the void note and the actor name", async () => {
    const f = await fixture();
    await stamp(f);
    await stamp(f);
    await stamp(f); // earns the reward
    await withScope(db, owner(), (tx) =>
      redeemReward(
        tx,
        owner(),
        { locationId: f.locationId, code: f.code },
        { idempotencyKey: key() },
        deps,
      ),
    );
    await stamp(f);
    await withScope(db, owner(), (tx) =>
      voidLastStamp(
        tx,
        owner(),
        { cardId: f.cardId, reason: "wrong card", idempotencyKey: key() },
        deps,
      ),
    );

    const all = await list(owner(), { locationId: f.locationId });
    expect(all.total).toBe(7);
    expect(all.rows.map((r) => r.kind)).toEqual([
      "stamp",
      "stamp",
      "stamp",
      "reward_earned",
      "reward_redeemed",
      "stamp",
      "void",
    ]);
    const row = all.rows[0];
    expect(row?.cardShortCode).toBe(f.code);
    expect(row?.locationId).toBe(f.locationId);
    expect(row?.locationName).toStartWith("EA-");
    expect(row?.actorName).toBe("Olga Owner");
    expect(JSON.stringify(all)).not.toContain(f.token);
    const void_ = all.rows.at(-1) as { kind: string; note?: string | null };
    expect(void_.note).toBe("wrong card");
    expect(all.rows.slice(0, -1).every((r) => (r as { note?: unknown }).note === null)).toBe(true);

    const desc = await list(owner(), { locationId: f.locationId, dir: "desc" });
    expect(desc.rows[0]?.kind).toBe("void");

    const voids = await list(owner(), { locationId: f.locationId, kind: "void" });
    expect(voids.total).toBe(1);
    const earned = await list(owner(), { locationId: f.locationId, kind: "reward_earned" });
    expect(earned.rows).toHaveLength(1);
  });

  test("pages, defaults to 25 and caps the page size at 100", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) await stamp(f);
    const p1 = await list(owner(), { locationId: f.locationId, pageSize: 2, page: 1 });
    const p2 = await list(owner(), { locationId: f.locationId, pageSize: 2, page: 2 });
    const p3 = await list(owner(), { locationId: f.locationId, pageSize: 2, page: 3 });
    expect(p1.total).toBe(6); // 5 stamps + 1 reward_earned
    expect([p1.rows.length, p2.rows.length, p3.rows.length]).toEqual([2, 2, 2]);
    expect(new Set([...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id)).size).toBe(6);
    const big = await list(owner(), { locationId: f.locationId, pageSize: 5000 });
    expect(big.pageSize).toBe(100);
    const none = await list(owner(), { locationId: f.locationId, pageSize: 0 });
    expect(none.pageSize).toBe(25);
  });

  test("hides other clients; an assigned scope sees only its clients; staff only their places", async () => {
    const mine = await fixture();
    const theirs = await fixture(otherClientId);
    await stamp(mine);
    await withScope(db, otherOwner(), (tx) =>
      stampCard(
        tx,
        otherOwner(),
        { locationId: theirs.locationId, code: theirs.code },
        { idempotencyKey: key() },
        deps,
      ),
    );
    const own = await list(owner(), { locationId: theirs.locationId });
    expect(own.total).toBe(0);
    const ownAll = await list(owner(), { pageSize: 100 });
    expect(ownAll.rows.some((r) => r.locationId === theirs.locationId)).toBe(false);

    const am = await list(manager, { pageSize: 100 });
    expect(am.rows.some((r) => r.locationId === mine.locationId)).toBe(true);
    expect(am.rows.some((r) => r.locationId === theirs.locationId)).toBe(false);

    const other = await fixture();
    await stamp(other);
    const scoped = await list(staffAt(mine.locationId), { pageSize: 100 });
    expect(scoped.rows.every((r) => r.locationId === mine.locationId)).toBe(true);
    expect(scoped.rows.length).toBeGreaterThan(0);
  });
});

describe("loyaltySummary", () => {
  const summary = (scope: Scope, locationId: string, range: "7d" | "30d" | "90d" = "7d") =>
    withScope(db, scope, (tx) => loyaltySummary(tx, scope, { range, locationId, now: later }));
  const DAY = 86_400_000;

  async function seedCards(f: Fixture, n: number, at: Date) {
    for (let i = 0; i < n; i++) {
      await admin.unsafe(
        `insert into crm.loyalty_cards (client_id, location_id, program_id, token_hash, short_code, created_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          clientId,
          f.locationId,
          f.programId,
          crypto.randomUUID().replaceAll("-", "").padEnd(64, "a"),
          generateShortCode(),
          at,
        ],
      );
    }
  }

  test("a card issued today counts in 7d; small windows give a null change", async () => {
    const f = await fixture();
    const s = await summary(owner(), f.locationId);
    expect(s.cardsIssued).toEqual({ value: 1, change: null, small: true });
    expect(s.stamps.value).toBe(0);
  });

  test("change is a percent once both windows have 10 or more", async () => {
    const f = await fixture();
    await seedCards(f, 11, new Date(later.getTime() - 3 * DAY)); // current: 12 with the fixture's
    await seedCards(f, 10, new Date(later.getTime() - 10 * DAY)); // previous: 10
    const s = await summary(owner(), f.locationId);
    expect(s.cardsIssued.value).toBe(12);
    expect(s.cardsIssued.small).toBe(false);
    expect(s.cardsIssued.change).toBeCloseTo(20, 5);
    // 30d window holds all 22 and has nothing before: under 10 previous gives null
    const wide = await summary(owner(), f.locationId, "30d");
    expect(wide.cardsIssued.value).toBe(22);
    expect(wide.cardsIssued.change).toBeNull();
  });

  test("stamps net of voids, earned, redeemed and active cards", async () => {
    const f = await fixture();
    await stamp(f);
    await stamp(f);
    await stamp(f);
    await withScope(db, owner(), (tx) =>
      redeemReward(
        tx,
        owner(),
        { locationId: f.locationId, code: f.code },
        { idempotencyKey: key() },
        deps,
      ),
    );
    await stamp(f);
    await withScope(db, owner(), (tx) =>
      voidLastStamp(tx, owner(), { cardId: f.cardId, reason: "oops", idempotencyKey: key() }, deps),
    );
    const s = await summary(owner(), f.locationId);
    expect(s.stamps.value).toBe(3);
    expect(s.rewardsEarned.value).toBe(1);
    expect(s.rewardsRedeemed.value).toBe(1);
    expect(s.activeCards.value).toBe(1);
  });

  test("no data gives zeros and no NaN", async () => {
    const f = await fixture();
    await admin.unsafe("delete from crm.loyalty_cards where id = $1", [f.cardId]);
    const s = await summary(owner(), f.locationId);
    for (const tile of Object.values(s)) {
      expect(tile.value).toBe(0);
      expect(tile.change).toBeNull();
      expect(tile.small).toBe(true);
    }
    expect(JSON.stringify(s)).not.toContain("NaN");
  });

  test("another client's place reads as zeros", async () => {
    const theirs = await fixture(otherClientId);
    const s = await summary(owner(), theirs.locationId);
    expect(s.cardsIssued.value).toBe(0);
  });
});

describe("crm.get_loyalty_card", () => {
  const tool = () => crmTools()[0]!;
  const context = (locationId: string | null = null) => ({
    clientId,
    locationId,
    agentId: "crm.test",
    agentVersion: 1,
    now: later,
  });

  test("is a read-only tool for loyalty:read on the retention feature", () => {
    const t = tool();
    expect(t.name).toBe("crm.get_loyalty_card");
    expect(t.writes).toBe(false);
    expect(t.feature).toBe("retention");
    expect(t.scopes).toEqual(["loyalty:read"]);
  });

  test("returns progress by short code and location, never a guest", async () => {
    const f = await fixture();
    await attach(f.token, emailFor("tool"));
    await stamp(f);
    await stamp(f);
    const out = await withTenant(db, clientId, (tx) =>
      tool().handler({ locationId: f.locationId, shortCode: f.code } as never, context(), tx),
    );
    expect(out).toMatchObject({
      shortCode: f.code,
      locationId: f.locationId,
      stampsInCycle: 2,
      stampsRequired: 3,
      rewardReady: false,
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain("guest");
    expect(text).not.toContain(emailFor("tool"));
    expect(() => tool().output.parse(out)).not.toThrow();
  });

  test("refuses a location outside the scope", async () => {
    const f = await fixture();
    const other = await fixture(otherClientId);
    const call = (tenant: string, ctxLocation: string | null, locationId: string, code: string) =>
      withTenant(db, tenant, (tx) =>
        tool().handler(
          { locationId, shortCode: code } as never,
          { ...context(ctxLocation), clientId: tenant },
          tx,
        ),
      );
    // another client's place
    await expect(call(clientId, null, other.locationId, other.code)).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
    // the task is pinned to a different place of the same client
    const second = await fixture();
    await expect(call(clientId, second.locationId, f.locationId, f.code)).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
    // an unknown code
    await expect(call(clientId, null, f.locationId, "ZZZZ-ZZZZ")).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
  });
});
