import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SurveySubmission } from "@atrium/contracts";
import {
  assignClient,
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  unassignClient,
  withAgency,
} from "@atrium/core";
import { submitSurvey } from "@atrium/reputation";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createApp } from "../src/app";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-help-api-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";
const HUB = "http://hub.test";
const NOW = new Date("2026-10-06T17:00:00Z");

let tick = 0;
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: ORIGIN,
  agencySlug: AGENCY_SLUG,
});
const app = createApp({
  db,
  // An advancing clock: messages in one thread need distinct timestamps to have an order.
  now: () => new Date(NOW.getTime() + tick++ * 1000),
  session: {
    auth,
    agencySlug: AGENCY_SLUG,
    surveySecret: "survey-secret-survey-secret-0001",
    hubUrl: HUB,
  },
});

const cookies: Record<string, string> = {};
let locA = "";
let locB = "";
let clientA = "";
let clientB = "";

async function userWith(label: string, orgId: string | null, role?: string, teamRole?: string) {
  const email = `${label}-${suffix}@help-api.test`;
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
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const a = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `help-api-a-${suffix}`,
    });
    const b = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `help-api-b-${suffix}`,
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
  const staffId = await userWith("staff", agencyOrg, "agency_staff");
  await userWith("owner", orgA, "client_owner");
  await userWith("otherOwner", orgB, "client_owner");
  await withAgency(db, async (tx) => {
    await assignClient(tx, amId, clientA, { type: "user", id: `seed-${suffix}` });
    await assignClient(tx, staffId, clientA, { type: "user", id: `seed-${suffix}` });
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`help-api-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1 or slug like $2", [
    `%-${suffix}`,
    AGENCY_SLUG,
  ]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@help-api.test`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or reason like $2", [
    `%${suffix}`,
    `%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

const open = async (note = "x") => {
  const res = await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
};

test("the owner opens a request and the agency replies, in order", async () => {
  const created = await call("owner", "POST", "/api/surveys/requests", {
    locationId: locA,
    note: "Help with my QR",
  });
  expect(created.status).toBe(201);
  const { id } = await created.json();
  const reply = await call("am", "POST", `/api/surveys/requests/${id}/messages`, { body: "On it" });
  expect(reply.status).toBe(201);
  const thread = await (await call("owner", "GET", `/api/surveys/requests/${id}`)).json();
  expect(thread.messages.map((m: any) => [m.side, m.body])).toEqual([
    ["client", "Help with my QR"],
    ["agency", "On it"],
  ]);
  expect(thread.request).toMatchObject({ status: "open", awaiting: "client" });
});

test("validation: an empty note, an http review link and an over-long body are 422", async () => {
  expect(
    (await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: " " })).status,
  ).toBe(422);
  const { id } = await (
    await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "x" })
  ).json();
  expect(
    (
      await call("owner", "POST", `/api/surveys/requests/${id}/messages`, {
        body: "see",
        attachment: { kind: "review", url: "http://insecure.test/r" },
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await call("owner", "POST", `/api/surveys/requests/${id}/messages`, {
        body: "x".repeat(2001),
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await call("owner", "POST", `/api/surveys/requests/${id}/messages`, {
        body: "hi",
        side: "agency",
      })
    ).status,
  ).toBe(422);
});

test("role gates: staff read only, other client sees 404, owner cannot decline", async () => {
  const { id } = await (
    await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "x" })
  ).json();
  expect((await call("staff", "GET", `/api/surveys/requests/${id}`)).status).toBe(200);
  expect(
    (await call("staff", "POST", `/api/surveys/requests/${id}/messages`, { body: "hi" })).status,
  ).toBe(403);
  expect((await call("otherOwner", "GET", `/api/surveys/requests/${id}`)).status).toBe(404);
  expect(
    (await call("otherOwner", "POST", `/api/surveys/requests/${id}/messages`, { body: "hi" }))
      .status,
  ).toBe(404);
  expect(
    (await call("owner", "POST", `/api/surveys/requests/${id}/close`, { to: "dismissed" })).status,
  ).toBe(403);
});

test("closing: solved by the owner, twice is 409, a message reopens, the agency can decline", async () => {
  const { id } = await (
    await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "x" })
  ).json();
  expect(
    (
      await call("owner", "POST", `/api/surveys/requests/${id}/close`, {
        to: "fulfilled",
        message: "Solved",
      })
    ).status,
  ).toBe(200);
  expect(
    (await call("owner", "POST", `/api/surveys/requests/${id}/close`, { to: "fulfilled" })).status,
  ).toBe(409);
  expect(
    (await call("am", "POST", `/api/surveys/requests/${id}/messages`, { body: "One more thing" }))
      .status,
  ).toBe(201);
  expect(
    (await (await call("am", "GET", `/api/surveys/requests/${id}`)).json()).request.status,
  ).toBe("open");
  expect(
    (await call("am", "POST", `/api/surveys/requests/${id}/close`, { to: "dismissed" })).status,
  ).toBe(200);
});

test("a response attachment resolves in the thread; another client's response is 422", async () => {
  const answer = (clientId: string, locationId: string, n: number, extra: object) =>
    submitSurvey(
      db,
      { kind: "qr", clientId, locationId, deviceHash: `dev-helpapi-${suffix}-${n}` },
      SurveySubmission.parse({ rating: 2, comment: "Cold food", ...extra }),
      { now: () => NOW },
    ).then((r) => r.responseId);
  const mine = await answer(clientA, locA, 1, {
    wantsContact: true,
    contactEmail: `secret-${suffix}@guest.test`,
    contactName: "Secret Name",
  });
  const theirs = await answer(clientB, locB, 2, {});

  const created = await call("owner", "POST", "/api/surveys/requests", {
    locationId: locA,
    note: "See this one",
    attachment: { kind: "response", responseId: mine },
  });
  expect(created.status).toBe(201);
  const { id } = await created.json();
  const thread = await (await call("am", "GET", `/api/surveys/requests/${id}`)).json();
  expect(thread.messages[0].attachment.response).toMatchObject({
    id: mine,
    rating: 2,
    comment: "Cold food",
    locationName: "Bellaire",
  });
  expect(JSON.stringify(thread)).not.toContain("secret-");
  expect(JSON.stringify(thread)).not.toContain("Secret Name");

  const bad = await call("owner", "POST", `/api/surveys/requests/${id}/messages`, {
    body: "and this",
    attachment: { kind: "response", responseId: theirs },
  });
  expect(bad.status).toBe(422);
});

test("the old /handle route is gone", async () => {
  const { id } = await (
    await call("owner", "POST", "/api/surveys/requests", { locationId: locA, note: "x" })
  ).json();
  expect(
    (await call("am", "POST", `/api/surveys/requests/${id}/handle`, { to: "fulfilled" })).status,
  ).toBe(404);
});

test("pickable responses are limited to the caller's client", async () => {
  const answer = (clientId: string, locationId: string, n: number, comment: string) =>
    submitSurvey(
      db,
      { kind: "qr", clientId, locationId, deviceHash: `dev-pick-${suffix}-${n}` },
      SurveySubmission.parse({ rating: 3, comment }),
      { now: () => NOW },
    ).then((r) => r.responseId);
  const a = await answer(clientA, locA, 1, `pick-a-${suffix}`);
  const b = await answer(clientB, locB, 2, `pick-b-${suffix}`);
  const ids = async (label: string, query = "") => {
    const res = await call(label, "GET", `/api/surveys/responses/pickable${query}`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { responses: { id: string; locationId: string }[] }).responses;
  };
  const owner = await ids("owner");
  expect(owner.map((r) => r.id)).toContain(a);
  expect(owner.map((r) => r.id)).not.toContain(b);
  const other = await ids("otherOwner");
  expect(other.map((r) => r.id)).toContain(b);
  expect(other.map((r) => r.id)).not.toContain(a);
  expect(owner.find((r) => r.id === a)?.locationId).toBe(locA);

  expect((await ids("owner", `?id=${a}`)).map((r) => r.id)).toEqual([a]);
  expect(await ids("owner", `?id=${b}`)).toEqual([]);

  // An account manager with two clients sees only the request's client when a request is given.
  const am = await admin.unsafe("select id from core.users where email = $1", [
    `am-${suffix}@help-api.test`,
  ]);
  const amId = (am[0] as { id: string }).id;
  const actor = { type: "user", id: `seed-${suffix}` } as const;
  await withAgency(db, (tx) => assignClient(tx, amId, clientB, actor));
  try {
    const requestId = await open();
    const all = (await ids("am")).map((r) => r.id);
    expect(all).toContain(a);
    expect(all).toContain(b);
    const scoped = (await ids("am", `?requestId=${requestId}`)).map((r) => r.id);
    expect(scoped).toContain(a);
    expect(scoped).not.toContain(b);
  } finally {
    await withAgency(db, (tx) => unassignClient(tx, amId, clientB, actor));
  }
});

test("pickable: client staff are forbidden", async () => {
  const email = `cstaff-${suffix}@help-api.test`;
  const { user } = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "cs" } });
  const [org] = await admin.unsafe("select organization_id from core.clients where id = $1", [
    clientA,
  ]);
  await auth.api.addMember({
    body: {
      userId: user.id,
      organizationId: (org as { organization_id: string }).organization_id,
      role: "client_staff",
    } as never,
  });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  cookies.cstaff = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  expect((await call("cstaff", "GET", "/api/surveys/responses/pickable")).status).toBe(403);
});
