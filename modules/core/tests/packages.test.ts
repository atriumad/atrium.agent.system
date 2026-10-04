import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type AtriumEvent, FEATURES } from "@atrium/contracts";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  ACCESS_MATRIX,
  accessFor,
  accessLevel,
  clearOverride,
  createClient,
  createDatabase,
  createLocation,
  deliver,
  featureGate,
  isEnabled,
  setOverride,
  setPackage,
  setSmsRegistered,
  smsAllowed,
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
let b: string;
let locA1: string;
let locA2: string;
let locB: string;

const ACTOR = { type: "user", id: "test-admin" } as const;
const agency = <T>(fn: Parameters<typeof withAgency<T>>[1]) => withAgency(db, fn);

function recorder() {
  const events: AtriumEvent[] = [];
  return { events, publish: async (e: AtriumEvent) => void events.push(e) };
}

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await agency(async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `p-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `p-brasa-${suffix}` })).id;
    locA1 = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
    locA2 = (await createLocation(tx, a, { name: "Heights", timeZone: "America/Chicago" })).id;
    locB = (await createLocation(tx, b, { name: "Norte", timeZone: "America/Chicago" })).id;
  });
});

afterAll(async () => {
  await agency(async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`p-%-${suffix}`}`);
  });
  await close();
});

describe("package access", () => {
  test("a client with no package has everything locked", async () => {
    const access = await withTenant(db, a, (tx) => accessFor(tx, a));
    expect(Object.values(access).every((l) => l === "locked")).toBe(true);
    expect(await withTenant(db, a, (tx) => isEnabled(tx, a, null, "content"))).toBe(false);
  });

  test("setting the package unlocks what the matrix says, for the client's own session", async () => {
    await agency((tx) => setPackage(tx, a, "pillar_2", ACTOR));
    const access = await withTenant(db, a, (tx) => accessFor(tx, a));
    expect(access).toEqual(ACCESS_MATRIX.pillar_2);
    expect(await withTenant(db, a, (tx) => isEnabled(tx, a, null, "retention"))).toBe(false);
    expect(await withTenant(db, a, (tx) => isEnabled(tx, a, null, "attribution"))).toBe(true);
  });

  test("changing the package publishes package.changed once, and only on a real change", async () => {
    const r = recorder();
    const changed = await agency(async (tx) => [
      await setPackage(tx, b, "essential", ACTOR, r),
      await setPackage(tx, b, "essential", ACTOR, r),
      await setPackage(tx, b, "pillar_3", ACTOR, r),
    ]);
    expect(changed).toEqual([true, false, true]);
    expect(r.events.map((e) => e.data)).toEqual([
      { previous: null, current: "essential" },
      { previous: "essential", current: "pillar_3" },
    ]);
  });

  test("access is per client: one client never reads another's package", async () => {
    // b is pillar_3, a is pillar_2. Asking from a's scope about b sees no package row.
    const seen = await withTenant(db, a, (tx) => accessFor(tx, b));
    expect(Object.values(seen).every((l) => l === "locked")).toBe(true);
  });
});

describe("only the agency changes access", () => {
  test("a client cannot change its own package", async () => {
    await expect(withTenant(db, a, (tx) => setPackage(tx, a, "pillar_3", ACTOR))).rejects.toThrow();
    expect((await agency((tx) => accessFor(tx, a))).retention).toBe("locked");
  });

  test("a client cannot add an override or register SMS", async () => {
    await expect(
      withTenant(db, a, (tx) => setOverride(tx, a, "retention", "full", ACTOR)),
    ).rejects.toThrow();
    await expect(withTenant(db, a, (tx) => setSmsRegistered(tx, a, true, ACTOR))).rejects.toThrow();
  });

  test("a client cannot delete an override the agency set", async () => {
    await agency((tx) => setOverride(tx, a, "benchmarks", "basic", ACTOR));
    await withTenant(db, a, (tx) => clearOverride(tx, a, "benchmarks", ACTOR));
    expect(await withTenant(db, a, (tx) => accessLevel(tx, a, null, "benchmarks"))).toBe("basic");
    await agency((tx) => clearOverride(tx, a, "benchmarks", ACTOR));
  });
});

describe("overrides", () => {
  test("a client override widens access, and clearing it restores the package", async () => {
    await agency((tx) =>
      setOverride(tx, a, "retention", "full", ACTOR, { note: "pilot of the CRM" }),
    );
    expect(await agency((tx) => accessLevel(tx, a, null, "retention"))).toBe("full");
    await agency((tx) => clearOverride(tx, a, "retention", ACTOR));
    expect(await agency((tx) => accessLevel(tx, a, null, "retention"))).toBe("locked");
  });

  test("a location override applies to that location only", async () => {
    await agency((tx) => setOverride(tx, a, "reputation", "locked", ACTOR, { locationId: locA1 }));
    const [atA1, atA2, clientWide] = await agency(async (tx) => [
      await accessLevel(tx, a, locA1, "reputation"),
      await accessLevel(tx, a, locA2, "reputation"),
      await accessLevel(tx, a, null, "reputation"),
    ]);
    expect([atA1, atA2, clientWide]).toEqual(["locked", "full", "full"]);
    await agency((tx) => clearOverride(tx, a, "reputation", ACTOR, locA1));
  });

  test("setting the same override again replaces it", async () => {
    await agency(async (tx) => {
      await setOverride(tx, a, "growth", "basic", ACTOR);
      await setOverride(tx, a, "growth", "locked", ACTOR);
    });
    const rows = await agency((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from core.feature_overrides where client_id = ${a} and feature = 'growth'`,
      ),
    );
    expect(rows[0]?.n).toBe(1);
    expect(await agency((tx) => accessLevel(tx, a, null, "growth"))).toBe("locked");
    await agency((tx) => clearOverride(tx, a, "growth", ACTOR));
  });

  test("an override cannot point at another client's location", async () => {
    await expect(
      agency((tx) => setOverride(tx, a, "content", "locked", ACTOR, { locationId: locB })),
    ).rejects.toThrow();
  });

  test("an unknown feature or level is rejected", async () => {
    await expect(
      agency((tx) => setOverride(tx, a, "magic" as never, "full", ACTOR)),
    ).rejects.toThrow("unknown feature");
    await expect(
      agency((tx) => setOverride(tx, a, "content", "huge" as never, ACTOR)),
    ).rejects.toThrow("unknown level");
  });

  test("every feature can be overridden", async () => {
    for (const feature of FEATURES) {
      await agency((tx) => setOverride(tx, a, feature, "basic", ACTOR));
    }
    const access = await agency((tx) => accessFor(tx, a));
    expect(Object.values(access).every((l) => l === "basic")).toBe(true);
    for (const feature of FEATURES) await agency((tx) => clearOverride(tx, a, feature, ACTOR));
  });
});

describe("sms", () => {
  test("needs Retention and an approved registration", async () => {
    await agency((tx) => setPackage(tx, a, "pillar_3", ACTOR));
    expect(await agency((tx) => smsAllowed(tx, a))).toBe(false);
    await agency((tx) => setSmsRegistered(tx, a, true, ACTOR));
    expect(await agency((tx) => smsAllowed(tx, a))).toBe(true);
    await agency((tx) => setPackage(tx, a, "pillar_2", ACTOR));
    expect(await agency((tx) => smsAllowed(tx, a))).toBe(false);
  });

  test("registering SMS for a client with no package fails", async () => {
    const orphan = await agency(
      async (tx) => (await createClient(tx, { name: "No Pkg", slug: `p-none-${suffix}` })).id,
    );
    await expect(agency((tx) => setSmsRegistered(tx, orphan, true, ACTOR))).rejects.toThrow(
      "no package",
    );
  });
});

describe("feature gate on the event bus", () => {
  const event = (clientId: string): AtriumEvent => ({
    type: "guest.identified",
    version: 1,
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    clientId,
    locationId: null,
    data: { guestId: crypto.randomUUID() },
  });

  test("a consumer of a locked feature ignores the client's events, and runs once it unlocks", async () => {
    let runs = 0;
    const gate = { isEnabled: featureGate("retention") };
    const handler = async () => void runs++;

    // a is pillar_2 here: retention locked
    await deliver(db, `gate-${suffix}`, event(a), handler, gate);
    expect(runs).toBe(0);

    await agency((tx) => setPackage(tx, a, "pillar_3", ACTOR));
    await deliver(db, `gate-${suffix}`, event(a), handler, gate);
    expect(runs).toBe(1);
  });
});
