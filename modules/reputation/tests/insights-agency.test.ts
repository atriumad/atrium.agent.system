import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  assignClient,
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  withAgency,
  withScope,
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

async function answerWith(f: Fresh, location: string, createdAt: Date, invitationId: string) {
  await admin.unsafe(
    "insert into reputation.survey_responses (client_id, location_id, rating, created_at, invitation_id) values ($1, $2, 5, $3, $4)",
    [f.clientId, location, createdAt, invitationId],
  );
}

async function request(f: Fresh, location: string, status: string, sentAt: Date | null) {
  const invitation = crypto.randomUUID();
  if (sentAt) {
    await admin.unsafe(
      "insert into reputation.survey_invitations (id, client_id, location_id, token_hash, expires_at) values ($1, $2, $3, $4, $5)",
      [invitation, f.clientId, location, invitation.replaceAll("-", "").repeat(2), ahead(24)],
    );
  }
  await admin.unsafe(
    `insert into reputation.review_requests
       (client_id, location_id, guest_id, visit_date, status, send_at, sent_at, invitation_id)
     values ($1, $2, $3, '2026-10-01', $4, $5, $6, $7)`,
    [
      f.clientId,
      location,
      crypto.randomUUID(),
      status,
      sentAt ?? NOW,
      sentAt,
      sentAt ? invitation : null,
    ],
  );
  return invitation;
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
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@example.test`]);
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
    // An account manager assigned to only these two clients: RLS hides every other row.
    const userId = `am-${crypto.randomUUID()}`;
    await admin.unsafe("insert into core.users (id, name, email) values ($1, $1, $2)", [
      userId,
      `${userId}-${suffix}@example.test`,
    ]);
    await withAgency(db, async (tx) => {
      await assignClient(tx, userId, one.clientId, { type: "user", id: userId });
      await assignClient(tx, userId, two.clientId, { type: "user", id: userId });
    });
    const r = await withScope(db, { kind: "assigned", userId, role: "account_manager" }, (tx) =>
      agencyInsights(tx, { range: "30d", now: NOW }),
    );
    expect(r.clients).toHaveLength(2);
    expect(r.portfolio.n).toBe(40);
    expect(r.portfolio.value).toBeCloseTo(4.75, 10);
    expect(r.portfolio.value).not.toBeCloseTo(4.5, 5);
  });

  test("answer rate counts sent requests whose invitation an answer used", async () => {
    const { one } = await pair();
    const used: string[] = [];
    for (let i = 0; i < 4; i++) used.push(await request(one, one.a, "sent", ago(3)));
    await request(one, one.a, "scheduled", null);
    await answerWith(one, one.a, ago(2), used[0] as string);
    await answerWith(one, one.a, ago(2), used[1] as string);
    const r = await run({ clientId: one.clientId });
    expect(r.answerRate).toMatchObject({ value: 0.5, sent: 4, answered: 2, small: true });
    expect(r.clients[0]?.answerRate).toBe(0.5);
  });

  test("contact change stays null when either window has fewer than ten cases", async () => {
    const { one, two } = await pair();
    for (let i = 0; i < 10; i++) {
      await recoveryCase(one, one.a, "contacted", ago(2), ago(1), ago(2, -3));
      await recoveryCase(two, two.a, "contacted", ago(2), ago(1), ago(2, -3));
    }
    for (let i = 0; i < 9; i++)
      await recoveryCase(one, one.a, "contacted", ago(35), ago(34), ago(35, -1));
    for (let i = 0; i < 10; i++)
      await recoveryCase(two, two.a, "contacted", ago(35), ago(34), ago(35, -1));
    const fewPrevious = await run({ clientId: one.clientId });
    expect(fewPrevious.contact).toMatchObject({ cases: 10, small: false, medianHours: 3 });
    expect(fewPrevious.contact.change).toBeNull();
    const enough = await run({ clientId: two.clientId });
    expect(enough.contact.change).toBe(2);
    const fewCurrent = await run({ clientId: one.clientId, range: "7d" });
    expect(fewCurrent.contact.change).toBeNull();
  });

  test("the cases list holds at most fifty", async () => {
    const { one } = await pair();
    await admin.unsafe(
      `with r as (
         insert into reputation.survey_responses (client_id, location_id, rating, created_at)
         select $1::uuid, $2::uuid, 1, $3::timestamptz from generate_series(1, 51) returning id
       )
       insert into reputation.recovery_cases
         (client_id, location_id, response_id, severity, status, opened_at, due_at)
       select $1::uuid, $2::uuid, id, 'high', 'open', $3::timestamptz, $4::timestamptz from r`,
      [one.clientId, one.a, ago(2), ago(1)],
    );
    const r = await run({ clientId: one.clientId });
    expect(r.overdue.value).toBe(51);
    expect(r.cases).toHaveLength(50);
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
