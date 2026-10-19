import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  withAgency,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createApp } from "../src/app";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-rt-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";
const NOW = new Date("2026-10-06T17:00:00Z");

const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: ORIGIN,
  agencySlug: AGENCY_SLUG,
});
const app = createApp({
  db,
  now: () => NOW,
  session: {
    auth,
    agencySlug: AGENCY_SLUG,
    surveySecret: "survey-secret-survey-secret-0001",
    hubUrl: "http://hub.test",
  },
});

const cookies: Record<string, string> = {};
let locA = "";
let locB = "";

async function userWith(label: string, orgId: string, role: string) {
  const email = `${label}-${suffix}@rt.test`;
  const { user } = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  await auth.api.addMember({ body: { userId: user.id, organizationId: orgId, role } as never });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  cookies[label] = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

const get = (label: string | null, path: string) =>
  app.request(`/api/surveys/responses${path}`, {
    headers: label ? { cookie: cookies[label] as string } : {},
  });

async function seed(clientId: string, locationId: string, n: number, comment: string) {
  for (let i = 0; i < n; i++) {
    await admin.unsafe(
      "insert into reputation.survey_responses (client_id, location_id, rating, comment, created_at) values ($1, $2, $3, $4, $5)",
      [clientId, locationId, 1 + (i % 5), comment, new Date(NOW.getTime() - (i + 1) * 3_600_000)],
    );
  }
}

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let orgA = "";
  let orgB = "";
  let clientA = "";
  let clientB = "";
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG });
    const a = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `rt-a-${suffix}`,
    });
    const b = await createClientWithOrganization(tx, {
      name: "Zebra Distintivo Norte",
      slug: `rt-b-${suffix}`,
    });
    clientA = a.client.id;
    clientB = b.client.id;
    orgA = a.organization.id;
    orgB = b.organization.id;
    locA = (await createLocation(tx, clientA, { name: "Bellaire", timeZone: "America/Chicago" }))
      .id;
    locB = (await createLocation(tx, clientB, { name: "Norte", timeZone: "America/Chicago" })).id;
  });
  await userWith("owner-a", orgA, "client_owner");
  await userWith("owner-b", orgB, "client_owner");
  await seed(clientA, locA, 120, "mine");
  await seed(clientB, locB, 3, "theirs");
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`rt-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1 or slug like $2", [
    `%-${suffix}`,
    AGENCY_SLUG,
  ]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@rt.test`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or reason like $2", [
    `%${suffix}`,
    `%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

describe("GET /api/surveys/responses (table)", () => {
  test("an owner never sees another client's rows", async () => {
    const res = await get("owner-a", "?page=1");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("Zebra Distintivo");
    expect(text).not.toContain("theirs");
    const body = JSON.parse(text);
    expect(body.total).toBe(120);
    expect(body.rows).toHaveLength(25);
    expect(typeof body.rows[0].createdAt).toBe("string");
  });

  test("pageSize above 100 is clamped to 100", async () => {
    const body = (await (await get("owner-a", "?page=1&pageSize=1000")).json()) as any;
    expect(body.pageSize).toBe(100);
    expect(body.rows).toHaveLength(100);
  });

  test("bad numbers, sort, range, place and enums are 422", async () => {
    for (const q of [
      "pageSize=0",
      "page=0",
      "page=abc",
      "pageSize=-1",
      "pageSize=x",
      "sort=evil",
      "dir=sideways",
      "rating=6",
      "sentiment=angry",
      "sentiment=neutral",
      "topic=nope",
    ]) {
      const res = await get("owner-a", `?page=1&${q}`.replace("page=1&page=", "page="));
      expect(res.status).toBe(422);
      expect(((await res.json()) as any).error).toBe("invalid_query");
    }
    const range = await get("owner-a", "?page=1&range=1y");
    expect(range.status).toBe(422);
    expect(((await range.json()) as any).error).toBe("invalid_range");
    const place = await get("owner-a", "?page=1&place=not-a-uuid");
    expect(place.status).toBe(422);
    expect(((await place.json()) as any).error).toBe("invalid_id");
  });

  test("sentiment=mixed returns only the mixed answers, and a real topic is accepted", async () => {
    const clientId = (
      await admin.unsafe("select client_id from reputation.survey_responses where location_id = $1 limit 1", [
        locA,
      ])
    )[0]?.client_id as string;
    const read = (sentiment: string) =>
      admin.unsafe(
        `insert into reputation.survey_responses
           (client_id, location_id, rating, created_at, sentiment, topics, read_at, concern, safety, read_model)
         values ($1, $2, 3, $3, $4, '{}', $3, 'none', false, 'test-model')`,
        [clientId, locA, new Date(NOW.getTime() - 90_000), sentiment],
      );
    await read("mixed");
    await read("positive");
    const res = await get("owner-a", "?page=1&sentiment=mixed");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.total).toBe(1);
    expect(body.rows.map((r: any) => r.sentiment)).toEqual(["mixed"]);
    const topic = await get("owner-a", "?page=1&topic=price");
    expect(topic.status).toBe(200);
    expect(((await topic.json()) as any).total).toBe(0);
  });

  test("without page the legacy shape stays", async () => {
    const body = (await (await get("owner-a", "")).json()) as any;
    expect(Array.isArray(body.responses)).toBe(true);
    expect(body.rows).toBeUndefined();
  });

  test("a place of another client is empty, not forbidden", async () => {
    const res = await get("owner-a", `?page=1&place=${locB}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  });

  test("a hostile q is inert", async () => {
    const res = await get("owner-a", `?page=1&q=${encodeURIComponent("'; drop table x; --")}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).total).toBe(0);
  });

  test("unauthenticated is 401", async () => {
    expect((await get(null, "?page=1")).status).toBe(401);
  });
});
