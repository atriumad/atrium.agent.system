import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  approveOnboardingRequest,
  createAgencyOrganization,
  createAuth,
  createDatabase,
  createSetupLinkCapture,
  listAssignedClientIds,
  listOnboardingRequests,
  OnboardingForbiddenError,
  OnboardingStateError,
  rejectOnboardingRequest,
  type Scope,
  submitOnboardingRequest,
  withAgency,
  withScope,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-ob-${suffix}`;
const REDIRECT = "http://localhost:3003/set-password";
const { db, close } = createDatabase(APP_URL);

const setup = createSetupLinkCapture();
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: "http://localhost:3000",
  agencySlug: AGENCY_SLUG,
  trustedOrigins: ["http://localhost:3003"],
  onPasswordSetup: setup.onPasswordSetup,
});
// An auth whose delivery of the link fails, to prove approval undoes itself.
const boomSetup = createSetupLinkCapture();
const authBoom = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: "http://localhost:3000",
  agencySlug: AGENCY_SLUG,
  trustedOrigins: ["http://localhost:3003"],
  onPasswordSetup: async () => {
    throw new Error("mail down");
  },
});

const input = (name: string, overrides: Record<string, unknown> = {}) => ({
  businessName: `Biz ${name} ${suffix}`,
  ownerName: `Owner ${name}`,
  ownerEmail: `${name}-${suffix}@ob.atrium.dev`,
  firstLocationName: "Main",
  firstLocationTimeZone: "America/Chicago",
  ...overrides,
});

let adminScope: Scope;
let amScope: Scope;
let ownerScope: Scope;
let amId = "";

const open = async () =>
  withAgency(db, (tx) => listOnboardingRequests(tx, adminScope)).then((rows) =>
    rows.filter((r) => r.status === "open"),
  );
const idOf = async (email: string) =>
  (await open()).find((r) => r.ownerEmail === email)?.id as string;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  const mk = async (label: string) =>
    (
      await auth.api.signUpEmail({
        body: {
          email: `${label}-${suffix}@ob.atrium.dev`,
          password: "correct-horse-battery",
          name: label,
        },
      })
    ).user.id;
  const adminId = await mk("admin");
  amId = await mk("am");
  const ownerId = await mk("someowner");
  const agencyOrg = await withAgency(
    db,
    async (tx) => (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id,
  );
  await auth.api.addMember({
    body: { userId: adminId, organizationId: agencyOrg, role: "agency_admin" } as never,
  });
  await auth.api.addMember({
    body: { userId: amId, organizationId: agencyOrg, role: "account_manager" } as never,
  });
  adminScope = { kind: "agency", userId: adminId, role: "agency_admin" };
  amScope = { kind: "assigned", userId: amId, role: "account_manager" };
  ownerScope = {
    kind: "client",
    userId: ownerId,
    role: "client_owner",
    clientId: crypto.randomUUID(),
  };
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(
      sql`delete from core.onboarding_requests where owner_email like ${`%-${suffix}@ob.atrium.dev`}`,
    );
    await tx.execute(sql`delete from core.clients where slug like ${`%-${suffix}%`}`);
    await tx.execute(sql`delete from core.organizations where slug like ${`%-${suffix}%`}`);
    await tx.execute(sql`delete from core.users where email like ${`%-${suffix}@ob.atrium.dev`}`);
  });
  await close();
});

describe("the public form", () => {
  test("stores one request and ignores a repeat from the same email", async () => {
    await submitOnboardingRequest(db, input("dup"));
    await submitOnboardingRequest(db, input("dup"));
    const rows = (await open()).filter((r) => r.ownerEmail === `dup-${suffix}@ob.atrium.dev`);
    expect(rows).toHaveLength(1);
  });

  test("drops a bad email or time zone without failing", async () => {
    await submitOnboardingRequest(db, input("bad", { ownerEmail: "not-an-email" }));
    await submitOnboardingRequest(db, input("tz", { firstLocationTimeZone: "Nowhere/Land" }));
    const emails = (await open()).map((r) => r.ownerEmail);
    expect(emails).not.toContain("not-an-email");
    expect(emails).not.toContain(`tz-${suffix}@ob.atrium.dev`);
  });
});

describe("approval", () => {
  test("creates client, owner, an active first location, an assignment and a working link", async () => {
    await submitOnboardingRequest(db, input("ok"));
    const email = `ok-${suffix}@ob.atrium.dev`;
    const out = await approveOnboardingRequest(db, amScope, await idOf(email), {
      auth,
      setup,
      redirectTo: REDIRECT,
    });
    expect(out.setupUrl).toContain("/reset-password/");

    const token = new URL(out.setupUrl).pathname.split("/").pop() as string;
    await auth.api.resetPassword({ body: { newPassword: "a-long-password-123", token } });
    const session = await auth.api.signInEmail({
      body: { email, password: "a-long-password-123" },
    });
    expect(session.user.email).toBe(email);

    const locs = await withAgency(db, (tx) =>
      tx.execute<{ status: string }>(
        sql`select status from core.locations where client_id = ${out.clientId}`,
      ),
    );
    expect(locs.map((l) => l.status)).toEqual(["active"]);
    expect(await withAgency(db, (tx) => listAssignedClientIds(tx, amId))).toContain(out.clientId);
    expect((await open()).some((r) => r.ownerEmail === email)).toBe(false);
  });

  test("a failure after the user exists removes it and leaves the request open", async () => {
    await submitOnboardingRequest(db, input("boom"));
    const email = `boom-${suffix}@ob.atrium.dev`;
    const id = await idOf(email);
    await expect(
      approveOnboardingRequest(db, amScope, id, {
        auth: authBoom,
        setup: boomSetup,
        redirectTo: REDIRECT,
      }),
    ).rejects.toThrow();
    expect((await open()).some((r) => r.id === id)).toBe(true);
    const users = await withAgency(db, (tx) =>
      tx.execute(sql`select 1 from core.users where email = ${email}`),
    );
    expect(users).toHaveLength(0);
    const clients = await withAgency(db, (tx) =>
      tx.execute(sql`select 1 from core.clients where slug like ${`biz-boom-${suffix}%`}`),
    );
    expect(clients).toHaveLength(0);
    // And a retry with a working auth succeeds.
    const retry = await approveOnboardingRequest(db, amScope, id, {
      auth,
      setup,
      redirectTo: REDIRECT,
    });
    expect(retry.clientId).toBeTruthy();
  });

  test("an approved request cannot be approved twice", async () => {
    await submitOnboardingRequest(db, input("twice"));
    const id = await idOf(`twice-${suffix}@ob.atrium.dev`);
    await approveOnboardingRequest(db, adminScope, id, { auth, setup, redirectTo: REDIRECT });
    await expect(
      approveOnboardingRequest(db, adminScope, id, { auth, setup, redirectTo: REDIRECT }),
    ).rejects.toBeInstanceOf(OnboardingStateError);
  });
});

describe("an email that already has an account", () => {
  test("is refused with a clear state error, creates nothing and leaves the request open", async () => {
    const email = `taken-${suffix}@ob.atrium.dev`;
    await auth.api.signUpEmail({
      body: { email, password: "correct-horse-battery", name: "Already Here" },
    });
    await submitOnboardingRequest(db, input("taken"));
    const id = await idOf(email);
    await expect(
      approveOnboardingRequest(db, amScope, id, { auth, setup, redirectTo: REDIRECT }),
    ).rejects.toBeInstanceOf(OnboardingStateError);
    expect((await open()).some((r) => r.id === id)).toBe(true);
    const clients = await withAgency(db, (tx) =>
      tx.execute(sql`select 1 from core.clients where slug like ${`biz-taken-${suffix}%`}`),
    );
    expect(clients).toHaveLength(0);
    // the person who already existed is not deleted by the cleanup
    const users = await withAgency(db, (tx) =>
      tx.execute(sql`select 1 from core.users where email = ${email}`),
    );
    expect(users).toHaveLength(1);
  });
});

describe("rejecting and who may decide", () => {
  test("reject records the reason", async () => {
    await submitOnboardingRequest(db, input("no"));
    const id = await idOf(`no-${suffix}@ob.atrium.dev`);
    await rejectOnboardingRequest(db, adminScope, id, "not a restaurant");
    const rows = await withAgency(db, (tx) => listOnboardingRequests(tx, adminScope));
    expect(rows.find((r) => r.id === id)).toMatchObject({
      status: "rejected",
      reason: "not a restaurant",
    });
  });

  test("a client cannot list, approve or reject", async () => {
    await expect(
      withScope(db, ownerScope, (tx) => listOnboardingRequests(tx, ownerScope)),
    ).rejects.toBeInstanceOf(OnboardingForbiddenError);
    await expect(
      approveOnboardingRequest(db, ownerScope, crypto.randomUUID(), {
        auth,
        setup,
        redirectTo: REDIRECT,
      }),
    ).rejects.toBeInstanceOf(OnboardingForbiddenError);
    await expect(
      rejectOnboardingRequest(db, ownerScope, crypto.randomUUID(), "x"),
    ).rejects.toBeInstanceOf(OnboardingForbiddenError);
  });
});
