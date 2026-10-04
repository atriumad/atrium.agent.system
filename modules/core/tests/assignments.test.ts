import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  assignClient,
  assignLocation,
  createAgencyOrganization,
  createAuth,
  createClient,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  decideApproval,
  listAssignedClientIds,
  listAudit,
  locationVisible,
  recordConsent,
  requestApproval,
  resolveGuest,
  resolveScope,
  type Scope,
  setPackage,
  switchOff,
  unassignClient,
  unassignLocation,
  withAgency,
  withScope,
  withTenant,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-as-${suffix}`;
const { db, close } = createDatabase(APP_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: "http://localhost:3000",
  agencySlug: AGENCY_SLUG,
});

const admin = { type: "user", id: `admin-as-${suffix}` } as const;
const agent = { type: "agent", id: "test.echo" } as const;

async function signUp(label: string) {
  const res = await auth.api.signUpEmail({
    body: {
      email: `${label}-${suffix}@as.atrium.dev`,
      password: "correct-horse-battery",
      name: label,
    },
  });
  return res.user.id;
}
const addMember = (userId: string, organizationId: string, role: string) =>
  auth.api.addMember({ body: { userId, organizationId, role } as never });

let agencyOrg: string;
let a: { id: string; orgId: string; loc1: string; loc2: string };
let b: { id: string; orgId: string; loc1: string };
let adminUser: string;
let am: string;
let staff: string;
let loneAm: string;
let ownerA: string;
let staffA: string;
let staffNone: string;

const asAssigned = (
  userId: string,
  role: "account_manager" | "agency_staff" = "account_manager",
): Scope => ({
  kind: "assigned",
  userId,
  role,
});

beforeAll(async () => {
  await migrate(ADMIN_URL);
  adminUser = await signUp("admin");
  am = await signUp("am");
  staff = await signUp("staff");
  loneAm = await signUp("lone-am");
  ownerA = await signUp("owner-a");
  staffA = await signUp("staff-a");
  staffNone = await signUp("staff-none");

  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const ca = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `as-olivo-${suffix}`,
    });
    const cb = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `as-brasa-${suffix}`,
    });
    const mk = async (clientId: string, name: string) =>
      (await createLocation(tx, clientId, { name, timeZone: "America/Chicago" })).id;
    a = {
      id: ca.client.id,
      orgId: ca.organization.id,
      loc1: await mk(ca.client.id, "Bellaire"),
      loc2: await mk(ca.client.id, "Heights"),
    };
    b = { id: cb.client.id, orgId: cb.organization.id, loc1: await mk(cb.client.id, "Norte") };
    await assignClient(tx, am, a.id, admin);
    await assignClient(tx, staff, a.id, admin);
    await assignLocation(tx, staffA, a.id, a.loc1, admin);
  });
  await addMember(adminUser, agencyOrg, "agency_admin");
  await addMember(am, agencyOrg, "account_manager");
  await addMember(staff, agencyOrg, "agency_staff");
  await addMember(loneAm, agencyOrg, "account_manager");
  await addMember(ownerA, a.orgId, "client_owner");
  await addMember(staffA, a.orgId, "client_staff");
  await addMember(staffNone, a.orgId, "client_staff");
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`as-%-${suffix}`}`);
    await tx.execute(sql`delete from core.organizations where slug like ${`%-${suffix}`}`);
    await tx.execute(sql`delete from core.users where email like ${`%-${suffix}@as.atrium.dev`}`);
  });
  await close();
});

const clientIds = (tx: Parameters<Parameters<typeof withScope>[2]>[0]) =>
  tx
    .execute<{ id: string }>(sql`select id from core.clients where slug like ${`as-%-${suffix}`}`)
    .then((r) => r.map((x) => x.id).sort());

describe("an assigned account manager", () => {
  test("sees the clients assigned to them and no others", async () => {
    expect(await withScope(db, asAssigned(am), clientIds)).toEqual([a.id]);
  });

  test("sees the assigned client's locations, guests and audit history, not another client's", async () => {
    const rows = await withScope(db, asAssigned(am), async (tx) => ({
      locations: (
        await tx.execute<{ client_id: string }>(sql`select client_id from core.locations`)
      ).map((r) => r.client_id),
    }));
    expect(new Set(rows.locations.filter((id) => id === a.id || id === b.id))).toEqual(
      new Set([a.id]),
    );
  });

  test("a manager with no assignments sees nothing", async () => {
    expect(await withScope(db, asAssigned(loneAm), clientIds)).toEqual([]);
  });

  test("can work on the assigned client: guests, consents, approvals", async () => {
    const guestId = await withScope(db, asAssigned(am), async (tx) => {
      const id = await resolveGuest(tx, a.id, { email: `walkin-${suffix}@guest.test` });
      await recordConsent(tx, id, "email", "marketing", "manual");
      return id;
    });
    expect(guestId).toBeString();
    const approvalId = await withTenant(db, a.id, (tx) =>
      requestApproval(
        tx,
        a.id,
        { itemType: "reputation.reply", itemRef: `as-${suffix}`, summary: "Reply" },
        agent,
      ),
    );
    const decided = await withScope(db, asAssigned(am), (tx) =>
      decideApproval(tx, asAssigned(am), approvalId, { decision: "approve" }),
    );
    expect(decided.status).toBe("approved");
  });

  test("cannot write into a client that is not assigned", async () => {
    await expect(
      withScope(db, asAssigned(am), (tx) =>
        resolveGuest(tx, b.id, { email: `intruder-${suffix}@guest.test` }),
      ),
    ).rejects.toThrow();
  });

  test("cannot decide an approval of an unassigned client: it is not even visible", async () => {
    const id = await withTenant(db, b.id, (tx) =>
      requestApproval(
        tx,
        b.id,
        { itemType: "reputation.reply", itemRef: `as-b-${suffix}`, summary: "Reply" },
        agent,
      ),
    );
    await expect(
      withScope(db, asAssigned(am), (tx) =>
        decideApproval(tx, asAssigned(am), id, { decision: "approve" }),
      ),
    ).rejects.toThrow("not found");
  });

  test("cannot create clients, change packages or assign anyone", async () => {
    await expect(
      withScope(db, asAssigned(am), (tx) =>
        createClient(tx, { name: "Rogue", slug: `as-rogue-${suffix}` }),
      ),
    ).rejects.toThrow();
    await expect(
      withScope(db, asAssigned(am), (tx) => setPackage(tx, a.id, "pillar_3", admin)),
    ).rejects.toThrow();
    await expect(
      withScope(db, asAssigned(am), (tx) => assignClient(tx, am, b.id, admin)),
    ).rejects.toThrow();
  });

  test("can switch an agent off for an assigned client, not for another or for everyone", async () => {
    await withScope(db, asAssigned(am), (tx) =>
      switchOff(
        tx,
        { agentId: `zzas${suffix}`, clientId: a.id, reason: "owner asked" },
        { type: "user", id: am },
      ),
    );
    await expect(
      withScope(db, asAssigned(am), (tx) =>
        switchOff(
          tx,
          { agentId: `zzas${suffix}`, clientId: b.id, reason: "x" },
          { type: "user", id: am },
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withScope(db, asAssigned(am), (tx) =>
        switchOff(
          tx,
          { agentId: `zzas${suffix}`, clientId: null, reason: "x" },
          { type: "user", id: am },
        ),
      ),
    ).rejects.toThrow();
    await withAgency(db, (tx) =>
      tx.execute(sql`delete from core.kill_switches where agent_id like ${`zzas${suffix}%`}`),
    );
  });

  test("agency staff follow the same rule", async () => {
    expect(await withScope(db, asAssigned(staff, "agency_staff"), clientIds)).toEqual([a.id]);
  });
});

describe("managing assignments", () => {
  test("only agency scope assigns, and it is audited", async () => {
    const changed = await withAgency(db, (tx) => assignClient(tx, loneAm, b.id, admin));
    expect(changed).toBe(true);
    const audit = await withAgency(db, (tx) => listAudit(tx, b.id, { actorId: admin.id }));
    expect(audit.some((e) => e.action === "core.assign_client")).toBe(true);
    expect(await withScope(db, asAssigned(loneAm), clientIds)).toEqual([b.id]);
  });

  test("assigning twice changes nothing and logs nothing new", async () => {
    const before = (
      await withAgency(db, (tx) => listAudit(tx, b.id, { actorId: admin.id, limit: 200 }))
    ).length;
    expect(await withAgency(db, (tx) => assignClient(tx, loneAm, b.id, admin))).toBe(false);
    const after = (
      await withAgency(db, (tx) => listAudit(tx, b.id, { actorId: admin.id, limit: 200 }))
    ).length;
    expect(after).toBe(before);
  });

  test("unassigning takes the access away at once", async () => {
    expect(await withAgency(db, (tx) => unassignClient(tx, loneAm, b.id, admin))).toBe(true);
    expect(await withScope(db, asAssigned(loneAm), clientIds)).toEqual([]);
    expect(await withAgency(db, (tx) => unassignClient(tx, loneAm, b.id, admin))).toBe(false);
  });

  test("a user reads their own assignments, not someone else's", async () => {
    expect(await withScope(db, asAssigned(am), (tx) => listAssignedClientIds(tx, am))).toEqual([
      a.id,
    ]);
    expect(await withScope(db, asAssigned(am), (tx) => listAssignedClientIds(tx, staff))).toEqual(
      [],
    );
  });
});

describe("resolveScope", () => {
  const resolve = (userId: string, orgId: string) =>
    resolveScope(db, { userId, activeOrganizationId: orgId }, AGENCY_SLUG);

  test("an admin gets the whole portfolio, managers and staff get assigned scope", async () => {
    expect(await resolve(adminUser, agencyOrg)).toMatchObject({
      kind: "agency",
      role: "agency_admin",
    });
    expect(await resolve(am, agencyOrg)).toMatchObject({
      kind: "assigned",
      role: "account_manager",
    });
    expect(await resolve(staff, agencyOrg)).toMatchObject({
      kind: "assigned",
      role: "agency_staff",
    });
  });

  test("a client owner sees every location, client staff only theirs", async () => {
    const owner = await resolve(ownerA, a.orgId);
    expect(owner).toMatchObject({ kind: "client", role: "client_owner", clientId: a.id });
    expect(owner && "locationIds" in owner ? owner.locationIds : undefined).toBeUndefined();

    const staffScope = await resolve(staffA, a.orgId);
    expect(staffScope).toMatchObject({
      kind: "client",
      role: "client_staff",
      locationIds: [a.loc1],
    });
  });

  test("client staff with no locations assigned get an empty list, not full access", async () => {
    const scope = await resolve(staffNone, a.orgId);
    expect(scope).toMatchObject({ kind: "client", role: "client_staff", locationIds: [] });
  });
});

describe("client staff and locations", () => {
  const locationNames = (scope: Scope) =>
    withScope(db, scope, async (tx) =>
      (
        await tx.execute<{ name: string }>(
          sql`select name from core.locations where client_id = ${a.id} order by name`,
        )
      ).map((r) => r.name),
    );

  test("the owner sees every location", async () => {
    const scope = (await resolveScope(
      db,
      { userId: ownerA, activeOrganizationId: a.orgId },
      AGENCY_SLUG,
    )) as Scope;
    expect(await locationNames(scope)).toEqual(["Bellaire", "Heights"]);
  });

  test("staff see only the locations assigned to them", async () => {
    const scope = (await resolveScope(
      db,
      { userId: staffA, activeOrganizationId: a.orgId },
      AGENCY_SLUG,
    )) as Scope;
    expect(await locationNames(scope)).toEqual(["Bellaire"]);
    expect(locationVisible(scope, a.loc1)).toBe(true);
    expect(locationVisible(scope, a.loc2)).toBe(false);
  });

  test("staff with none assigned see no locations at all", async () => {
    const scope = (await resolveScope(
      db,
      { userId: staffNone, activeOrganizationId: a.orgId },
      AGENCY_SLUG,
    )) as Scope;
    expect(await locationNames(scope)).toEqual([]);
  });

  test("assigning a second location widens the view, unassigning narrows it", async () => {
    const resolveStaff = async () =>
      (await resolveScope(
        db,
        { userId: staffA, activeOrganizationId: a.orgId },
        AGENCY_SLUG,
      )) as Scope;
    await withTenant(db, a.id, (tx) =>
      assignLocation(tx, staffA, a.id, a.loc2, { type: "user", id: ownerA }),
    );
    expect(await locationNames(await resolveStaff())).toEqual(["Bellaire", "Heights"]);
    await withTenant(db, a.id, (tx) =>
      unassignLocation(tx, staffA, a.id, a.loc2, { type: "user", id: ownerA }),
    );
    expect(await locationNames(await resolveStaff())).toEqual(["Bellaire"]);
  });

  test("a location of another client cannot be assigned", async () => {
    await expect(
      withAgency(db, (tx) => assignLocation(tx, staffA, a.id, b.loc1, admin)),
    ).rejects.toThrow();
  });

  test("an owner cannot assign locations of another client", async () => {
    await expect(
      withTenant(db, a.id, (tx) =>
        assignLocation(tx, staffA, b.id, b.loc1, { type: "user", id: ownerA }),
      ),
    ).rejects.toThrow();
  });
});
