import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  assignClient,
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  createSetupLinkCapture,
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
const AGENCY_SLUG = `atrium-oa-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";

const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const setup = createSetupLinkCapture();
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: ORIGIN,
  agencySlug: AGENCY_SLUG,
  trustedOrigins: ["http://localhost:3003"],
  onPasswordSetup: setup.onPasswordSetup,
});
const app = createApp({
  db,
  session: {
    auth,
    agencySlug: AGENCY_SLUG,
    surveySecret: "survey-secret-survey-secret-0001",
    hubUrl: "http://hub.test",
    setup,
    platformUrl: "http://localhost:3003",
  },
});

const cookies: Record<string, string> = {};
let clientId = "";

async function userWith(label: string, orgId: string | null, role?: string) {
  const email = `${label}-${suffix}@oa.test`;
  const { user } = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  if (orgId && role) {
    await auth.api.addMember({ body: { userId: user.id, organizationId: orgId, role } as never });
  }
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
  return user.id;
}

const call = (label: string, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json", cookie: cookies[label] as string },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const publicForm = (ip: string, body: unknown) =>
  app.request("/onboarding/request", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const mine = async (label: string) => (await (await call(label, "GET", "/api/me")).json()) as any;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let clientOrg = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const c = await createClientWithOrganization(tx, { name: "Olivo", slug: `oa-${suffix}` });
    clientId = c.client.id;
    clientOrg = c.organization.id;
  });
  const amId = await userWith("am", agencyOrg, "account_manager");
  await userWith("am-other", agencyOrg, "account_manager");
  await userWith("admin", agencyOrg, "agency_admin");
  await userWith("owner", clientOrg, "client_owner");
  await withAgency(db, (tx) =>
    assignClient(tx, amId, clientId, { type: "user", id: `seed-${suffix}` }),
  );
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(
      sql`delete from core.onboarding_requests where owner_email like ${`%-${suffix}@oa.test`}`,
    );
    await tx.execute(sql`delete from core.clients where slug like ${`%-${suffix}%`}`);
    await tx.execute(sql`delete from core.organizations where slug like ${`%-${suffix}%`}`);
    await tx.execute(sql`delete from core.users where email like ${`%-${suffix}@oa.test`}`);
  });
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or reason like $2", [
    `%${suffix}`,
    `%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

describe("the public form", () => {
  const body = {
    businessName: `Casa Nueva ${suffix}`,
    ownerName: "Ana",
    ownerEmail: `ana-${suffix}@oa.test`,
    firstLocationName: "Centro",
    firstLocationTimeZone: "America/Chicago",
  };

  test("always answers 202 and stores one request", async () => {
    expect((await publicForm("10.1.0.1", body)).status).toBe(202);
    expect((await publicForm("10.1.0.1", body)).status).toBe(202);
    expect((await publicForm("10.1.0.1", "{not json")).status).toBe(202);
    const list = ((await (await call("admin", "GET", "/api/onboarding/requests")).json()) as any)
      .requests;
    expect(list.filter((r: any) => r.ownerEmail === body.ownerEmail)).toHaveLength(1);
  });

  test("is rate limited per address", async () => {
    let last = 0;
    for (let i = 0; i < 7; i++) last = (await publicForm("10.1.0.2", {})).status;
    expect(last).toBe(429);
    expect((await publicForm("10.1.0.3", {})).status).toBe(202);
  });

  test("an account manager approves and the owner can sign in with the link", async () => {
    const list = ((await (await call("am", "GET", "/api/onboarding/requests")).json()) as any)
      .requests;
    const id = list.find((r: any) => r.ownerEmail === body.ownerEmail).id;
    const res = await call("am", "POST", `/api/onboarding/requests/${id}/approve`);
    expect(res.status).toBe(200);
    const out = (await res.json()) as any;
    expect(out.setupUrl).toContain("/reset-password/");
    const token = new URL(out.setupUrl).pathname.split("/").pop() as string;
    await auth.api.resetPassword({ body: { newPassword: "a-long-password-123", token } });
    const again = await call("am", "POST", `/api/onboarding/requests/${id}/approve`);
    expect(again.status).toBe(409);
  });

  test("rejecting needs a reason and a client cannot reach any of it", async () => {
    await publicForm("10.1.0.4", { ...body, ownerEmail: `no-${suffix}@oa.test` });
    const list = ((await (await call("admin", "GET", "/api/onboarding/requests")).json()) as any)
      .requests;
    const id = list.find((r: any) => r.ownerEmail === `no-${suffix}@oa.test`).id;
    expect((await call("admin", "POST", `/api/onboarding/requests/${id}/reject`, {})).status).toBe(
      422,
    );
    expect(
      (await call("admin", "POST", `/api/onboarding/requests/${id}/reject`, { reason: "no" }))
        .status,
    ).toBe(200);
    expect((await call("owner", "GET", "/api/onboarding/requests")).status).toBe(403);
    expect((await call("owner", "POST", `/api/onboarding/requests/${id}/approve`)).status).toBe(
      403,
    );
  });
});

describe("locations", () => {
  let id = "";

  test("an owner asks, cannot decide; the assigned manager decides", async () => {
    const asked = await call("owner", "POST", "/api/locations/request", {
      name: "Patio",
      timeZone: "America/Chicago",
    });
    expect(asked.status).toBe(201);
    id = ((await asked.json()) as any).id;
    expect(
      (await call("owner", "POST", `/api/locations/${id}/decide`, { action: "approve" })).status,
    ).toBe(403);
    expect(
      (await call("am", "POST", `/api/locations/${id}/decide`, { action: "approve" })).status,
    ).toBe(200);
    expect(
      (await call("am", "POST", `/api/locations/${id}/decide`, { action: "approve" })).status,
    ).toBe(409);
  });

  test("bad input is refused", async () => {
    expect(
      (
        await call("owner", "POST", "/api/locations/request", {
          name: "X",
          timeZone: "Nowhere/Land",
        })
      ).status,
    ).toBe(422);
    expect((await call("owner", "POST", "/api/locations/request", {})).status).toBe(422);
    expect(
      (await call("am", "POST", `/api/locations/${id}/decide`, { action: "explode" })).status,
    ).toBe(422);
  });

  test("a manager not assigned to the client gets 404", async () => {
    expect(
      (await call("am-other", "POST", `/api/locations/${id}/decide`, { action: "suspend" })).status,
    ).toBe(404);
  });

  test("the list carries status for the people who can see the place", async () => {
    const rows = ((await (await call("owner", "GET", "/api/locations")).json()) as any).locations;
    expect(rows.find((l: any) => l.id === id)).toMatchObject({ name: "Patio", status: "active" });
  });

  test("/me carries the location capabilities", async () => {
    expect(await mine("owner")).toMatchObject({
      canRequestLocations: true,
      canManageLocations: false,
    });
    expect(await mine("am")).toMatchObject({
      canRequestLocations: false,
      canManageLocations: true,
    });
  });
});

// Last on purpose: it uses up the form's hourly ceiling for this app instance.
describe("the form's ceiling", () => {
  test("changing the forwarded address does not get around the limit", async () => {
    let tooMany = 0;
    for (let i = 0; i < 80; i++) {
      const status = (await publicForm(`172.16.${Math.floor(i / 200)}.${i}`, {})).status;
      if (status === 429) tooMany++;
    }
    expect(tooMany).toBeGreaterThan(0);
  });
});
