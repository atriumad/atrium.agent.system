import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  assignClient,
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  decideLocation,
  InvalidLocationError,
  LocationForbiddenError,
  LocationNotFoundError,
  LocationStateError,
  locationStatusFor,
  type NotificationTransport,
  requestLocation,
  type Scope,
  withAgency,
  withScope,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-ll-${suffix}`;
const { db, close } = createDatabase(APP_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: "http://localhost:3000",
  agencySlug: AGENCY_SLUG,
});
const seed = { type: "user", id: `seed-ll-${suffix}` } as const;

const rawDb = new SQL(ADMIN_URL);
/** The (type, id) each notification of this kind points at, for one target. */
const targetsOf = async (kind: string, id: string) =>
  (
    (await rawDb.unsafe(
      "select target_type, target_id from core.notifications where kind = $1 and target_id = $2",
      [kind, id],
    )) as { target_type: string; target_id: string }[]
  ).map((r) => [r.target_type, r.target_id]);

const sent: { to: string; subject: string | null }[] = [];
const transport: NotificationTransport = {
  name: "test",
  deliver: async (m) => {
    sent.push({ to: m.to, subject: m.subject });
    return { status: "recorded", providerId: null };
  },
};

async function signUp(label: string) {
  const res = await auth.api.signUpEmail({
    body: {
      email: `${label}-${suffix}@ll.atrium.dev`,
      password: "correct-horse-battery",
      name: label,
    },
  });
  return res.user.id;
}
const addMember = (userId: string, organizationId: string, role: string) =>
  auth.api.addMember({ body: { userId, organizationId, role } as never });

let clientId = "";
let ownerScope: Scope;
let amScope: Scope;
let strangerScope: Scope;
let pendingId = "";

beforeAll(async () => {
  await migrate(ADMIN_URL);
  const ownerId = await signUp("owner");
  const amId = await signUp("am");
  const strangerId = await signUp("stranger");
  let agencyOrg = "";
  let clientOrg = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const c = await createClientWithOrganization(tx, { name: "Lifecycle", slug: `ll-${suffix}` });
    clientId = c.client.id;
    clientOrg = c.organization.id;
    await assignClient(tx, amId, clientId, seed);
  });
  await addMember(ownerId, clientOrg, "client_owner");
  await addMember(amId, agencyOrg, "account_manager");
  await addMember(strangerId, agencyOrg, "account_manager");
  ownerScope = { kind: "client", userId: ownerId, role: "client_owner", clientId };
  amScope = { kind: "assigned", userId: amId, role: "account_manager" };
  strangerScope = { kind: "assigned", userId: strangerId, role: "account_manager" };
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug = ${`ll-${suffix}`}`);
    await tx.execute(sql`delete from core.organizations where slug like ${`%-${suffix}`}`);
    await tx.execute(sql`delete from core.users where email like ${`%-${suffix}@ll.atrium.dev`}`);
  });
  await rawDb.close();
  await close();
});

describe("asking for a location", () => {
  test("creates a pending location and tells the team, not the owner", async () => {
    pendingId = await withScope(db, ownerScope, (tx) =>
      requestLocation(tx, ownerScope, { name: "Heights", timeZone: "America/Chicago" }, transport),
    );
    expect(await locationStatusFor(db, pendingId)).toBe("pending");
    expect(sent.some((m) => m.to === `am-${suffix}@ll.atrium.dev`)).toBe(true);
    expect(sent.some((m) => m.to === `owner-${suffix}@ll.atrium.dev`)).toBe(false);
    expect(await targetsOf("core.location_requested", pendingId)).toEqual([
      ["location", pendingId],
    ]);
  });

  test("a bad time zone or an empty name is refused", async () => {
    await expect(
      withScope(db, ownerScope, (tx) =>
        requestLocation(tx, ownerScope, { name: "X", timeZone: "Nowhere/Land" }),
      ),
    ).rejects.toBeInstanceOf(InvalidLocationError);
    await expect(
      withScope(db, ownerScope, (tx) =>
        requestLocation(tx, ownerScope, { name: "  ", timeZone: "America/Chicago" }),
      ),
    ).rejects.toBeInstanceOf(InvalidLocationError);
  });

  test("the agency cannot use the owner's door", async () => {
    await expect(
      withScope(db, amScope, (tx) =>
        requestLocation(tx, amScope, { name: "X", timeZone: "America/Chicago" }),
      ),
    ).rejects.toBeInstanceOf(LocationForbiddenError);
  });
});

describe("deciding", () => {
  test("an owner cannot decide", async () => {
    await expect(
      withScope(db, ownerScope, (tx) => decideLocation(tx, ownerScope, pendingId, "approve", null)),
    ).rejects.toBeInstanceOf(LocationForbiddenError);
  });

  test("a manager not assigned to the client sees nothing", async () => {
    await expect(
      withScope(db, strangerScope, (tx) =>
        decideLocation(tx, strangerScope, pendingId, "approve", null),
      ),
    ).rejects.toBeInstanceOf(LocationNotFoundError);
  });

  test("the assigned manager approves, the owner is told, illegal moves fail", async () => {
    sent.length = 0;
    expect(
      await withScope(db, amScope, (tx) =>
        decideLocation(tx, amScope, pendingId, "approve", null, transport),
      ),
    ).toBe("active");
    expect(sent.some((m) => m.to === `owner-${suffix}@ll.atrium.dev`)).toBe(true);
    expect(await targetsOf("core.location_decided", pendingId)).toEqual([["location", pendingId]]);
    await expect(
      withScope(db, amScope, (tx) => decideLocation(tx, amScope, pendingId, "approve", null)),
    ).rejects.toBeInstanceOf(LocationStateError);
    expect(
      await withScope(db, amScope, (tx) =>
        decideLocation(tx, amScope, pendingId, "suspend", "late rent"),
      ),
    ).toBe("suspended");
    expect(
      await withScope(db, amScope, (tx) =>
        decideLocation(tx, amScope, pendingId, "reactivate", null),
      ),
    ).toBe("active");
  });
});
