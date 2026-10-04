import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type AtriumEvent, SignalRow } from "@atrium/contracts";
import {
  createClient,
  createDatabase,
  createLocation,
  deliver,
  withAgency,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  ensureFuturePartitions,
  ingestSignals,
  type Principal,
  scrubErasedGuest,
  signalsConsumers,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const NOW = () => new Date("2026-10-04T15:00:00Z");

let a: string;
let b: string;
let locA: string;
let locB: string;
let principal: Principal;
const guest = crypto.randomUUID();

const row = (locationId: string, overrides: Record<string, unknown> = {}) =>
  SignalRow.parse({
    date: "2026-07-10",
    locationId,
    source: "toast",
    signalType: "order",
    value: 3,
    guestId: guest,
    ...overrides,
  });

const guestRows = (clientId: string) =>
  withTenant(
    db,
    clientId,
    async (tx) =>
      (
        await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from signals.signals_daily where guest_id = ${guest}`,
        )
      )[0]?.n ?? 0,
  );

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `sm-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `sm-brasa-${suffix}` })).id;
    locA = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
    locB = (await createLocation(tx, b, { name: "Norte", timeZone: "America/Chicago" })).id;
  });
  principal = { tokenId: crypto.randomUUID(), name: "test", sources: ["toast"], clientIds: [a, b] };
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`sm-%-${suffix}`}`),
  );
  await admin.close();
  await close();
});

describe("ensureFuturePartitions", () => {
  test("lists the current month and twelve more", async () => {
    const months = await ensureFuturePartitions(db, { from: new Date("2026-10-04T00:00:00Z") });
    expect(months).toHaveLength(13);
    expect(months[0]).toBe("2026-10-01");
    expect(months[12]).toBe("2027-10-01");
  });

  test("recreates a partition that is missing", async () => {
    await admin.unsafe("drop table if exists signals.signals_daily_2027_03");
    const gone = await admin.unsafe("select to_regclass('signals.signals_daily_2027_03') as t");
    expect((gone[0] as { t: string | null }).t).toBeNull();
    await ensureFuturePartitions(db, { from: new Date("2026-10-04T00:00:00Z") });
    const back = await admin.unsafe("select to_regclass('signals.signals_daily_2027_03') as t");
    expect((back[0] as { t: string | null }).t).not.toBeNull();
  });

  test("is safe to run twice, and over the year boundary", async () => {
    await ensureFuturePartitions(db, { from: new Date("2026-12-20T00:00:00Z"), monthsAhead: 3 });
    const months = await ensureFuturePartitions(db, {
      from: new Date("2026-12-20T00:00:00Z"),
      monthsAhead: 3,
    });
    expect(months).toEqual(["2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"]);
  });

  test("refuses a horizon the database would refuse", async () => {
    for (const monthsAhead of [-1, 13, 1.5]) {
      await expect(ensureFuturePartitions(db, { monthsAhead })).rejects.toThrow("0 to 12");
    }
  });
});

describe("scrubErasedGuest", () => {
  test("clears the guest from this client's signals only", async () => {
    await ingestSignals(
      db,
      principal,
      [row(locA), row(locA, { signalType: "revenue" }), row(locB)],
      { now: NOW },
    );
    expect(await guestRows(a)).toBe(2);
    expect(await guestRows(b)).toBe(1);

    const scrubbed = await withTenant(db, a, (tx) => scrubErasedGuest(tx, a, guest));
    expect(scrubbed).toBe(2);
    expect(await guestRows(a)).toBe(0);
    expect(await guestRows(b)).toBe(1);
  });

  test("keeps the signals themselves: the counts are real", async () => {
    const left = await withTenant(
      db,
      a,
      async (tx) =>
        (
          await tx.execute<{ n: number }>(
            sql`select count(*)::int as n from signals.signals_daily where signal_type in ('order', 'revenue')`,
          )
        )[0]?.n ?? 0,
    );
    expect(left).toBe(2);
  });

  test("a client cannot scrub another client's rows, even by naming its id", async () => {
    await withTenant(db, a, (tx) => scrubErasedGuest(tx, b, guest));
    expect(await guestRows(b)).toBe(1);
  });
});

describe("the guest.erased consumer", () => {
  const erased = (clientId: string): AtriumEvent => ({
    type: "guest.erased",
    version: 1,
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    clientId,
    locationId: null,
    data: { guestId: guest },
  });

  test("is registered under a stable name for the event", () => {
    const consumer = signalsConsumers[0];
    expect(consumer?.name).toBe("signals.erase_guest");
    expect(consumer?.event).toBe("guest.erased");
  });

  test("scrubs on delivery, once, and ignores a redelivery", async () => {
    const consumer = signalsConsumers[0];
    if (!consumer) throw new Error("no consumer");
    const event = erased(b);
    await deliver(db, consumer.name, event, consumer.handler as never);
    expect(await guestRows(b)).toBe(0);

    await ingestSignals(db, principal, [row(locB, { signalType: "revenue" })], { now: NOW });
    await deliver(db, consumer.name, event, consumer.handler as never);
    expect(await guestRows(b)).toBe(1);
  });
});
