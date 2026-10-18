import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  assignClient,
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
const AGENCY_SLUG = `atrium-bnd-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";
const NOW = new Date("2026-10-06T17:00:00Z");
const DAY = 86_400_000;

const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: ORIGIN,
  agencySlug: AGENCY_SLUG,
});
const app = createApp({ db, now: () => NOW, session: { auth, agencySlug: AGENCY_SLUG } });

const email = (label: string) => `${label}-${suffix}@bnd.test`;
const cookies: Record<string, string> = {};

async function userWith(label: string, orgId: string, role: string, teamRole?: string) {
  const { user } = await auth.api.signUpEmail({
    body: { email: email(label), password: PASSWORD, name: label },
  });
  await auth.api.addMember({
    body: {
      userId: user.id,
      organizationId: orgId,
      role,
      ...(teamRole ? { teamRole } : {}),
    } as never,
  });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: email(label), password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  cookies[label] = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return user.id;
}

const get = (label: string | null, path: string) =>
  app.request(path, { headers: label ? { cookie: cookies[label] as string } : {} });

async function seed(client: string, place: string, n: number, comment: string) {
  for (let i = 0; i < n; i++) {
    await admin.unsafe(
      "insert into reputation.survey_responses (client_id, location_id, rating, comment, created_at) values ($1, $2, $3, $4, $5)",
      [client, place, 1 + (i % 5), comment, new Date(NOW.getTime() - (i + 1) * 3_600_000)],
    );
  }
}

async function caseOf(client: string, place: string, openedAt: Date, comment: string) {
  const id = crypto.randomUUID();
  await admin.unsafe(
    `insert into reputation.survey_responses (id, client_id, location_id, rating, created_at, comment)
     values ($1, $2, $3, 1, $4, $5)`,
    [id, client, place, openedAt, comment],
  );
  await admin.unsafe(
    `insert into reputation.recovery_cases (client_id, location_id, response_id, severity, status, opened_at, due_at)
     values ($1, $2, $3, 'high', 'open', $4, $5)`,
    [client, place, id, openedAt, new Date(openedAt.getTime() + DAY)],
  );
}

let clientA = "";
let clientB = "";
let locA = "";
let locB = "";

type RBand = { responses: { value: number }; distribution: number[] };
type CBand = { open: number; overdue: { value: number }; openedPerDay: unknown[] };

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let orgA = "";
  let orgB = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const a = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `bnd-a-${suffix}`,
    });
    const b = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `bnd-b-${suffix}`,
    });
    clientA = a.client.id;
    clientB = b.client.id;
    orgA = a.organization.id;
    orgB = b.organization.id;
    locA = (await createLocation(tx, clientA, { name: "Bellaire", timeZone: "America/Chicago" }))
      .id;
    locB = (await createLocation(tx, clientB, { name: "Norte", timeZone: "America/Chicago" })).id;
  });
  const amId = await userWith("am", agencyOrg, "account_manager", "account_manager");
  await userWith("admin", agencyOrg, "agency_admin");
  await userWith("owner-a", orgA, "client_owner");
  await userWith("owner-b", orgB, "client_owner");
  await withAgency(db, (tx) =>
    assignClient(tx, amId, clientA, { type: "user", id: `seed-${suffix}` }),
  );
  await seed(clientA, locA, 2, "mine");
  await seed(clientB, locB, 3, "theirs");
  // Client A has 1 open case, overdue; client B has 2 open cases.
  await caseOf(clientA, locA, new Date(NOW.getTime() - 3 * DAY), "A case");
  await caseOf(clientB, locB, new Date(NOW.getTime() - 1 * 3_600_000), "B case 1");
  await caseOf(clientB, locB, new Date(NOW.getTime() - 2 * 3_600_000), "B case 2");
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`bnd-%-${suffix}`}`);
  });
  await admin.unsafe("delete from core.organizations where slug like $1 or slug like $2", [
    `%-${suffix}`,
    AGENCY_SLUG,
  ]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@bnd.test`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or reason like $2", [
    `%${suffix}`,
    `%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

describe("band routes", () => {
  test("no session is 401 on both", async () => {
    expect((await get(null, "/api/insights/responses")).status).toBe(401);
    expect((await get(null, "/api/insights/cases")).status).toBe(401);
  });

  test("client A sees only its numbers; B's never leak", async () => {
    const r = (await (await get("owner-a", "/api/insights/responses?range=7d")).json()) as RBand;
    expect(r.responses.value).toBe(3); // 2 answers + the answer of its case
    const c = (await (await get("owner-a", "/api/insights/cases?range=7d")).json()) as CBand;
    expect(c.open).toBe(1);
    expect(c.overdue.value).toBe(1);
    expect(c.openedPerDay).toHaveLength(7);
    const text = JSON.stringify([r, c]);
    expect(text).not.toContain(clientB);
    expect(text).not.toContain(locB);
  });

  test("an assigned account manager sees only the assigned client on the bands and the table", async () => {
    const r = (await (await get("am", "/api/insights/responses?range=7d")).json()) as RBand;
    expect(r.responses.value).toBe(3);
    const c = (await (await get("am", "/api/insights/cases?range=7d")).json()) as CBand;
    expect(c.open).toBe(1);
    const page = (await (await get("am", "/api/surveys/responses?page=1")).json()) as {
      total: number;
      rows: { clientName: string }[];
    };
    expect(page.total).toBe(3);
    expect(page.rows.every((row) => row.clientName === "Casa Olivo")).toBe(true);
    expect(JSON.stringify(page)).not.toContain("Brasa Norte");
  });

  test("the agency admin sees both clients", async () => {
    const r = (await (await get("admin", "/api/insights/responses?range=7d")).json()) as RBand;
    // The shared database holds other tests' clients too: at least both of ours, more than A alone.
    expect(r.responses.value).toBeGreaterThanOrEqual(8);
    const c = (await (await get("admin", "/api/insights/cases?range=7d")).json()) as CBand;
    expect(c.open).toBeGreaterThanOrEqual(3);
    // The assigned manager can narrow to a place of a client they are not assigned: zeros.
    const none = (await (
      await get("am", `/api/insights/responses?range=7d&place=${locB}`)
    ).json()) as RBand;
    expect(none.responses.value).toBe(0);
  });

  test("another client's place gives zeros, never 403", async () => {
    for (const path of ["responses", "cases"]) {
      const res = await get("owner-a", `/api/insights/${path}?place=${locB}`);
      expect(res.status).toBe(200);
    }
    const r = (await (
      await get("owner-a", `/api/insights/responses?place=${locB}`)
    ).json()) as RBand;
    expect(r.responses.value).toBe(0);
    expect(r.distribution).toEqual([0, 0, 0, 0, 0]);
    const c = (await (await get("owner-a", `/api/insights/cases?place=${locB}`)).json()) as CBand;
    expect(c.open).toBe(0);
  });

  test("range=1y is 422 invalid_range and a place that is not a uuid is 422 invalid_id", async () => {
    for (const path of ["responses", "cases"]) {
      const range = await get("owner-a", `/api/insights/${path}?range=1y`);
      expect(range.status).toBe(422);
      expect(await range.json()).toEqual({ error: "invalid_range" });
      const id = await get("owner-a", `/api/insights/${path}?place=nope`);
      expect(id.status).toBe(422);
      expect(await id.json()).toEqual({ error: "invalid_id" });
    }
  });
});
