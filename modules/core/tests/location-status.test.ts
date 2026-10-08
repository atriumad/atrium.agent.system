import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { eq, sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  canTransitionLocation,
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  locationStatusFor,
  type Scope,
  withAgency,
  withScope,
} from "../index";
import { locations } from "../infra/schema";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
let clientId = "";
let active = "";
const owner = (): Scope => ({
  kind: "client",
  userId: `o-${suffix}`,
  role: "client_owner",
  clientId,
});

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-ls2-${suffix}` });
    clientId = (await createClientWithOrganization(tx, { name: "LS", slug: `ls2-${suffix}` }))
      .client.id;
    active = (await createLocation(tx, clientId, { name: "Main", timeZone: "America/Chicago" })).id;
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug = ${`ls2-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("transitions", () => {
  test("only the agreed moves are legal", () => {
    expect(canTransitionLocation("pending", "active")).toBe(true);
    expect(canTransitionLocation("pending", "rejected")).toBe(true);
    expect(canTransitionLocation("active", "suspended")).toBe(true);
    expect(canTransitionLocation("suspended", "active")).toBe(true);
    expect(canTransitionLocation("rejected", "active")).toBe(false);
    expect(canTransitionLocation("active", "pending")).toBe(false);
    expect(canTransitionLocation("pending", "suspended")).toBe(false);
  });
});

describe("database", () => {
  test("agency-created locations are active", async () => {
    expect(await locationStatusFor(db, active)).toBe("active");
  });

  test("an unknown location has no status", async () => {
    expect(await locationStatusFor(db, crypto.randomUUID())).toBeNull();
  });

  test("an owner can insert a pending location but not an active one", async () => {
    const pending = await withScope(db, owner(), async (tx) => {
      const [row] = await tx
        .insert(locations)
        .values({ clientId, name: "Patio", timeZone: "America/Chicago", status: "pending" })
        .returning({ id: locations.id });
      return row?.id as string;
    });
    expect(await locationStatusFor(db, pending)).toBe("pending");
    await expect(
      withScope(db, owner(), (tx) =>
        tx
          .insert(locations)
          .values({ clientId, name: "Sneaky", timeZone: "America/Chicago", status: "active" }),
      ),
    ).rejects.toThrow();
  });

  test("an owner cannot change the status of a location", async () => {
    await withScope(db, owner(), (tx) =>
      tx.update(locations).set({ status: "suspended" }).where(eq(locations.id, active)),
    ).catch(() => undefined);
    expect(await locationStatusFor(db, active)).toBe("active");
  });
});
