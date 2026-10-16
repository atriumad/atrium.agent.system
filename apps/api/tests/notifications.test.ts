import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  assignClient,
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  sendToUser,
  withAgency,
  withTenant,
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
const AGENCY_SLUG = `atrium-nt-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";

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
const ids: Record<string, string> = {};
let clientId = "";

async function userWith(label: string, orgId: string, role: string) {
  const email = `${label}-${suffix}@nt.test`;
  const { user } = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  ids[label] = user.id;
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
const call = (label: string, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json", cookie: cookies[label] as string },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const list = async (label: string) =>
  (await (await call(label, "GET", "/api/notifications")).json()) as {
    notifications: {
      id: string;
      subject: string;
      readAt: string | null;
      kind: string;
      target: { type: string; id: string } | null;
    }[];
    unread: number;
  };

const placeId = crypto.randomUUID();

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let clientOrg = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const c = await createClientWithOrganization(tx, { name: "Notify Co", slug: `nt-${suffix}` });
    clientId = c.client.id;
    clientOrg = c.organization.id;
  });
  await userWith("owner", clientOrg, "client_owner");
  await userWith("am", agencyOrg, "account_manager");
  await userWith("admin", agencyOrg, "agency_admin");
  await withAgency(db, (tx) =>
    assignClient(tx, ids.am as string, clientId, { type: "user", id: `seed-nt-${suffix}` }),
  );
  // Each one in its own transaction, as in real life, so their timestamps differ.
  for (const [who, subject] of [
    ["owner", "Patio is now active"],
    ["owner", "Heights is now paused"],
    ["am", "A new location is waiting for approval"],
  ] as const) {
    await withTenant(db, clientId, (tx) =>
      sendToUser(tx, {
        clientId,
        userId: ids[who] as string,
        kind: who === "owner" ? "core.location_decided" : "core.location_requested",
        subject,
        body: `${subject}.`,
        ...(who === "am" ? { target: { type: "location" as const, id: placeId } } : {}),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug = ${`nt-${suffix}`}`);
    await tx.execute(sql`delete from core.organizations where slug like ${`%-${suffix}`}`);
    await tx.execute(sql`delete from core.users where email like ${`%-${suffix}@nt.test`}`);
  });
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("notifications", () => {
  test("each person sees only their own, newest first, with the unread count", async () => {
    const owner = await list("owner");
    expect(owner.notifications.map((n) => n.subject)).toEqual([
      "Heights is now paused",
      "Patio is now active",
    ]);
    expect(owner.unread).toBe(2);
    const am = await list("am");
    expect(am.notifications.map((n) => n.subject)).toEqual([
      "A new location is waiting for approval",
    ]);
    expect((await list("admin")).notifications).toEqual([]);
  });

  test("says what each one is about, or nothing for an older one", async () => {
    expect((await list("am")).notifications[0]?.target).toEqual({ type: "location", id: placeId });
    expect((await list("owner")).notifications.map((n) => n.target)).toEqual([null, null]);
  });

  test("marking some as read lowers the count and keeps the rest unread", async () => {
    const first = (await list("owner")).notifications[0] as { id: string };
    const res = await call("owner", "POST", "/api/notifications/read", { ids: [first.id] });
    expect(res.status).toBe(200);
    const after = await list("owner");
    expect(after.unread).toBe(1);
    expect(after.notifications.find((n) => n.id === first.id)?.readAt).toBeTruthy();
  });

  test("nobody can mark someone else's notifications", async () => {
    const theirs = (await list("am")).notifications[0] as { id: string };
    await call("owner", "POST", "/api/notifications/read", { ids: [theirs.id] });
    expect((await list("am")).unread).toBe(1);
  });

  test("mark everything as read", async () => {
    const res = await call("owner", "POST", "/api/notifications/read", { all: true });
    expect(res.status).toBe(200);
    expect((await list("owner")).unread).toBe(0);
  });

  test("bad input is refused and signed out is refused", async () => {
    expect((await call("owner", "POST", "/api/notifications/read", { ids: "x" })).status).toBe(422);
    expect((await call("owner", "POST", "/api/notifications/read", {})).status).toBe(422);
    expect((await app.request("/api/notifications")).status).toBe(401);
  });
});
