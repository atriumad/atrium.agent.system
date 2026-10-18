import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  withAgency,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { agencyInsights } from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const NOW = new Date("2026-10-06T17:00:00Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * HOUR);
const ahead = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

type Fresh = { clientId: string; a: string; b: string };
let counter = 0;

async function pair(): Promise<{ one: Fresh; two: Fresh }> {
  counter++;
  const n = counter;
  return withAgency(db, async (tx) => {
    const c1 = await createClientWithOrganization(tx, {
      name: `Agency A ${n}-${suffix}`,
      slug: `ag-a-${n}-${suffix}`,
    });
    const c2 = await createClientWithOrganization(tx, {
      name: `Agency B ${n}-${suffix}`,
      slug: `ag-b-${n}-${suffix}`,
    });
    const a1 = await createLocation(tx, c1.client.id, { name: "A1", timeZone: "America/Chicago" });
    const a2 = await createLocation(tx, c1.client.id, { name: "A2", timeZone: "America/Chicago" });
    const b1 = await createLocation(tx, c2.client.id, { name: "B1", timeZone: "America/Chicago" });
    return {
      one: { clientId: c1.client.id, a: a1.id, b: a2.id },
      two: { clientId: c2.client.id, a: b1.id, b: b1.id },
    };
  });
}

async function answer(f: Fresh, location: string, createdAt: Date, rating: number) {
  await admin.unsafe(
    "insert into reputation.survey_responses (client_id, location_id, rating, created_at) values ($1, $2, $3, $4)",
    [f.clientId, location, rating, createdAt],
  );
}

async function answersOf(
  f: Fresh,
  location: string,
  count: number,
  daysAgo: number,
  rating: number,
) {
  for (let i = 0; i < count; i++) await answer(f, location, ago(daysAgo + (i % 5)), rating);
}

async function recoveryCase(
  f: Fresh,
  location: string,
  status: string,
  openedAt: Date,
  dueAt: Date,
  contactedAt: Date | null = null,
  comment: string | null = null,
) {
  const response = crypto.randomUUID();
  await admin.unsafe(
    "insert into reputation.survey_responses (id, client_id, location_id, rating, created_at, comment) values ($1, $2, $3, 1, $4, $5)",
    [response, f.clientId, location, openedAt, comment],
  );
  await admin.unsafe(
    `insert into reputation.recovery_cases
       (client_id, location_id, response_id, severity, status, opened_at, due_at, contacted_at, resolved_at)
     values ($1, $2, $3, 'high', $4, $5, $6, $7, $8)`,
    [
      f.clientId,
      location,
      response,
      status,
      openedAt,
      dueAt,
      contactedAt,
      status === "resolved" ? (contactedAt ?? openedAt) : null,
    ],
  );
}

const run = (input: { range?: "7d" | "30d" | "90d"; clientId?: string } = {}) =>
  withAgency(db, (tx) =>
    agencyInsights(tx, { range: input.range ?? "30d", clientId: input.clientId, now: NOW }),
  );

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-ag-${suffix}` });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`ag-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

const mine = (r: Awaited<ReturnType<typeof run>>, ...ids: string[]) =>
  r.clients.filter((c) => ids.includes(c.clientId));

describe("agencyInsights", () => {
  test("the portfolio is the mean over all answers, not the mean of client means", async () => {
    const { one, two } = await pair();
    await answersOf(one, one.a, 10, 2, 4);
    await answersOf(two, two.a, 30, 2, 5);
    const r = await run();
    // Other tests' data share the database: narrow to the two clients through the rows themselves.
    const rows = mine(r, one.clientId, two.clientId);
    expect(rows).toHaveLength(2);
    const sum = rows.reduce((a, c) => a + (c.rating ?? 0) * c.responses, 0);
    expect(sum / 40).toBeCloseTo(4.75, 10);
    expect(rows.find((c) => c.clientId === one.clientId)?.rating).toBe(4);
  });

  test("contact time: median hours and the share inside target", async () => {
    const { one } = await pair();
    await recoveryCase(one, one.a, "contacted", ago(3), ago(3, -4), ago(3, -2)); // 2h, inside
    await recoveryCase(one, one.a, "contacted", ago(3), ago(3, -4), ago(3, -6)); // 6h, outside
    await recoveryCase(one, one.a, "contacted", ago(3), ago(3, -20), ago(3, -10)); // 10h, inside
    await recoveryCase(one, one.a, "open", ago(0, 1), ahead(5)); // before due: not counted outside
    const r = await run({ clientId: one.clientId });
    expect(r.contact.medianHours).toBe(6);
    expect(r.contact.cases).toBe(4);
    expect(r.contact.insideTarget).toBeCloseTo(2 / 3, 10);
    await recoveryCase(one, one.a, "open", ago(2), ago(1)); // past due: outside
    const s = await run({ clientId: one.clientId });
    expect(s.contact.insideTarget).toBeCloseTo(2 / 4, 10);
    expect(s.contact.small).toBe(true);
  });

  test("client rows: small samples, overdue and pending places per client", async () => {
    const { one, two } = await pair();
    // eight answers plus the answer behind the open case make nine
    await answersOf(one, one.a, 8, 2, 5);
    await answersOf(two, two.a, 10, 2, 3);
    await withAgency(db, (tx) =>
      tx.execute(sql`update core.locations set status = 'pending' where id = ${one.b}`),
    );
    await recoveryCase(one, one.a, "open", ago(2), ago(1));
    const r = await run();
    const a = mine(r, one.clientId)[0];
    const b = mine(r, two.clientId)[0];
    expect(a).toMatchObject({
      places: 2,
      rating: null,
      change: null,
      spark: [],
      responses: 9,
      overdue: 1,
      pendingPlaces: 1,
    });
    expect(b?.rating).toBe(3);
    expect(b?.spark.length).toBeGreaterThan(0);
    expect(b?.places).toBe(1);
    expect(b?.pendingPlaces).toBe(0);
    expect(JSON.stringify(r)).not.toContain("NaN");
  });

  test("a client filter narrows clients, cases and tiles", async () => {
    const { one, two } = await pair();
    await answersOf(one, one.a, 3, 2, 5);
    await answersOf(two, two.a, 4, 2, 1);
    await recoveryCase(one, one.a, "open", ago(2), ago(1));
    await recoveryCase(two, two.a, "open", ago(2), ago(1));
    const r = await run({ clientId: one.clientId });
    expect(r.clients.map((c) => c.clientId)).toEqual([one.clientId]);
    expect(r.cases.every((c) => c.clientId === one.clientId)).toBe(true);
    expect(r.cases).toHaveLength(1);
    expect(r.portfolio.n).toBe(4); // 3 answers + the case's own answer
    expect(r.overdue.value).toBe(1);
  });

  test("cases list overdue before due, skip contacted and resolved, summarise the answer", async () => {
    const { one } = await pair();
    await recoveryCase(one, one.a, "open", ago(0, 2), ahead(20), null, "x".repeat(200));
    await recoveryCase(one, one.a, "open", ago(2), ago(1), null, null);
    await recoveryCase(one, one.a, "contacted", ago(2), ago(1), ago(1));
    await recoveryCase(one, one.a, "resolved", ago(2), ago(1), ago(1));
    await recoveryCase(one, one.a, "open", ago(0, 1), ahead(30)); // not due within 24h
    const r = await run({ clientId: one.clientId });
    expect(r.cases.map((c) => c.overdue)).toEqual([true, false]);
    expect(r.cases[0]?.summary).toBe("1-star answer");
    expect(r.cases[1]?.summary).toBe("x".repeat(120));
    expect(r.cases[0]).toMatchObject({
      clientName: expect.stringContaining("Agency A"),
      locationName: "A1",
      severity: "high",
    });
  });

  test("zero data: empty arrays, null values, no NaN", async () => {
    const { one } = await pair();
    const r = await run({ clientId: one.clientId });
    expect(r.cases).toEqual([]);
    expect(r.contact).toMatchObject({ medianHours: null, insideTarget: null, cases: 0 });
    expect(r.contact.change).toBeNull();
    expect(r.portfolio.value).toBeNull();
    expect(r.portfolio.spark).toEqual([]);
    expect(r.answerRate).toMatchObject({ value: null, change: null, sent: 0, answered: 0 });
    expect(r.overdue).toEqual({ value: 0, previous: 0 });
    expect(r.clients[0]).toMatchObject({ rating: null, change: null, spark: [], answerRate: null });
    expect(JSON.stringify(r)).not.toContain("NaN");
  });

  test("exactly ten answers is not small; ten against nine gives no change", async () => {
    const { one, two } = await pair();
    await answersOf(one, one.a, 10, 2, 5);
    await answersOf(one, one.a, 10, 35, 4);
    await answersOf(two, two.a, 10, 2, 5);
    await answersOf(two, two.a, 9, 35, 4);
    const r = await run();
    const a = mine(r, one.clientId)[0];
    const b = mine(r, two.clientId)[0];
    expect(a?.rating).toBe(5);
    expect(a?.change).toBe(1);
    expect(b?.rating).toBe(5);
    expect(b?.change).toBeNull();
  });
});
