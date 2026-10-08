import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  setPackage,
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
const AGENCY_SLUG = `atrium-ac-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";
const seed = { type: "user", id: `seed-ac-${suffix}` } as const;

const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: ORIGIN,
  agencySlug: AGENCY_SLUG,
});
const app = createApp({
  db,
  session: { auth, agencySlug: AGENCY_SLUG, surveySecret: "survey-secret-survey-secret-0001" },
});

const cookies: Record<string, string> = {};
let clientId = "";

async function userWith(label: string, orgId: string, role: string) {
  const email = `${label}-${suffix}@ac.test`;
  const { user } = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  await auth.api.addMember({ body: { userId: user.id, organizationId: orgId, role } as never });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  cookies[label] = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
const get = (label: string) =>
  app.request("/api/access", { headers: { cookie: cookies[label] as string } });

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let clientOrg = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const c = await createClientWithOrganization(tx, { name: "Access Co", slug: `ac-${suffix}` });
    clientId = c.client.id;
    clientOrg = c.organization.id;
    await setPackage(tx, clientId, "essential", seed);
  });
  await userWith("owner", clientOrg, "client_owner");
  await userWith("admin", agencyOrg, "agency_admin");
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug = ${`ac-${suffix}`}`);
    await tx.execute(sql`delete from core.organizations where slug like ${`%-${suffix}`}`);
    await tx.execute(sql`delete from core.users where email like ${`%-${suffix}@ac.test`}`);
  });
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("GET /api/access", () => {
  test("a client sees the levels of its package", async () => {
    const body = (await (await get("owner")).json()) as any;
    expect(body.access).toMatchObject({
      reputation: "locked",
      content: "full",
      discoverability: "basic",
    });
  });

  test("a package change shows up", async () => {
    await withAgency(db, (tx) => setPackage(tx, clientId, "pillar_2", seed));
    const body = (await (await get("owner")).json()) as any;
    expect(body.access.reputation).toBe("full");
  });

  test("the agency sees everything open", async () => {
    const body = (await (await get("admin")).json()) as any;
    expect(Object.keys(body.access).length).toBeGreaterThan(5);
    expect(Object.values(body.access).every((level) => level === "full")).toBe(true);
  });

  test("signed out is refused", async () => {
    expect((await app.request("/api/access")).status).toBe(401);
  });
});
