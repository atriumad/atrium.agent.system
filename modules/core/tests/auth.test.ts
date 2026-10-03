import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  resolveScope,
  withAgency,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-${suffix}`;
const PASSWORD = "correct-horse-battery";

const { db, close } = createDatabase(APP_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: "http://localhost:3000",
  agencySlug: AGENCY_SLUG,
});

async function signUp(label: string) {
  const res = await auth.api.signUpEmail({
    body: { email: `${label}-${suffix}@test.atrium.dev`, password: PASSWORD, name: label },
  });
  return res.user.id;
}

let agencyOrgId: string;
let clientA: { id: string; orgId: string };
let clientB: { id: string; orgId: string };
let admin: string;
let am: string;
let ownerA: string;
let staffA: string;
let ownerB: string;
let outsider: string;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  admin = await signUp("admin");
  am = await signUp("am");
  ownerA = await signUp("owner-a");
  staffA = await signUp("staff-a");
  ownerB = await signUp("owner-b");
  outsider = await signUp("outsider");

  await withAgency(db, async (tx) => {
    agencyOrgId = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const a = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `olivo-${suffix}`,
    });
    const b = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `brasa-${suffix}`,
    });
    clientA = { id: a.client.id, orgId: a.organization.id };
    clientB = { id: b.client.id, orgId: b.organization.id };
  });

  const add = (userId: string, organizationId: string, role: string, teamRole?: string) =>
    auth.api.addMember({
      body: { userId, organizationId, role, ...(teamRole ? { teamRole } : {}) } as never,
    });
  await add(admin, agencyOrgId, "agency_admin");
  await add(am, agencyOrgId, "account_manager", "account_manager");
  await add(ownerA, clientA.orgId, "client_owner");
  await add(staffA, clientA.orgId, "client_staff");
  await add(ownerB, clientB.orgId, "client_owner");
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`%-${suffix}`}`);
    await tx.execute(sql`delete from core.organizations where slug like ${`%-${suffix}`}`);
    await tx.execute(sql`delete from core.users where email like ${`%-${suffix}@test.atrium.dev`}`);
  });
  await close();
});

describe("resolveScope", () => {
  test("an agency admin in the agency org gets portfolio scope", async () => {
    const scope = await resolveScope(
      db,
      { userId: admin, activeOrganizationId: agencyOrgId },
      AGENCY_SLUG,
    );
    expect(scope).toEqual({ kind: "agency", userId: admin, role: "agency_admin" });
  });

  test("a client owner gets scope for exactly their client", async () => {
    const scope = await resolveScope(
      db,
      { userId: ownerA, activeOrganizationId: clientA.orgId },
      AGENCY_SLUG,
    );
    expect(scope).toEqual({
      kind: "client",
      userId: ownerA,
      role: "client_owner",
      clientId: clientA.id,
    });
  });

  test("a client owner cannot claim another client's org", async () => {
    const scope = await resolveScope(
      db,
      { userId: ownerA, activeOrganizationId: clientB.orgId },
      AGENCY_SLUG,
    );
    expect(scope).toBeNull();
  });

  test("a client user cannot claim the agency org", async () => {
    const scope = await resolveScope(
      db,
      { userId: ownerA, activeOrganizationId: agencyOrgId },
      AGENCY_SLUG,
    );
    expect(scope).toBeNull();
  });

  test("a user with no membership gets nothing", async () => {
    for (const org of [agencyOrgId, clientA.orgId]) {
      expect(
        await resolveScope(db, { userId: outsider, activeOrganizationId: org }, AGENCY_SLUG),
      ).toBeNull();
    }
  });

  test("no active organization means no scope", async () => {
    expect(
      await resolveScope(db, { userId: admin, activeOrganizationId: null }, AGENCY_SLUG),
    ).toBeNull();
  });
});

describe("membership rules", () => {
  test("a client role cannot be added to the agency org", async () => {
    const attempt = auth.api.addMember({
      body: { userId: outsider, organizationId: agencyOrgId, role: "client_owner" } as never,
    });
    await expect(attempt).rejects.toThrow("not allowed in organization");
  });

  test("an agency role cannot be added to a client org", async () => {
    const attempt = auth.api.addMember({
      body: { userId: outsider, organizationId: clientA.orgId, role: "agency_admin" } as never,
    });
    await expect(attempt).rejects.toThrow("not allowed in organization");
  });

  test("an unknown team role is rejected", async () => {
    const attempt = auth.api.addMember({
      body: {
        userId: outsider,
        organizationId: agencyOrgId,
        role: "agency_staff",
        teamRole: "wizard",
      } as never,
    });
    await expect(attempt).rejects.toThrow();
  });

  test("the team role is stored on the membership", async () => {
    const rows = await db.execute<{ team_role: string | null }>(
      sql`select team_role from core.members where user_id = ${am}`,
    );
    expect(rows[0]?.team_role).toBe("account_manager");
  });
});

describe("sign in", () => {
  test("a wrong password is rejected", async () => {
    const attempt = auth.api.signInEmail({
      body: { email: `admin-${suffix}@test.atrium.dev`, password: "not-the-password-1" },
    });
    await expect(attempt).rejects.toThrow();
  });

  test("passwords shorter than 12 characters are rejected", async () => {
    const attempt = auth.api.signUpEmail({
      body: { email: `short-${suffix}@test.atrium.dev`, password: "short", name: "short" },
    });
    await expect(attempt).rejects.toThrow();
  });
});
