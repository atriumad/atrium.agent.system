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
import { casesBand, responsesBand } from "../index";

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

type Fresh = { clientId: string; place: string };
let counter = 0;

async function fresh(): Promise<Fresh> {
  counter++;
  return withAgency(db, async (tx) => {
    const c = await createClientWithOrganization(tx, {
      name: `Bands ${counter}`,
      slug: `bd-${counter}-${suffix}`,
    });
    const place = await createLocation(tx, c.client.id, {
      name: "Chicago",
      timeZone: "America/Chicago",
    });
    return { clientId: c.client.id, place: place.id };
  });
}

async function answer(
  f: Fresh,
  createdAt: Date,
  rating: number,
  extra: { sentiment?: string; clicked?: boolean } = {},
) {
  const id = crypto.randomUUID();
  await admin.unsafe(
    `insert into reputation.survey_responses
       (id, client_id, location_id, rating, created_at, review_clicked_at, sentiment, topics, read_at, concern, safety, read_model)
     values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12)`,
    [
      id,
      f.clientId,
      f.place,
      rating,
      createdAt,
      extra.clicked ? createdAt : null,
      extra.sentiment ?? null,
      extra.sentiment ? "{}" : null,
      extra.sentiment ? createdAt : null,
      extra.sentiment ? "none" : null,
      extra.sentiment ? false : null,
      extra.sentiment ? "test-model" : null,
    ],
  );
  return id;
}

async function theCase(
  f: Fresh,
  openedAt: Date,
  o: {
    status?: "open" | "contacted" | "resolved";
    severity?: "high" | "medium" | "low";
    due?: Date;
    contactedAt?: Date;
    resolvedAt?: Date;
  } = {},
) {
  const responseId = await answer(f, openedAt, 1);
  const status = o.status ?? "open";
  await admin.unsafe(
    `insert into reputation.recovery_cases
       (client_id, location_id, response_id, severity, status, opened_at, due_at, contacted_at, resolved_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      f.clientId,
      f.place,
      responseId,
      o.severity ?? "high",
      status,
      openedAt,
      o.due ?? new Date(openedAt.getTime() + DAY),
      o.contactedAt ?? null,
      o.resolvedAt ?? null,
    ],
  );
}

const responses = (f: Fresh, range: "7d" | "30d" | "90d" = "30d", locationId?: string) =>
  withTenant(db, f.clientId, (tx) =>
    responsesBand(tx, { range, now: NOW, ...(locationId ? { locationId } : {}) }),
  );
const cases = (f: Fresh, range: "7d" | "30d" | "90d" = "30d") =>
  withTenant(db, f.clientId, (tx) => casesBand(tx, { range, now: NOW }));

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-bd-${suffix}` });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`bd-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("responsesBand", () => {
  test("12 read (3 negative) and 8 unread: share 0.25, rating over all 20", async () => {
    const f = await fresh();
    for (let i = 0; i < 9; i++) await answer(f, ago(1 + (i % 3)), 5, { sentiment: "positive" });
    for (let i = 0; i < 3; i++) await answer(f, ago(2), 1, { sentiment: "negative" });
    for (let i = 0; i < 8; i++) await answer(f, ago(3), 3, { clicked: i < 2 });
    const b = await responses(f);
    expect(b.negativeShare.value).toBe(0.25);
    expect(b.negativeShare.read).toBe(12);
    expect(b.negativeShare.small).toBe(false);
    expect(b.responses.value).toBe(20);
    expect(b.rating.n).toBe(20);
    expect(b.rating.value).toBeCloseTo((9 * 5 + 3 * 1 + 8 * 3) / 20, 6);
    expect(b.distribution).toEqual([3, 0, 8, 0, 9]);
    expect(b.distribution.reduce((a, c) => a + c, 0)).toBe(20);
    expect(b.reviewClicks).toMatchObject({ clicks: 2, answers: 20 });
    expect(b.window.to).toBe("2026-10-06");
  });

  test("fewer than 10 read: small, change null", async () => {
    const f = await fresh();
    for (let i = 0; i < 5; i++) await answer(f, ago(1), 4, { sentiment: "negative" });
    const b = await responses(f);
    expect(b.negativeShare.small).toBe(true);
    expect(b.negativeShare.change).toBeNull();
    expect(b.negativeShare.read).toBe(5);
  });

  test("negative share change is in percentage points when both windows have 10 read", async () => {
    const f = await fresh();
    for (let i = 0; i < 10; i++)
      await answer(f, ago(1), 3, { sentiment: i < 5 ? "negative" : "positive" });
    for (let i = 0; i < 10; i++)
      await answer(f, ago(40), 3, { sentiment: i < 2 ? "negative" : "positive" });
    const b = await responses(f, "30d");
    expect(b.negativeShare.value).toBe(0.5);
    expect(b.negativeShare.change).toBeCloseTo(30, 6);
  });

  test("answers after now are left out", async () => {
    const f = await fresh();
    await answer(f, new Date(NOW.getTime() + HOUR), 5);
    await answer(f, ago(1), 5);
    expect((await responses(f)).responses.value).toBe(1);
  });

  test("zero data gives zeros and nulls, no NaN", async () => {
    const f = await fresh();
    const b = await responses(f);
    expect(b.responses.value).toBe(0);
    expect(b.rating.value).toBeNull();
    expect(b.negativeShare).toEqual({ value: null, change: null, read: 0, small: true });
    expect(b.reviewClicks.rate).toBeNull();
    expect(b.distribution).toEqual([0, 0, 0, 0, 0]);
    const text = JSON.stringify(b);
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("Infinity");
  });

  test("a place of another client gives zeros", async () => {
    const f = await fresh();
    const other = await fresh();
    await answer(other, ago(1), 5);
    const b = await responses(f, "30d", other.place);
    expect(b.responses.value).toBe(0);
    expect(b.distribution).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("casesBand", () => {
  test("3 open (1 overdue): open 3, overdue 1, equal to the Active tab", async () => {
    const f = await fresh();
    await theCase(f, ago(3), { due: ago(1) });
    await theCase(f, ago(1));
    await theCase(f, ago(0, 2));
    const b = await cases(f);
    expect(b.open).toBe(3);
    expect(b.overdue.value).toBe(1);
  });

  test("open counts contacted cases too (the Active tab), overdue only the open ones", async () => {
    const f = await fresh();
    await theCase(f, ago(60), { status: "contacted", due: ago(50), contactedAt: ago(55) });
    await theCase(f, ago(2), { due: ago(1) });
    await theCase(f, ago(2), { status: "resolved", resolvedAt: ago(1), contactedAt: ago(1, 5) });
    const b = await cases(f);
    expect(b.open).toBe(2);
    expect(b.overdue.value).toBe(1);
    expect(b.resolved.value).toBe(1);
  });

  test("openedPerDay has one entry per day of the range; bySeverity sums to the window", async () => {
    const f = await fresh();
    await theCase(f, ago(1), { severity: "high" });
    await theCase(f, ago(1), { severity: "medium" });
    await theCase(f, ago(2), { severity: "low" });
    await theCase(f, ago(20), { severity: "low", status: "resolved", resolvedAt: ago(19) });
    await theCase(f, ago(40), { severity: "high", status: "resolved", resolvedAt: ago(39) });
    for (const range of ["7d", "30d", "90d"] as const) {
      const b = await cases(f, range);
      expect(b.openedPerDay).toHaveLength(Number.parseInt(range));
    }
    const b = await cases(f, "30d");
    expect(b.openedPerDay.reduce((a, d) => a + d.count, 0)).toBe(4);
    expect(b.bySeverity).toEqual({ high: 1, medium: 1, low: 2 });
    expect(b.window.to).toBe("2026-10-06");
  });

  test("contact: median of contacted minus opened, share inside target", async () => {
    const f = await fresh();
    for (let i = 0; i < 10; i++) {
      const opened = ago(2 + (i % 3));
      // 6 contacted in 2h or 4h (inside), 2 contacted late, 2 never contacted and overdue.
      if (i < 6) {
        await theCase(f, opened, {
          status: "contacted",
          contactedAt: new Date(opened.getTime() + (i % 2 === 0 ? 2 : 4) * HOUR),
        });
      } else if (i < 8) {
        await theCase(f, opened, {
          status: "contacted",
          contactedAt: new Date(opened.getTime() + 30 * HOUR),
        });
      } else {
        await theCase(f, opened, { due: ago(1) });
      }
    }
    const b = await cases(f);
    expect(b.contact.cases).toBe(10);
    expect(b.contact.small).toBe(false);
    // Contacted after 2h x3, 4h x3 and 30h x2: the middle pair is 4h and 4h.
    expect(b.contact.medianHours).toBe(4);
    expect(b.contact.insideTarget).toBeCloseTo(0.6, 6);
    expect(b.contact.change).toBeNull();
  });

  test("cases after now are left out and zero data has no NaN", async () => {
    const f = await fresh();
    await theCase(f, new Date(NOW.getTime() + HOUR));
    const b = await cases(f);
    expect(b.open).toBe(0);
    expect(b.contact).toMatchObject({ medianHours: null, insideTarget: null, cases: 0 });
    expect(b.resolved).toEqual({ value: 0, change: null, small: true });
    expect(b.bySeverity).toEqual({ high: 0, medium: 0, low: 0 });
    const text = JSON.stringify(b);
    expect(text).not.toContain("NaN");
    expect(text).not.toContain("Infinity");
  });
});
