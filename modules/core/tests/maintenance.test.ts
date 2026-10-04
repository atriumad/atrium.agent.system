import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  createClient,
  createDatabase,
  PROCESSED_EVENT_RETENTION_DAYS,
  pruneProcessedEvents,
  withAgency,
  withTenant,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
let a: string;
let b: string;
const consumer = `prune-${suffix}`;
const NOW = new Date("2026-10-04T12:00:00Z");

async function remember(daysAgo: number): Promise<string> {
  const id = crypto.randomUUID();
  await admin.unsafe(
    "insert into core.processed_events (consumer, event_id, client_id, processed_at) values ($1, $2, $3, $4)",
    [consumer, id, a, new Date(NOW.getTime() - daysAgo * 86_400_000)],
  );
  return id;
}

async function rememberFor(clientId: string, daysAgo: number): Promise<string> {
  const id = crypto.randomUUID();
  await admin.unsafe(
    "insert into core.processed_events (consumer, event_id, client_id, processed_at) values ($1, $2, $3, $4)",
    [consumer, id, clientId, new Date(NOW.getTime() - daysAgo * 86_400_000)],
  );
  return id;
}

const remaining = async () =>
  (
    (await admin.unsafe("select event_id from core.processed_events where consumer = $1", [
      consumer,
    ])) as { event_id: string }[]
  ).map((r) => r.event_id);

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `mt-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `mt-brasa-${suffix}` })).id;
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`mt-%-${suffix}`}`),
  );
  await admin.close();
  await close();
});

describe("pruneProcessedEvents", () => {
  test("the retention window is thirty days", () => {
    expect(PROCESSED_EVENT_RETENTION_DAYS).toBe(30);
  });

  test("removes records older than the window and keeps the rest", async () => {
    const old = await remember(31);
    const edge = await remember(29);
    const fresh = await remember(1);
    const removed = await withAgency(db, (tx) => pruneProcessedEvents(tx, NOW));
    expect(removed).toBeGreaterThanOrEqual(1);
    const left = await remaining();
    expect(left).not.toContain(old);
    expect(left).toContain(edge);
    expect(left).toContain(fresh);
  });

  test("running it again removes nothing more", async () => {
    expect(await withAgency(db, (tx) => pruneProcessedEvents(tx, NOW))).toBe(0);
  });

  test("a client's session can only ever touch its own ledger rows", async () => {
    const ownOld = await remember(60);
    const otherOld = await rememberFor(b, 60);
    await withTenant(db, a, (tx) => pruneProcessedEvents(tx, NOW));
    const left = await remaining();
    expect(left).not.toContain(ownOld);
    expect(left).toContain(otherOld);
    await withAgency(db, (tx) => pruneProcessedEvents(tx, NOW));
    expect(await remaining()).not.toContain(otherOld);
  });

  test("a retention under a day is refused", async () => {
    await expect(withAgency(db, (tx) => pruneProcessedEvents(tx, NOW, 0))).rejects.toThrow(
      "at least one day",
    );
  });
});
