import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  createClient,
  createDatabase,
  createLocation,
  listLocations,
  withAgency,
  withTenant,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
let a: { id: string };
let b: { id: string };

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    a = await createClient(tx, { name: "Casa Olivo", slug: `casa-olivo-${suffix}` });
    b = await createClient(tx, { name: "Brasa Norte", slug: `brasa-norte-${suffix}` });
    await createLocation(tx, a.id, { name: "Olivo Bellaire", timeZone: "America/Chicago" });
    await createLocation(tx, b.id, { name: "Brasa Heights", timeZone: "America/Chicago" });
  });
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`%-${suffix}`}`);
  });
  await close();
});

describe("tenant isolation", () => {
  test("repository returns only the client's locations", async () => {
    const rows = await withTenant(db, a.id, (tx) => listLocations(tx, a.id));
    expect(rows.map((r) => r.name)).toEqual(["Olivo Bellaire"]);
  });

  test("RLS holds even when a query forgets the client", async () => {
    const rows = await withTenant(db, a.id, (tx) =>
      tx.execute<{ name: string }>(sql`select name from core.locations`),
    );
    expect(rows.map((r) => r.name)).toEqual(["Olivo Bellaire"]);
  });

  test("asking the repository for another client's id returns nothing", async () => {
    const rows = await withTenant(db, a.id, (tx) => listLocations(tx, b.id));
    expect(rows).toEqual([]);
  });

  test("a tenant cannot write into another client", async () => {
    const attempt = withTenant(db, a.id, (tx) =>
      createLocation(tx, b.id, { name: "Intruder", timeZone: "America/Chicago" }),
    );
    await expect(attempt).rejects.toThrow();
  });

  test("a tenant cannot create clients", async () => {
    const attempt = withTenant(db, a.id, (tx) =>
      createClient(tx, { name: "Rogue", slug: `rogue-${suffix}` }),
    );
    await expect(attempt).rejects.toThrow();
  });

  test("no scope set means no rows", async () => {
    const rows = await db.transaction((tx) => tx.execute(sql`select id from core.clients`));
    expect(rows.length).toBe(0);
  });

  test("the app role cannot bypass RLS", async () => {
    // Superusers and BYPASSRLS roles ignore every policy, so the app must never be one.
    const rows = await db.transaction((tx) =>
      tx.execute(sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`),
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  test("agency scope sees the whole portfolio", async () => {
    const rows = await withAgency(db, (tx) =>
      tx.execute(sql`select slug from core.clients where slug like ${`%-${suffix}`}`),
    );
    expect(rows.length).toBe(2);
  });

  test("withTenant rejects anything that is not a uuid", () => {
    expect(() => withTenant(db, "a' or '1'='1", async () => 1)).toThrow();
  });
});

describe("migrations", () => {
  test("are idempotent", async () => {
    expect(await migrate(ADMIN_URL)).toEqual([]);
  });
});
