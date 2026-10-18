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
import { ownerInsights, RANGE_DAYS } from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
// Noon in Chicago (CDT) and 10:00 in Los Angeles: the same local day for both places.
const NOW = new Date("2026-10-06T17:00:00Z");
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000);

type Fresh = { clientId: string; chicago: string; la: string };
let counter = 0;

async function fresh(): Promise<Fresh> {
  counter++;
  return withAgency(db, async (tx) => {
    const c = await createClientWithOrganization(tx, {
      name: `Insights ${counter}`,
      slug: `in-${counter}-${suffix}`,
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
    invitationId?: string;
    clicked?: boolean;
    sentiment?: string;
    topics?: string[];
    readAt?: Date;
  } = {},
) {
  await admin.unsafe(
    `insert into reputation.survey_responses
       (client_id, location_id, rating, created_at, invitation_id, review_clicked_at, sentiment, topics, read_at,
        concern, safety, read_model)
     values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12)`,
    [
      f.clientId,
      location,
      rating,
      createdAt,
      extra.invitationId ?? null,
      extra.clicked ? createdAt : null,
      extra.sentiment ?? null,
      extra.sentiment ? `{${(extra.topics ?? []).join(",")}}` : null,
      extra.sentiment ? (extra.readAt ?? createdAt) : null,
      extra.sentiment ? "none" : null,
      extra.sentiment ? false : null,
      extra.sentiment ? "test-model" : null,
    ],
  );
}

async function answersOf(
  f: Fresh,
  location: string,
  count: number,
  startDaysAgo: number,
  rating: number,
) {
  for (let i = 0; i < count; i++) await answer(f, location, ago(startDaysAgo + (i % 5)), rating);
}

async function request(f: Fresh, location: string, status: string, sentAt: Date | null) {
  const invitation = crypto.randomUUID();
  const guest = crypto.randomUUID();
  if (sentAt) {
    await admin.unsafe(
      "insert into reputation.survey_invitations (id, client_id, location_id, token_hash, expires_at) values ($1, $2, $3, $4, $5)",
      [
        invitation,
        f.clientId,
        location,
        invitation.replaceAll("-", "").repeat(2),
        new Date(NOW.getTime() + DAY),
      ],
    );
  }
  await admin.unsafe(
    `insert into reputation.review_requests
       (client_id, location_id, guest_id, visit_date, status, send_at, sent_at, invitation_id)
     values ($1, $2, $3, '2026-10-01', $4, $5, $6, $7)`,
    [f.clientId, location, guest, status, sentAt ?? NOW, sentAt, sentAt ? invitation : null],
  );
  return invitation;
}

async function recoveryCase(
  f: Fresh,
  location: string,
  status: string,
  openedAt: Date,
  dueAt: Date,
) {
  const response = crypto.randomUUID();
  await admin.unsafe(
    "insert into reputation.survey_responses (id, client_id, location_id, rating, created_at) values ($1, $2, $3, 1, $4)",
    [response, f.clientId, location, openedAt],
  );
  await admin.unsafe(
    `insert into reputation.recovery_cases
       (client_id, location_id, response_id, severity, status, opened_at, due_at)
     values ($1, $2, $3, 'high', $4, $5, $6)`,
    [f.clientId, location, response, status, openedAt, dueAt],
  );
}

const run = (f: Fresh, input: { range?: "7d" | "30d" | "90d"; locationId?: string } = {}) =>
  withTenant(db, f.clientId, (tx) =>
    ownerInsights(tx, { range: input.range ?? "30d", locationId: input.locationId, now: NOW }),
  );

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-in-${suffix}` });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`in-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("ownerInsights", () => {
  test("twelve answers against eleven: the change is the difference of means", async () => {
    const f = await fresh();
    await answersOf(f, f.chicago, 12, 2, 4);
    await answersOf(f, f.chicago, 11, 35, 3);
    const r = await run(f);
    expect(r.rating.value).toBe(4);
    expect(r.rating.change).toBe(1);
    expect(r.rating.small).toBe(false);
    expect(r.rating.n).toBe(12);
    expect(r.series).toHaveLength(RANGE_DAYS["30d"]);
    expect(r.responses.value).toBe(12);
  });

  test("nine answers is a small sample: no change, nothing unsafe to serialise", async () => {
    const f = await fresh();
    await answersOf(f, f.chicago, 9, 2, 5);
    const r = await run(f);
    expect(r.rating.small).toBe(true);
    expect(r.rating.change).toBeNull();
    const json = JSON.stringify(r);
    expect(json).not.toContain("NaN");
    for (const s of r.series) expect(typeof s.count).toBe("number");
  });

  test("no answers: every field is present and empty", async () => {
    const f = await fresh();
    const r = await run(f);
    expect(r.rating.value).toBeNull();
    expect(r.rating.change).toBeNull();
    expect(r.topics).toEqual([]);
    expect(r.read).toBe(0);
    expect(r.waiting).toEqual({ open: 0, overdue: 0 });
    expect(r.responses.answerRate).toBeNull();
    expect(r.reviewClicks.rate).toBeNull();
    expect(r.host).toEqual({ requestsSent: 0, casesOpened: 0, answersRead: 0 });
    expect(r.places).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain("NaN");
  });

  test("a place filter narrows answers and places", async () => {
    const f = await fresh();
    await answersOf(f, f.chicago, 3, 2, 5);
    await answersOf(f, f.la, 4, 2, 1);
    const r = await run(f, { locationId: f.chicago });
    expect(r.rating.n).toBe(3);
    expect(r.places).toHaveLength(1);
    expect(r.places[0]?.locationId).toBe(f.chicago);
  });

  test("answer rate counts only sent requests whose invitation an answer used", async () => {
    const f = await fresh();
    const used: string[] = [];
    for (let i = 0; i < 4; i++) used.push(await request(f, f.chicago, "sent", ago(3)));
    await request(f, f.chicago, "scheduled", null);
    await request(f, f.chicago, "skipped", null);
    await answer(f, f.chicago, ago(2), 5, { invitationId: used[0] as string });
    await answer(f, f.chicago, ago(2), 4, { invitationId: used[1] as string });
    const r = await run(f);
    expect(r.responses.sent).toBe(4);
    expect(r.responses.answerRate).toBe(0.5);
    expect(r.host.requestsSent).toBe(4);
  });

  test("review clicks: three of twelve answers", async () => {
    const f = await fresh();
    for (let i = 0; i < 12; i++) await answer(f, f.chicago, ago(2), 5, { clicked: i < 3 });
    const r = await run(f);
    expect(r.reviewClicks).toMatchObject({ clicks: 3, answers: 12, rate: 0.25, small: false });
  });

  test("waiting counts open cases and the overdue among them", async () => {
    const f = await fresh();
    await recoveryCase(f, f.chicago, "open", ago(2), ago(1));
    await recoveryCase(f, f.chicago, "open", ago(0, 1), new Date(NOW.getTime() + 3 * 3_600_000));
    await recoveryCase(f, f.chicago, "contacted", ago(2), ago(1));
    const r = await run(f);
    expect(r.waiting).toEqual({ open: 2, overdue: 1 });
    expect(r.host.casesOpened).toBe(3);
  });

  test("answers read in the window are counted; topics and read skip unread answers", async () => {
    const f = await fresh();
    await answer(f, f.chicago, ago(2), 5, {
      sentiment: "positive",
      topics: ["service"],
      readAt: ago(1),
    });
    await answer(f, f.chicago, ago(2), 2, {
      sentiment: "mixed",
      topics: ["service", "wait"],
      readAt: ago(1),
    });
    await answer(f, f.chicago, ago(2), 3);
    const r = await run(f);
    expect(r.host.answersRead).toBe(2);
    expect(r.read).toBe(2);
    expect(r.topics[0]).toEqual({
      topic: "service",
      total: 2,
      positive: 1,
      neutral: 1,
      negative: 0,
    });
  });

  test("places sort overdue first, then lowest rating; a small place has no rating", async () => {
    const f = await fresh();
    await answersOf(f, f.chicago, 12, 2, 5);
    await answersOf(f, f.la, 3, 2, 1);
    let r = await run(f);
    expect(r.places.map((p) => p.name)).toEqual(["Chicago", "Los Angeles"]);
    const la = r.places.find((p) => p.name === "Los Angeles");
    expect(la?.rating).toBeNull();
    expect(la?.change).toBeNull();
    await recoveryCase(f, f.chicago, "open", ago(3), ago(2));
    r = await run(f);
    expect(r.places[0]?.name).toBe("Chicago");
    expect(r.places[0]?.overdueCases).toBe(1);
  });
});
