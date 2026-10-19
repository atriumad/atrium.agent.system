import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { CONSENT_SOURCES } from "../domain/contact";
import { can, ROLES } from "../domain/roles";
import {
  createClient,
  createDatabase,
  recordConsent,
  resolveGuest,
  withAgency,
  withTenant,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
let a: string;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `lp-olivo-${suffix}` })).id;
  });
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`lp-%-${suffix}`}`);
  });
  await close();
});

describe("loyalty permissions", () => {
  test("client staff read, stamp and redeem but do not manage", () => {
    expect(can("client_staff", "loyalty", "read")).toBe(true);
    expect(can("client_staff", "loyalty", "stamp")).toBe(true);
    expect(can("client_staff", "loyalty", "redeem")).toBe(true);
    expect(can("client_staff", "loyalty", "manage")).toBe(false);
  });

  test("the client owner has all four", () => {
    for (const action of ["read", "stamp", "redeem", "manage"] as const) {
      expect(can("client_owner", "loyalty", action)).toBe(true);
    }
  });

  test("agency roles read and manage but never stamp or redeem", () => {
    expect(can("account_manager", "loyalty", "manage")).toBe(true);
    expect(can("account_manager", "loyalty", "stamp")).toBe(false);
    expect(can("agency_admin", "loyalty", "manage")).toBe(true);
    expect(can("agency_admin", "loyalty", "redeem")).toBe(false);
    expect(can("agency_staff", "loyalty", "read")).toBe(true);
    expect(can("agency_staff", "loyalty", "stamp")).toBe(false);
    expect(can("agency_staff", "loyalty", "manage")).toBe(false);
  });

  test("only client roles can stamp or redeem", () => {
    expect(ROLES.filter((r) => can(r, "loyalty", "stamp"))).toEqual([
      "client_owner",
      "client_staff",
    ]);
    expect(ROLES.filter((r) => can(r, "loyalty", "redeem"))).toEqual([
      "client_owner",
      "client_staff",
    ]);
  });
});

describe("loyalty_card consent source", () => {
  test("it is a known source and the database accepts it", async () => {
    expect(CONSENT_SOURCES).toContain("loyalty_card");
    const recorded = await withTenant(db, a, async (tx) => {
      const g = await resolveGuest(tx, a, { email: `card-${suffix}@guest.test` });
      return recordConsent(tx, g, "email", "marketing", "loyalty_card");
    });
    expect(recorded).toBe(true);
  });

  test("an unknown source still fails", async () => {
    await expect(
      withTenant(db, a, async (tx) => {
        const g = await resolveGuest(tx, a, { email: `bad-${suffix}@guest.test` });
        return recordConsent(tx, g, "email", "marketing", "nope" as never);
      }),
    ).rejects.toThrow();
  });
});
