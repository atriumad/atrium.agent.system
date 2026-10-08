import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  assignClient,
  assignLocation,
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
const AGENCY_SLUG = `atrium-svadm-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";
const HUB = "http://hub.test";
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
    hubUrl: HUB,
  },
});

const cookies: Record<string, string> = {};
let locA = "";
let locA2 = "";
let locB = "";
let clientA = "";

async function userWith(label: string, orgId: string | null, role?: string, teamRole?: string) {
  const email = `${label}-${suffix}@svadm.test`;
  const { user } = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  if (orgId && role) {
    await auth.api.addMember({
      body: {
        userId: user.id,
        organizationId: orgId,
        role,
        ...(teamRole ? { teamRole } : {}),
      } as never,
    });
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

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let orgA = "";
  let orgB = "";
  let clientB = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const a = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `svadm-a-${suffix}`,
    });
    const b = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `svadm-b-${suffix}`,
    });
    clientA = a.client.id;
    clientB = b.client.id;
    orgA = a.organization.id;
    orgB = b.organization.id;
    locA = (await createLocation(tx, clientA, { name: "Bellaire", timeZone: "America/Chicago" }))
      .id;
    locA2 = (await createLocation(tx, clientA, { name: "Heights", timeZone: "America/Chicago" }))
      .id;
    locB = (await createLocation(tx, clientB, { name: "Norte", timeZone: "America/Chicago" })).id;
  });
  const amId = await userWith("am", agencyOrg, "account_manager", "account_manager");
  await userWith("admin", agencyOrg, "agency_admin");
  await userWith("staff", agencyOrg, "agency_staff");
  await userWith("owner-a", orgA, "client_owner");
  await userWith("owner-b", orgB, "client_owner");
  const mgrId = await userWith("mgr-a", orgA, "client_staff");
  await withAgency(db, async (tx) => {
    await assignClient(tx, amId, clientA, { type: "user", id: `seed-${suffix}` });
    await assignLocation(tx, mgrId, clientA, locA, { type: "user", id: `seed-${suffix}` });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`svadm-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1 or slug like $2", [
    `%-${suffix}`,
    AGENCY_SLUG,
  ]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@svadm.test`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or reason like $2", [
    `%${suffix}`,
    `%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

describe("who can do what", () => {
  test("/me tells each role what it may do with surveys", async () => {
    const mine = async (l: string) => (await (await call(l, "GET", "/api/me")).json()) as any;
    expect(await mine("admin")).toMatchObject({
      canReadSurveys: true,
      canManageSurveys: true,
      canRequestSurveys: false,
    });
    expect(await mine("staff")).toMatchObject({ canReadSurveys: true, canManageSurveys: false });
    expect(await mine("owner-a")).toMatchObject({
      canReadSurveys: true,
      canViewForms: true,
      canOperateSurveys: true,
      canManageSurveys: false,
      canRequestSurveys: true,
    });
    expect(await mine("mgr-a")).toMatchObject({
      canReadSurveys: true,
      canViewForms: false,
      canOperateSurveys: false,
      canRequestSurveys: false,
    });
  });

  test("an owner runs links and delay but not the review link or the QR", async () => {
    expect((await call("owner-a", "GET", "/api/surveys/forms")).status).toBe(200);
    expect((await call("owner-a", "POST", `/api/surveys/forms/${locA}/link`)).status).toBe(200);
    expect(
      (
        await call("owner-a", "PUT", `/api/surveys/forms/${locA}/settings`, {
          requestDelayMinutes: 45,
        })
      ).status,
    ).toBe(200);
    expect((await call("owner-a", "POST", `/api/surveys/forms/${locA}/rotate-qr`)).status).toBe(
      403,
    );
    expect(
      (
        await call("owner-a", "PUT", `/api/surveys/forms/${locA}/settings`, {
          reviewUrl: "https://g.page/r/evil/review",
        })
      ).status,
    ).toBe(403);
  });

  test("an owner sending the review link with the delay is rejected whole", async () => {
    const find = async () =>
      ((await (await call("admin", "GET", "/api/surveys/forms")).json()) as any).forms.find(
        (f: any) => f.locationId === locA,
      );
    const before = await find();
    const res = await call("owner-a", "PUT", `/api/surveys/forms/${locA}/settings`, {
      reviewUrl: "https://g.page/r/evil/review",
      requestDelayMinutes: 999,
    });
    expect(res.status).toBe(403);
    const after = await find();
    expect(after.requestDelayMinutes).toBe(before.requestDelayMinutes);
    expect(after.reviewUrl).toBe(before.reviewUrl);
  });

  test("an owner cannot reach another client's location", async () => {
    expect((await call("owner-a", "POST", `/api/surveys/forms/${locB}/link`)).status).toBe(404);
    const forms = ((await (await call("owner-a", "GET", "/api/surveys/forms")).json()) as any)
      .forms;
    expect(forms.map((f: any) => f.locationId).sort()).toEqual([locA, locA2].sort());
  });

  test("a location manager reads their answers and nothing about forms", async () => {
    expect((await call("mgr-a", "GET", "/api/surveys/forms")).status).toBe(403);
    expect((await call("mgr-a", "GET", "/api/surveys/locations")).status).toBe(403);
    expect((await call("mgr-a", "POST", `/api/surveys/forms/${locA}/link`)).status).toBe(403);
    expect((await call("mgr-a", "GET", "/api/surveys/responses")).status).toBe(200);
  });

  test("a location manager cannot read help requests, which span every location", async () => {
    expect((await call("mgr-a", "GET", "/api/surveys/requests")).status).toBe(403);
  });

  test("a client lists only its own places to ask about", async () => {
    const rows = ((await (await call("owner-a", "GET", "/api/surveys/locations")).json()) as any)
      .locations;
    expect(rows.map((l: any) => l.id).sort()).toEqual([locA, locA2].sort());
  });

  test("agency staff reads but cannot manage", async () => {
    expect((await call("staff", "GET", "/api/surveys/forms")).status).toBe(200);
    expect((await call("staff", "POST", `/api/surveys/forms/${locA}/link`)).status).toBe(403);
    expect(
      (await call("staff", "POST", "/api/surveys/requests", { locationId: locA })).status,
    ).toBe(403);
  });
});

describe("forms", () => {
  test("an account manager sees only the assigned client; an admin sees both", async () => {
    const forms = async (l: string) =>
      ((await (await call(l, "GET", "/api/surveys/forms")).json()) as any).forms as {
        locationId: string;
      }[];
    expect((await forms("am")).map((f) => f.locationId).sort()).toEqual([locA, locA2].sort());
    const all = (await forms("admin")).map((f) => f.locationId);
    expect(all).toContain(locA);
    expect(all).toContain(locB);
  });

  test("a form carries a signed QR link that rotating invalidates", async () => {
    const before = (
      (await (await call("admin", "GET", "/api/surveys/forms")).json()) as any
    ).forms.find((f: any) => f.locationId === locA);
    expect(before.qrUrl.startsWith(`${HUB}/q/qr1.${locA}.1.`)).toBe(true);
    const token = before.qrUrl.slice(`${HUB}/q/`.length);
    expect((await app.request(`/q/${token}/info`)).status).toBe(200);

    const rotated = await call("am", "POST", `/api/surveys/forms/${locA}/rotate-qr`);
    expect(((await rotated.json()) as any).qrVersion).toBe(2);
    expect((await app.request(`/q/${token}/info`)).status).toBe(410);
  });

  test("settings validate the review link", async () => {
    const bad = await call("am", "PUT", `/api/surveys/forms/${locA}/settings`, {
      reviewUrl: "http://x.test",
    });
    expect(bad.status).toBe(422);
    const ok = await call("am", "PUT", `/api/surveys/forms/${locA}/settings`, {
      reviewUrl: "https://g.page/r/abc/review",
      requestDelayMinutes: 30,
    });
    expect(ok.status).toBe(200);
    // An account manager cannot touch a client that is not theirs.
    expect(
      (await call("am", "PUT", `/api/surveys/forms/${locB}/settings`, { requestDelayMinutes: 5 }))
        .status,
    ).toBe(404);
  });

  test("a manual link works once", async () => {
    const made = (await (
      await call("am", "POST", `/api/surveys/forms/${locA}/link`)
    ).json()) as any;
    expect(made.url.startsWith(`${HUB}/s/svy_`)).toBe(true);
    const token = made.url.slice(`${HUB}/s/`.length);
    const first = await app.request(`/s/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, bestPart: "food" }),
    });
    expect(first.status).toBe(200);
    expect((await app.request(`/s/${token}/info`)).status).toBe(410);
  });
});

describe("QR survey and responses", () => {
  test("a QR answer lands in the admin list, once per device", async () => {
    const forms = ((await (await call("admin", "GET", "/api/surveys/forms")).json()) as any).forms;
    const form = forms.find((f: any) => f.locationId === locB);
    const token = form.qrUrl.slice(`${HUB}/q/`.length);
    const submit = (cookie?: string) =>
      app.request(`/q/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ rating: 2, improve: "speed", comment: "Slow" }),
      });
    const first = await submit();
    expect(first.status).toBe(200);
    const cookie = first.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookie).toContain("atr_dev=");
    expect((await submit(cookie)).status).toBe(429);

    const list = (
      (await (await call("admin", "GET", "/api/surveys/responses?maxRating=2")).json()) as any
    ).responses;
    expect(
      list.some((r: any) => r.locationId === locB && r.source === "qr" && r.comment === "Slow"),
    ).toBe(true);
    // The account manager is not assigned to that client.
    const mine = ((await (await call("am", "GET", "/api/surveys/responses")).json()) as any)
      .responses;
    expect(mine.some((r: any) => r.locationId === locB)).toBe(false);
  });

  test("a tampered QR token is unknown", async () => {
    expect((await app.request(`/q/qr1.${locA}.1.forged/info`)).status).toBe(410);
  });
});

describe("requests", () => {
  test("a client owner asks, the agency answers, other clients see nothing", async () => {
    const asked = await call("owner-a", "POST", "/api/surveys/requests", {
      locationId: locA,
      note: "A form for the patio",
    });
    expect(asked.status).toBe(201);
    const id = ((await asked.json()) as any).id as string;

    // A client cannot ask for a location that is not theirs.
    expect(
      (await call("owner-a", "POST", "/api/surveys/requests", { locationId: locB })).status,
    ).toBe(404);

    const rows = async (l: string) =>
      ((await (await call(l, "GET", "/api/surveys/requests")).json()) as any).requests;
    expect((await rows("owner-a")).map((r: any) => r.id)).toEqual([id]);
    expect(await rows("owner-b")).toEqual([]);
    expect((await rows("am"))[0]).toMatchObject({
      id,
      status: "open",
      note: "A form for the patio",
      locationName: "Bellaire",
    });

    // The client cannot close its own request.
    expect(
      (await call("owner-a", "POST", `/api/surveys/requests/${id}/handle`, { to: "fulfilled" }))
        .status,
    ).toBe(403);
    expect(
      (
        await call("am", "POST", `/api/surveys/requests/${id}/handle`, {
          to: "fulfilled",
          response: "Sent the QR",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("am", "POST", `/api/surveys/requests/${id}/handle`, { to: "dismissed" })).status,
    ).toBe(409);
    expect((await rows("owner-a"))[0]).toMatchObject({
      status: "fulfilled",
      response: "Sent the QR",
    });
  });
});
