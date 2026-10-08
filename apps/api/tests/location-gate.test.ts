import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  withAgency,
} from "@atrium/core";
import { generateInvitationToken, hashInvitationToken, signQrToken } from "@atrium/reputation";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createApp } from "../src/app";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-gate-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";
const SECRET = "survey-secret-survey-secret-0001";

const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: ORIGIN,
  agencySlug: AGENCY_SLUG,
});
const app = createApp({
  db,
  session: { auth, agencySlug: AGENCY_SLUG, surveySecret: SECRET, hubUrl: "http://hub.test" },
});

let cookie = "";
let clientId = "";
const loc: Record<"active" | "pending" | "suspended", string> = {
  active: "",
  pending: "",
  suspended: "",
};

const call = (method: string, path: string) =>
  app.request(path, { method, headers: { "content-type": "application/json", cookie } });
const post = (path: string) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rating: 5 }),
  });

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    clientId = (await createClientWithOrganization(tx, { name: "Gate Co", slug: `gate-${suffix}` }))
      .client.id;
    for (const key of ["active", "pending", "suspended"] as const) {
      loc[key] = (
        await createLocation(tx, clientId, { name: key, timeZone: "America/Chicago" })
      ).id;
    }
    await tx.execute(sql`update core.locations set status = 'pending' where id = ${loc.pending}`);
    await tx.execute(
      sql`update core.locations set status = 'suspended' where id = ${loc.suspended}`,
    );
  });
  const email = `admin-${suffix}@gate.test`;
  const { user } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "Admin" },
  });
  await auth.api.addMember({
    body: { userId: user.id, organizationId: agencyOrg, role: "agency_admin" } as never,
  });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug = ${`gate-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1 or slug = $2", [
    `%-${suffix}`,
    AGENCY_SLUG,
  ]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@gate.test`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

for (const key of ["pending", "suspended"] as const) {
  describe(`a ${key} location`, () => {
    test("its printed QR is dead", async () => {
      const token = signQrToken(SECRET, loc[key], 1);
      expect((await app.request(`/q/${token}/info`)).status).toBe(410);
      expect((await post(`/q/${token}`)).status).toBe(410);
    });

    test("its one-time link is dead", async () => {
      const token = generateInvitationToken();
      await withAgency(db, (tx) =>
        tx.execute(
          sql`insert into reputation.survey_invitations (client_id, location_id, token_hash, channel, expires_at)
              values (${clientId}, ${loc[key]}, ${hashInvitationToken(token)}, 'manual', now() + interval '1 day')`,
        ),
      );
      expect((await app.request(`/s/${token}/info`)).status).toBe(410);
      expect((await post(`/s/${token}`)).status).toBe(410);
    });

    test("its form carries no QR and a manual link is refused", async () => {
      const forms = ((await (await call("GET", "/api/surveys/forms")).json()) as any).forms;
      const form = forms.find((f: any) => f.locationId === loc[key]);
      expect(form.status).toBe(key);
      expect(form.qrUrl).toBeNull();
      expect((await call("POST", `/api/surveys/forms/${loc[key]}/link`)).status).toBe(409);
    });
  });
}

describe("an active location", () => {
  test("still works", async () => {
    const token = signQrToken(SECRET, loc.active, 1);
    expect((await app.request(`/q/${token}/info`)).status).toBe(200);
    expect((await post(`/q/${token}`)).status).toBe(200);
    const forms = ((await (await call("GET", "/api/surveys/forms")).json()) as any).forms;
    expect(forms.find((f: any) => f.locationId === loc.active).qrUrl).toContain("/q/");
    expect((await call("POST", `/api/surveys/forms/${loc.active}/link`)).status).toBe(200);
  });
});
