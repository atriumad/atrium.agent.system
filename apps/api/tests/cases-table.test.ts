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
const AGENCY_SLUG = `atrium-ctab-${suffix}`;
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

const email = (label: string) => `${label}-${suffix}@ctab.test`;
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

async function caseOf(
  client: string,
  place: string,
  openedAt: Date,
  status: string,
  comment: string,
) {
  const id = crypto.randomUUID();
  await admin.unsafe(
    `insert into reputation.survey_responses (id, client_id, location_id, rating, created_at, comment)
     values ($1, $2, $3, 1, $4, $5)`,
    [id, client, place, openedAt, comment],
  );
  await admin.unsafe(
    `insert into reputation.recovery_cases (client_id, location_id, response_id, severity, status, opened_at, due_at, resolved_at)
     values ($1, $2, $3, 'high', $4, $5, $6, case when $4 = 'resolved' then $5::timestamptz end)`,
    [client, place, id, status, openedAt, new Date(openedAt.getTime() + DAY)],
  );
}

type Body = {
  cases: { clientName: string; status: string; comment: string | null; openedAt: string }[];
  counts: Record<string, number>;
  truncated: boolean;
};

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let orgA = "";
  let clientA = "";
  let ids: Record<"a" | "b", string[]> = { a: [], b: [] };
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const a = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `ctab-olivo-${suffix}`,
    });
    const b = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `ctab-brasa-${suffix}`,
    });
    clientA = a.client.id;
    orgA = a.organization.id;
    const locA = await createLocation(tx, a.client.id, {
      name: "Bellaire",
      timeZone: "America/Chicago",
    });
    const locB = await createLocation(tx, b.client.id, {
      name: "Norte",
      timeZone: "America/Chicago",
    });
    ids = { a: [a.client.id, locA.id], b: [b.client.id, locB.id] };
  });
  const [ac, al] = ids.a as [string, string];
  const [bc, bl] = ids.b as [string, string];
  await caseOf(ac, al, new Date(NOW.getTime() - DAY), "open", "A open");
  await caseOf(ac, al, new Date(NOW.getTime() - 2 * DAY), "resolved", "A done");
  await caseOf(ac, al, new Date(NOW.getTime() - 90 * DAY), "resolved", "A ancient");
  await caseOf(bc, bl, new Date(NOW.getTime() - DAY), "open", "B open");
  const amId = await userWith("am", agencyOrg, "account_manager", "account_manager");
  await userWith("owner-a", orgA, "client_owner");
  await withAgency(db, (tx) =>
    assignClient(tx, amId, clientA, { type: "user", id: `seed-${suffix}` }),
  );
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`ctab-%-${suffix}`}`);
  });
  await admin.unsafe("delete from core.organizations where slug like $1 or slug like $2", [
    `%-${suffix}`,
    AGENCY_SLUG,
  ]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@ctab.test`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or reason like $2", [
    `%${suffix}`,
    `%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

describe("GET /api/cases as a table", () => {
  test("no session is 401", async () => {
    expect((await get(null, "/api/cases")).status).toBe(401);
  });

  test("client A sees only its own cases, with comment, counts and truncated", async () => {
    const res = await get("owner-a", "/api/cases");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.cases.map((c) => c.comment).sort()).toEqual(["A done", "A open"]);
    expect(JSON.stringify(body)).not.toContain("Brasa Norte");
    expect(body.counts).toEqual({ active: 1, open: 1, contacted: 0, resolved: 1, all: 2 });
    expect(body.truncated).toBe(false);
    expect(typeof body.cases[0]?.openedAt).toBe("string");
  });

  test("status narrows the rows, not the counts", async () => {
    const body = (await (await get("owner-a", "/api/cases?status=open")).json()) as Body;
    expect(body.cases).toHaveLength(1);
    expect(body.cases[0]?.status).toBe("open");
    expect(body.counts.all).toBe(2);
  });

  test("a wider range brings older resolved cases in and counts them", async () => {
    const body = (await (await get("owner-a", "/api/cases?range=90d")).json()) as Body;
    expect(body.counts.all).toBe(3);
    const narrow = (await (await get("owner-a", "/api/cases?range=7d")).json()) as Body;
    expect(narrow.counts.all).toBe(2);
  });

  test("an unknown range is 422 invalid_range, an unknown status 422 invalid_status", async () => {
    const r = await get("owner-a", "/api/cases?range=1y");
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: "invalid_range" });
    const s = await get("owner-a", "/api/cases?status=bogus");
    expect(s.status).toBe(422);
    expect(await s.json()).toEqual({ error: "invalid_status" });
  });

  test("the account manager sees the assigned client's cases", async () => {
    const body = (await (await get("am", "/api/cases")).json()) as Body;
    expect(body.cases.every((c) => c.clientName === "Casa Olivo")).toBe(true);
    expect(body.counts.all).toBe(2);
  });
});
