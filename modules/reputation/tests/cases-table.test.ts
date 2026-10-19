import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  withAgency,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { listCasesTable } from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const NOW = new Date("2026-10-06T17:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

type Fresh = { clientId: string; place: string };
let counter = 0;

async function fresh(): Promise<Fresh> {
  counter++;
  return withAgency(db, async (tx) => {
    const c = await createClientWithOrganization(tx, {
      name: `Cases table ${counter}`,
      slug: `ct-${counter}-${suffix}`,
    });
    const place = await createLocation(tx, c.client.id, {
      name: "Chicago",
      timeZone: "America/Chicago",
    });
    return { clientId: c.client.id, place: place.id };
  });
}

/** One answer and its case. A `sentiment` means the answer was read. */
async function caseOf(
  f: Fresh,
  openedAt: Date,
  status: "open" | "contacted" | "resolved",
  extra: { comment?: string; sentiment?: string; topics?: string[]; safety?: boolean } = {},
) {
  const responseId = crypto.randomUUID();
  await admin.unsafe(
    `insert into reputation.survey_responses
       (id, client_id, location_id, rating, created_at, comment, sentiment, topics, read_at, concern, safety, read_model)
     values ($1, $2, $3, 1, $4, $5, $6, $7::text[], $8, $9, $10, $11)`,
    [
      responseId,
      f.clientId,
      f.place,
      openedAt,
      extra.comment ?? null,
      extra.sentiment ?? null,
      extra.sentiment ? `{${(extra.topics ?? []).join(",")}}` : null,
      extra.sentiment ? openedAt : null,
      extra.sentiment ? "none" : null,
      extra.sentiment ? (extra.safety ?? false) : null,
      extra.sentiment ? "test-model" : null,
    ],
  );
  const [row] = await admin.unsafe(
    `insert into reputation.recovery_cases (client_id, location_id, response_id, severity, status, opened_at, due_at, resolved_at)
     values ($1, $2, $3, 'high', $4, $5, $6, case when $4 = 'resolved' then $5::timestamptz end) returning id`,
    [f.clientId, f.place, responseId, status, openedAt, new Date(openedAt.getTime() + DAY)],
  );
  return row.id as string;
}

const run = (f: Fresh, range: "7d" | "30d" | "90d" = "30d") =>
  withTenant(db, f.clientId, (tx) => listCasesTable(tx, { range, now: NOW }));

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-ct-${suffix}` });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`ct-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("listCasesTable by place", () => {
  async function secondPlace(f: Fresh) {
    return withAgency(
      db,
      async (tx) =>
        (await createLocation(tx, f.clientId, { name: "Dallas", timeZone: "America/Chicago" })).id,
    );
  }
  const bulk = (f: Fresh, place: string, n: number) =>
    admin.unsafe(
      `with r as (
         insert into reputation.survey_responses (id, client_id, location_id, rating, created_at)
         select gen_random_uuid(), $1::uuid, $2::uuid, 1, $3::timestamptz - (g || ' minutes')::interval
         from generate_series(1, $4::int) g returning id, created_at)
       insert into reputation.recovery_cases (client_id, location_id, response_id, severity, status, opened_at, due_at)
       select $1::uuid, $2::uuid, id, 'high', 'open', created_at, created_at + interval '1 day' from r`,
      [f.clientId, place, ago(1), n],
    );

  test("a place narrows rows and counts together", async () => {
    const f = await fresh();
    const b = await secondPlace(f);
    const inA = await caseOf(f, ago(1), "open");
    await caseOf({ ...f, place: b }, ago(1), "resolved");
    const t = await withTenant(db, f.clientId, (tx) =>
      listCasesTable(tx, { range: "30d", now: NOW, locationId: f.place }),
    );
    expect(t.cases.map((c) => c.id)).toEqual([inA]);
    expect(t.counts).toEqual({ active: 1, open: 1, contacted: 0, resolved: 0, all: 1 });
  });

  test("the 200 cap applies per place", async () => {
    const f = await fresh();
    const b = await secondPlace(f);
    await bulk(f, f.place, 205);
    await bulk(f, b, 3);
    const t = await withTenant(db, f.clientId, (tx) =>
      listCasesTable(tx, { range: "30d", now: NOW, locationId: b }),
    );
    expect(t.cases).toHaveLength(3);
    expect(t.truncated).toBe(false);
    expect(t.counts.all).toBe(3);
  });
});

describe("listCasesTable", () => {
  test("205 open cases: 200 rows, truncated, counts over all 205", async () => {
    const f = await fresh();
    await admin.unsafe(
      `with r as (
         insert into reputation.survey_responses (id, client_id, location_id, rating, created_at)
         select gen_random_uuid(), $1::uuid, $2::uuid, 1, $3::timestamptz - (g || ' minutes')::interval
         from generate_series(1, 205) g returning id, created_at)
       insert into reputation.recovery_cases (client_id, location_id, response_id, severity, status, opened_at, due_at)
       select $1::uuid, $2::uuid, id, 'high', 'open', created_at, created_at + interval '1 day' from r`,
      [f.clientId, f.place, ago(1)],
    );
    const t = await run(f);
    expect(t.cases).toHaveLength(200);
    expect(t.truncated).toBe(true);
    expect(t.counts.all).toBe(205);
    expect(t.counts.active).toBe(205);
    expect(t.counts.open).toBe(205);
    const times = t.cases.map((c) => c.openedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test("the cap cuts old resolved cases, never an old active one", async () => {
    const f = await fresh();
    await admin.unsafe(
      `with r as (
         insert into reputation.survey_responses (id, client_id, location_id, rating, created_at)
         select gen_random_uuid(), $1::uuid, $2::uuid, 1, $3::timestamptz - (g || ' minutes')::interval
         from generate_series(1, 201) g returning id, created_at)
       insert into reputation.recovery_cases (client_id, location_id, response_id, severity, status, opened_at, due_at, resolved_at)
       select $1::uuid, $2::uuid, id, 'high', 'resolved', created_at, created_at + interval '1 day', created_at from r`,
      [f.clientId, f.place, ago(1)],
    );
    const oldOpen = await caseOf(f, ago(25), "open");
    const t = await run(f);
    expect(t.truncated).toBe(true);
    expect(t.cases).toHaveLength(200);
    expect(t.cases.map((c) => c.id)).toContain(oldOpen);
    expect(t.cases[0]?.id).toBe(oldOpen);
  });

  test("exactly 200 is not truncated", async () => {
    const f = await fresh();
    await admin.unsafe(
      `with r as (
         insert into reputation.survey_responses (id, client_id, location_id, rating, created_at)
         select gen_random_uuid(), $1::uuid, $2::uuid, 1, $3::timestamptz from generate_series(1, 200) returning id, created_at)
       insert into reputation.recovery_cases (client_id, location_id, response_id, severity, status, opened_at, due_at)
       select $1::uuid, $2::uuid, id, 'high', 'open', created_at, created_at + interval '1 day' from r`,
      [f.clientId, f.place, ago(1)],
    );
    const t = await run(f);
    expect(t.cases).toHaveLength(200);
    expect(t.truncated).toBe(false);
  });

  test("a resolved case older than the window is absent; an old contacted one is present", async () => {
    const f = await fresh();
    const oldResolved = await caseOf(f, ago(60), "resolved");
    const oldContacted = await caseOf(f, ago(60), "contacted");
    const recent = await caseOf(f, ago(2), "resolved");
    const t = await run(f);
    const ids = t.cases.map((c) => c.id);
    expect(ids).not.toContain(oldResolved);
    expect(ids).toContain(oldContacted);
    expect(ids).toContain(recent);
    expect(t.counts).toEqual({ active: 1, open: 0, contacted: 1, resolved: 1, all: 2 });
  });

  test("a case opened after now is not in the window", async () => {
    const f = await fresh();
    await caseOf(f, new Date(NOW.getTime() + DAY), "open");
    const t = await run(f);
    expect(t.cases).toHaveLength(0);
    expect(t.counts.all).toBe(0);
  });

  test("rows carry the comment cut hard at 160, topics, sentiment, safety; nulls when unread", async () => {
    const f = await fresh();
    const long = "x".repeat(200);
    const read = await caseOf(f, ago(1), "open", {
      comment: long,
      sentiment: "negative",
      topics: ["service", "food"],
      safety: true,
    });
    const unread = await caseOf(f, ago(2), "open", { comment: "short" });
    const t = await run(f);
    const a = t.cases.find((c) => c.id === read);
    const b = t.cases.find((c) => c.id === unread);
    expect(a?.comment).toBe("x".repeat(160));
    expect(a?.topics).toEqual(["service", "food"]);
    expect(a?.sentiment).toBe("negative");
    expect(a?.safety).toBe(true);
    expect(a).toMatchObject({ status: "open", severity: "high", rating: 1 });
    expect(a?.dueAt).toBeInstanceOf(Date);
    expect(b).toMatchObject({ comment: "short", topics: null, sentiment: null, safety: null });
  });

  test("a case with no comment has a null comment", async () => {
    const f = await fresh();
    const id = await caseOf(f, ago(1), "open");
    const t = await run(f);
    expect(t.cases.find((c) => c.id === id)?.comment).toBeNull();
  });
});
