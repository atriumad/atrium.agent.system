import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  type Scope,
  withAgency,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { listResponsesPage, type ResponseQuery } from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const NOW = new Date("2026-10-06T17:00:00Z");
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000);

type Fresh = { clientId: string; chicago: string; la: string };
let counter = 0;

async function fresh(): Promise<Fresh> {
  counter++;
  return withAgency(db, async (tx) => {
    const c = await createClientWithOrganization(tx, {
      name: `Responses ${counter}`,
      slug: `rl-${counter}-${suffix}`,
    });
    const chicago = await createLocation(tx, c.client.id, {
      name: "Chicago",
      timeZone: "America/Chicago",
    });
    const la = await createLocation(tx, c.client.id, {
      name: "Los Angeles",
      timeZone: "America/Los_Angeles",
    });
    return { clientId: c.client.id, chicago: chicago.id, la: la.id };
  });
}

async function answer(
  f: Fresh,
  location: string,
  createdAt: Date,
  rating: number,
  extra: {
    comment?: string;
    wantsContact?: boolean;
    sentiment?: string;
    topics?: string[];
    safety?: boolean;
    withCase?: boolean;
  } = {},
) {
  const id = crypto.randomUUID();
  await admin.unsafe(
    `insert into reputation.survey_responses
       (id, client_id, location_id, rating, created_at, comment, wants_contact, sentiment, topics,
        read_at, concern, safety, read_model)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13)`,
    [
      id,
      f.clientId,
      location,
      rating,
      createdAt,
      extra.comment ?? null,
      extra.wantsContact ?? false,
      extra.sentiment ?? null,
      extra.sentiment ? `{${(extra.topics ?? []).join(",")}}` : null,
      extra.sentiment ? createdAt : null,
      extra.sentiment ? "none" : null,
      extra.sentiment ? (extra.safety ?? false) : null,
      extra.sentiment ? "test-model" : null,
    ],
  );
  if (extra.withCase) {
    await admin.unsafe(
      `insert into reputation.recovery_cases (client_id, location_id, response_id, severity, status, opened_at, due_at)
       values ($1, $2, $3, 'high', 'open', $4, $5)`,
      [f.clientId, location, id, createdAt, new Date(createdAt.getTime() + DAY)],
    );
  }
  return id;
}

const scope = (f: Fresh): Scope =>
  ({ userId: "u", role: "client_owner", clientId: f.clientId }) as unknown as Scope;

const run = (f: Fresh, input: Partial<ResponseQuery> = {}) =>
  withTenant(db, f.clientId, (tx) =>
    listResponsesPage(tx, scope(f), {
      range: "30d",
      sort: "date",
      dir: "desc",
      page: 1,
      pageSize: 25,
      now: NOW,
      ...input,
    }),
  );

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-rl-${suffix}` });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`rl-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("listResponsesPage", () => {
  test("pages 30 answers across two places in date-desc order", async () => {
    const f = await fresh();
    for (let i = 0; i < 30; i++) {
      await answer(f, i % 2 ? f.chicago : f.la, ago(1, i), 1 + (i % 5));
    }
    const all = await run(f, { pageSize: 100 });
    const p2 = await run(f, { page: 2, pageSize: 10 });
    expect(p2.total).toBe(30);
    expect(p2.rows.map((r) => r.id)).toEqual(all.rows.slice(10, 20).map((r) => r.id));
    expect(all.rows.map((r) => r.createdAt.getTime())).toEqual(
      [...all.rows.map((r) => r.createdAt.getTime())].sort((a, b) => b - a),
    );
    expect(p2.rows[0]?.locationName).toMatch(/Chicago|Los Angeles/);
  });

  test("sort by rating asc, then date", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(1), 5);
    await answer(f, f.chicago, ago(2), 1);
    await answer(f, f.chicago, ago(3), 1);
    const r = await run(f, { sort: "rating", dir: "asc" });
    expect(r.rows.map((x) => x.rating)).toEqual([1, 1, 5]);
    expect(r.rows[0]?.createdAt.getTime()).toBeLessThan(r.rows[1]?.createdAt.getTime() as number);
  });

  test("sort by place orders by place name", async () => {
    const f = await fresh();
    await answer(f, f.la, ago(1), 3);
    await answer(f, f.chicago, ago(2), 3);
    const r = await run(f, { sort: "place", dir: "asc" });
    expect(r.rows.map((x) => x.locationName)).toEqual(["Chicago", "Los Angeles"]);
  });

  test("filters combine with AND", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(1), 2, { wantsContact: true });
    await answer(f, f.chicago, ago(1, 1), 2);
    await answer(f, f.chicago, ago(1, 2), 5, { wantsContact: true });
    const r = await run(f, { maxRating: 3, wantsContact: true });
    expect(r.total).toBe(1);
  });

  test("sentiment and topic match only read answers", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(1), 1, { sentiment: "negative", topics: ["wait"] });
    await answer(f, f.chicago, ago(2), 1);
    await answer(f, f.chicago, ago(3), 4, { sentiment: "positive", topics: ["food", "wait"] });
    expect((await run(f, { sentiment: "negative" })).total).toBe(1);
    expect((await run(f, { topic: "wait" })).total).toBe(2);
    expect((await run(f, { topic: "food", sentiment: "negative" })).total).toBe(0);
  });

  test("q matches literally: % and _ are not wildcards, injection text is inert", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(1), 3, { comment: "Gave us 50% off" });
    await answer(f, f.chicago, ago(2), 3, { comment: "fifty percent" });
    await answer(f, f.chicago, ago(3), 3, { comment: "plain" });
    expect((await run(f, { q: "50%" })).total).toBe(1);
    expect((await run(f, { q: "_" })).total).toBe(0);
    expect((await run(f, { q: "%" })).total).toBe(1);
    expect((await run(f, { q: "'; drop table" })).rows).toEqual([]);
    expect((await run(f, { q: "\\" })).total).toBe(0);
    expect((await run(f, { q: "PLAIN" })).total).toBe(1);
  });

  test("unread counts filtered rows without a reading", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(1), 2);
    await answer(f, f.chicago, ago(2), 2);
    await answer(f, f.chicago, ago(3), 2, { sentiment: "negative" });
    await answer(f, f.chicago, ago(4), 5);
    expect((await run(f)).unread).toBe(3);
    expect((await run(f, { maxRating: 2 })).unread).toBe(2);
  });

  test("counts ignore q and column filters but respect range and place", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(1), 2, { comment: "alpha", wantsContact: true, withCase: true });
    await answer(f, f.chicago, ago(2), 5, {
      sentiment: "positive",
      topics: ["food"],
      safety: true,
    });
    await answer(f, f.la, ago(3), 3);
    await answer(f, f.chicago, ago(20), 1);
    const r = await run(f, { q: "alpha", range: "7d" });
    expect(r.total).toBe(1);
    expect(r.counts).toEqual({ all: 3, lowRating: 2, wantsContact: 1, hasCase: 1, safety: 1 });
    const place = await run(f, { range: "7d", locationId: f.la });
    expect(place.counts.all).toBe(1);
    expect((await run(f, { range: "30d" })).counts.all).toBe(4);
  });

  test("a place outside the scope returns nothing", async () => {
    const f = await fresh();
    const other = await fresh();
    await answer(other, other.chicago, ago(1), 3);
    const r = await run(f, { locationId: other.chicago });
    expect(r.total).toBe(0);
    expect(r.rows).toEqual([]);
  });

  test("a page beyond the last is empty with the true total", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(1), 3);
    const r = await run(f, { page: 5 });
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(1);
  });

  test("rows carry the reading and the case", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(1), 1, {
      sentiment: "negative",
      topics: ["wait"],
      safety: true,
      withCase: true,
    });
    const [row] = (await run(f)).rows;
    expect(row).toMatchObject({
      sentiment: "negative",
      topics: ["wait"],
      concern: "none",
      safety: true,
    });
    expect(row?.caseId).not.toBeNull();
  });
});
