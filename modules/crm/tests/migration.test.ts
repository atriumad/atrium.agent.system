import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  assignClient,
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  type Scope,
  withAgency,
  withAssigned,
  withScope,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);

const hashOf = (s: string) => createHash("sha256").update(s).digest("hex");
const rows = (r: unknown) => r as Record<string, unknown>[];

type Place = { clientId: string; locA: string; locB: string };
let one: Place;
let two: Place;
let cx: Place;
let amId = "";
let codeSeq = 2;
const cards: Record<string, { id: string; hash: string; programId: string }> = {};

// Fails with an error whose text (or cause) matches.
async function fails(p: Promise<unknown>, re: RegExp) {
  try {
    await p;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    expect(`${err.message} ${err.cause?.message ?? ""} ${String(e)}`).toMatch(re);
    return;
  }
  throw new Error("expected the statement to fail");
}

async function seedPlace(
  tx: Parameters<Parameters<typeof withAgency>[1]>[0],
  clientId: string,
  locationId: string,
  tag: string,
) {
  const programId = crypto.randomUUID();
  await tx.execute(sql`insert into crm.loyalty_programs (id, client_id, location_id, name, reward_label)
    values (${programId}, ${clientId}, ${locationId}, ${`P ${tag}`}, 'Free coffee')`);
  const cardId = crypto.randomUUID();
  const hash = hashOf(`token-${tag}-${suffix}`);
  await tx.execute(sql`insert into crm.loyalty_cards (id, client_id, location_id, program_id, token_hash, short_code)
    values (${cardId}, ${clientId}, ${locationId}, ${programId}, ${hash}, ${`AAAAAAA${codeSeq++}`})`);
  await tx.execute(sql`insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key)
    values (${clientId}, ${locationId}, ${cardId}, 'stamp', ${`k-${tag}`})`);
  await tx.execute(sql`insert into crm.loyalty_rewards (client_id, location_id, card_id)
    values (${clientId}, ${locationId}, ${cardId})`);
  cards[tag] = { id: cardId, hash, programId };
}

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (
      await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-crm-${suffix}` })
    ).id;
    for (const [key, name] of [
      ["one", "One"],
      ["two", "Two"],
      ["cx", "Constraints"],
    ] as const) {
      const c = await createClientWithOrganization(tx, { name, slug: `crm-${key}-${suffix}` });
      const clientId = c.client.id;
      const locA = (await createLocation(tx, clientId, { name: "A", timeZone: "America/Chicago" }))
        .id;
      const locB = (await createLocation(tx, clientId, { name: "B", timeZone: "America/Chicago" }))
        .id;
      const place = { clientId, locA, locB };
      if (key === "one") one = place;
      else if (key === "two") two = place;
      else cx = place;
    }
    await seedPlace(tx, one.clientId, one.locA, "1A");
    await seedPlace(tx, one.clientId, one.locB, "1B");
    await seedPlace(tx, two.clientId, two.locA, "2A");
    await seedPlace(tx, cx.clientId, cx.locA, "XA");
  });
  amId = `crm-am-${suffix}`;
  await admin.unsafe("insert into core.users (id, name, email) values ($1, $1, $2)", [
    amId,
    `${amId}@team.test`,
  ]);
  await admin.unsafe(
    "insert into core.members (id, organization_id, user_id, role) values ($1, $2, $3, 'account_manager')",
    [crypto.randomUUID(), agencyOrg, amId],
  );
  await withAgency(db, (tx) => assignClient(tx, amId, one.clientId, { type: "user", id: amId }));
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`crm-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.unsafe("delete from core.users where id like $1", [`crm-%-${suffix}`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

const TENANT_TABLES = ["loyalty_programs", "loyalty_cards", "loyalty_events", "loyalty_rewards"];
const countIn = (tx: Parameters<Parameters<typeof withAgency>[1]>[0], t: string) =>
  tx.execute(sql.raw(`select client_id, location_id from crm.${t}`)).then(rows);

describe("tenancy", () => {
  test("every tenant table is invisible to another client", async () => {
    for (const t of TENANT_TABLES) {
      const mine = await withTenant(db, two.clientId, (tx) => countIn(tx, t));
      expect(mine.length).toBe(1);
      expect(mine.every((r) => r.client_id === two.clientId)).toBe(true);
      const ones = await withTenant(db, one.clientId, (tx) => countIn(tx, t));
      expect(ones.length).toBe(2);
      expect(ones.every((r) => r.client_id === one.clientId)).toBe(true);
    }
  });

  test("client_staff with location A cannot see a card of location B", async () => {
    const scope: Scope = {
      kind: "client",
      userId: "u",
      role: "client_staff",
      clientId: one.clientId,
      locationIds: [one.locA],
    };
    for (const t of TENANT_TABLES) {
      const r = await withScope(db, scope, (tx) => countIn(tx, t));
      expect(r.map((x) => x.location_id)).toEqual([one.locA]);
    }
    const none = await withTenant(db, one.clientId, (tx) => countIn(tx, "loyalty_cards"), {
      locationIds: [],
    });
    expect(none).toEqual([]);
  });

  test("the agency sees both clients", async () => {
    const r = await withAgency(db, (tx) => countIn(tx, "loyalty_cards"));
    const mine = r.filter((x) => [one.clientId, two.clientId].includes(x.client_id as string));
    expect(mine.length).toBe(3);
  });

  test("an assigned scope sees only assigned clients", async () => {
    for (const t of TENANT_TABLES) {
      const r = await withAssigned(db, amId, (tx) => countIn(tx, t));
      expect(r.length).toBe(2);
      expect(r.every((x) => x.client_id === one.clientId)).toBe(true);
    }
  });

  test("a client cannot insert a row for another client", async () => {
    await fails(
      withTenant(db, two.clientId, (tx) =>
        tx.execute(sql`insert into crm.loyalty_programs (client_id, location_id, name, reward_label)
          values (${one.clientId}, ${one.locB}, 'x', 'y')`),
      ),
      /row-level security|violates/i,
    );
  });
});

describe("security-definer lookups", () => {
  const lookup = (hash: string) =>
    withAgency(db, async (tx) =>
      rows(await tx.execute(sql`select * from crm.card_scope(${hash})`)),
    );

  test("card_scope finds an exact hash", async () => {
    const c = cards["1A"] as { id: string; hash: string; programId: string };
    const r = await withTenant(db, two.clientId, async (tx) =>
      rows(await tx.execute(sql`select * from crm.card_scope(${c.hash})`)),
    );
    expect(r).toEqual([
      { card_id: c.id, client_id: one.clientId, location_id: one.locA, program_id: c.programId },
    ]);
  });

  test("card_scope returns nothing for a prefix, an empty string or a made-up hash", async () => {
    const c = cards["1A"] as { hash: string };
    expect(await lookup(c.hash.slice(0, 63))).toEqual([]);
    expect(await lookup(c.hash.slice(0, 8))).toEqual([]);
    expect(await lookup("")).toEqual([]);
    expect(await lookup("%")).toEqual([]);
    expect(await lookup(hashOf("nobody"))).toEqual([]);
  });

  test("program_scope returns the program's client", async () => {
    const c = cards["1B"] as { programId: string };
    const r = await withTenant(db, two.clientId, async (tx) =>
      rows(await tx.execute(sql`select * from crm.program_scope(${c.programId})`)),
    );
    expect(r).toEqual([
      { client_id: one.clientId, location_id: one.locB, active: true, join_qr_version: 1 },
    ]);
    const none = await withAgency(db, async (tx) =>
      rows(await tx.execute(sql`select * from crm.program_scope(${crypto.randomUUID()})`)),
    );
    expect(none).toEqual([]);
  });

  test("the functions are not executable by public", async () => {
    const r = await admin.unsafe(
      `select p.proname, has_function_privilege('public', p.oid, 'execute') as pub,
              has_function_privilege('atrium_app', p.oid, 'execute') as app
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'crm' order by 1`,
    );
    expect(r.map((x: { proname: string }) => x.proname)).toEqual([
      "card_scope",
      "hit_rate",
      "program_scope",
    ]);
    for (const x of r) {
      expect(x.pub).toBe(false);
      expect(x.app).toBe(true);
    }
  });
});

describe("rate counters", () => {
  const hit = (key: string, win: Date, lim: number) =>
    withAgency(db, async (tx) => {
      const r = rows(await tx.execute(sql`select crm.hit_rate(${key}, ${win}, ${lim}) as ok`));
      return (r[0] as { ok: boolean }).ok;
    });

  test("true up to the limit, false after, and a new window starts again", async () => {
    const key = `k-${suffix}`;
    const w1 = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    expect(await hit(key, w1, 2)).toBe(true);
    expect(await hit(key, w1, 2)).toBe(true);
    expect(await hit(key, w1, 2)).toBe(false);
    expect(await hit(key, w1, 2)).toBe(false);
    expect(await hit(key, new Date(w1.getTime() + 3_600_000), 2)).toBe(true);
  });

  test("bad input raises", async () => {
    const w = new Date();
    await fails(hit("", w, 5), /rate key/i);
    await fails(hit("x".repeat(201), w, 5), /rate key/i);
    await fails(hit("k", w, 0), /limit/i);
    await fails(hit("k", w, 100001), /limit/i);
    await fails(hit("k", new Date(Date.now() + 2 * 86_400_000), 5), /window/i);
    await fails(hit("k", new Date(Date.now() - 2 * 86_400_000), 5), /window/i);
  });

  test("atrium_app cannot read or write the counters directly", async () => {
    await fails(
      withAgency(db, (tx) => tx.execute(sql`select * from crm.rate_counters`)),
      /permission denied/i,
    );
    await fails(
      withAgency(db, (tx) =>
        tx.execute(
          sql`insert into crm.rate_counters (key, window_start, count) values ('a', now(), 1)`,
        ),
      ),
      /permission denied/i,
    );
    await fails(
      withAgency(db, (tx) => tx.execute(sql`delete from crm.rate_counters`)),
      /permission denied/i,
    );
  });
});

describe("constraints", () => {
  const insertProgram = (stamps: number, cooldown: number, accent = "lime") =>
    withAgency(db, (tx) =>
      tx.execute(sql`insert into crm.loyalty_programs
        (client_id, location_id, name, reward_label, stamps_required, cooldown_minutes, accent)
        values (${cx.clientId}, ${cx.locB}, 'n', 'r', ${stamps}, ${cooldown}, ${accent})`),
    );

  test("program rules are checked", async () => {
    await fails(insertProgram(1, 240), /check/i);
    await fails(insertProgram(21, 240), /check/i);
    await fails(insertProgram(8, 1441), /check/i);
    await fails(insertProgram(8, 240, "pink"), /check/i);
  });

  test("one program per location", async () => {
    // cx.locB is free, so a first insert works; a second one is the duplicate.
    await insertProgram(8, 240);
    await fails(insertProgram(8, 240), /unique|duplicate/i);
  });

  test("a duplicate (card_id, idempotency_key) fails", async () => {
    const c = cards["XA"] as { id: string };
    await fails(
      withAgency(db, (tx) =>
        tx.execute(sql`insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key)
          values (${cx.clientId}, ${cx.locA}, ${c.id}, 'stamp', 'k-XA')`),
      ),
      /unique|duplicate/i,
    );
  });

  test("the event table rejects update and delete", async () => {
    await fails(
      withAgency(db, (tx) => tx.execute(sql`update crm.loyalty_events set note = 'x'`)),
      /permission denied/i,
    );
    await fails(
      withAgency(db, (tx) => tx.execute(sql`delete from crm.loyalty_events`)),
      /permission denied/i,
    );
  });

  test("seq increases, also for two events with the same created_at", async () => {
    const c = cards["XA"] as { id: string };
    const at = new Date("2026-10-19T09:00:00Z");
    const got = await withAgency(db, async (tx) => {
      for (const k of ["s1", "s2", "s3"])
        await tx.execute(sql`insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key, created_at)
          values (${cx.clientId}, ${cx.locA}, ${c.id}, 'stamp', ${k}, ${at})`);
      return rows(
        await tx.execute(sql`select idempotency_key as k, seq::text as seq from crm.loyalty_events
          where card_id = ${c.id} and created_at = ${at} order by created_at, seq`),
      );
    });
    expect(got.map((r) => r.k)).toEqual(["s1", "s2", "s3"]);
    const seqs = got.map((r) => Number(r.seq));
    expect(seqs[0]).toBeLessThan(seqs[1] as number);
    expect(seqs[1]).toBeLessThan(seqs[2] as number);
  });

  test("a redeemed event can only name a reward of its own card", async () => {
    const a1 = cards["1A"] as { id: string };
    const other = Object.entries(cards).find(([tag]) => tag !== "1A")?.[1] as { id: string };
    const [reward] = await admin.unsafe("select id from crm.loyalty_rewards where card_id = $1", [
      other.id,
    ]);
    const [own] = await admin.unsafe(
      "select client_id, location_id from crm.loyalty_cards where id = $1",
      [a1.id],
    );
    await fails(
      admin.unsafe(
        "insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key, reward_id) values ($1, $2, $3, 'reward_redeemed', 'rw-cross', $4)",
        [own.client_id, own.location_id, a1.id, reward.id],
      ),
      /foreign key/i,
    );
  });

  test("a child cannot point at a parent of another client or location", async () => {
    const a1 = cards["1A"] as { id: string; programId: string };
    const x = cards["XA"] as { id: string; programId: string };
    await fails(
      withAgency(db, (tx) =>
        tx.execute(sql`insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key)
          values (${two.clientId}, ${two.locA}, ${a1.id}, 'stamp', 'cross')`),
      ),
      /foreign key/i,
    );
    await fails(
      withAgency(db, (tx) =>
        tx.execute(sql`insert into crm.loyalty_rewards (client_id, location_id, card_id)
          values (${two.clientId}, ${two.locA}, ${a1.id})`),
      ),
      /foreign key/i,
    );
    // same client, other location
    await fails(
      withAgency(db, (tx) =>
        tx.execute(sql`insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key)
          values (${cx.clientId}, ${cx.locB}, ${x.id}, 'stamp', 'cross2')`),
      ),
      /foreign key/i,
    );
    await fails(
      withAgency(db, (tx) =>
        tx.execute(sql`insert into crm.loyalty_cards (client_id, location_id, program_id, token_hash, short_code)
          values (${two.clientId}, ${two.locA}, ${a1.programId}, ${hashOf("cross-card")}, 'AAAAAAAA')`),
      ),
      /foreign key/i,
    );
  });

  test("a void must point at an event of the same card", async () => {
    const x = cards["XA"] as { id: string; programId: string };
    await withAgency(db, async (tx) => {
      const otherCard = crypto.randomUUID();
      await tx.execute(sql`insert into crm.loyalty_cards (id, client_id, location_id, program_id, token_hash, short_code)
        values (${otherCard}, ${cx.clientId}, ${cx.locA}, ${x.programId}, ${hashOf("void-other")}, 'AAAAAAA9')`);
      const [foreign] = rows(
        await tx.execute(sql`insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key)
          values (${cx.clientId}, ${cx.locA}, ${otherCard}, 'stamp', 'v-foreign') returning id`),
      );
      const [own] = rows(
        await tx.execute(
          sql`select id from crm.loyalty_events where card_id = ${x.id} and idempotency_key = 'k-XA'`,
        ),
      );
      const foreignId = (foreign as { id: string }).id;
      const ownId = (own as { id: string }).id;
      await tx.execute(sql`savepoint v`);
      let failed = false;
      try {
        await tx.execute(sql`insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key, voids_id)
          values (${cx.clientId}, ${cx.locA}, ${x.id}, 'void', 'v-bad', ${foreignId})`);
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      await tx.execute(sql`rollback to savepoint v`);
      await tx.execute(sql`insert into crm.loyalty_events (client_id, location_id, card_id, kind, idempotency_key, voids_id)
        values (${cx.clientId}, ${cx.locA}, ${x.id}, 'void', 'v-ok', ${ownId})`);
    });
  });

  test("a bad token hash is rejected", async () => {
    await fails(
      withAgency(db, (tx) =>
        tx.execute(sql`insert into crm.loyalty_cards (client_id, location_id, program_id, token_hash, short_code)
          values (${cx.clientId}, ${cx.locA}, ${(cards["XA"] as { programId: string }).programId}, 'abc', 'AAAAAAA8')`),
      ),
      /check/i,
    );
  });

  test("deleting the location cascades", async () => {
    const id = await withAgency(db, async (tx) => {
      const loc = (
        await createLocation(tx, cx.clientId, { name: "Tmp", timeZone: "America/Chicago" })
      ).id;
      await seedPlace(tx, cx.clientId, loc, "TMP");
      return loc;
    });
    await admin.unsafe("delete from core.locations where id = $1", [id]);
    for (const t of TENANT_TABLES) {
      const r = await admin.unsafe(`select 1 from crm.${t} where location_id = $1`, [id]);
      expect(r.length).toBe(0);
    }
  });
});
