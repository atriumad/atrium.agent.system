import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AtriumEvent } from "@atrium/contracts";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  createClient,
  createDatabase,
  createEventBus,
  DEAD_LETTER_QUEUE,
  deliver,
  type EventBus,
  withAgency,
  withTenant,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const SCHEMA = `queue_test_${suffix}`;
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);

let bus: EventBus;
let clientA: string;
let clientB: string;

const FAST_RETRY = { limit: 1, delaySeconds: 1, maxDelaySeconds: 1 };

function event(clientId: string, overrides: Partial<AtriumEvent> = {}): AtriumEvent {
  return {
    type: "guest.identified",
    version: 1,
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    clientId,
    locationId: null,
    data: { guestId: crypto.randomUUID() },
    ...overrides,
  } as AtriumEvent;
}

async function waitFor(check: () => boolean | Promise<boolean>, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(150);
  }
  throw new Error("timed out waiting for condition");
}

async function jobCount(queue: string) {
  const rows = await admin.unsafe(
    `select count(*)::int as n from "${SCHEMA}".job where name = $1`,
    [queue],
  );
  return (rows[0] as { n: number }).n;
}

async function ledger(consumer: string) {
  const rows = await admin.unsafe(
    "select count(*)::int as n from core.processed_events where consumer = $1",
    [consumer],
  );
  return (rows[0] as { n: number }).n;
}

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await admin.unsafe(`create schema "${SCHEMA}" authorization atrium_app`);
  bus = createEventBus(db, { url: APP_URL, schema: SCHEMA, retry: FAST_RETRY });
  await bus.start();
  await withAgency(db, async (tx) => {
    clientA = (await createClient(tx, { name: "Casa Olivo", slug: `ev-olivo-${suffix}` })).id;
    clientB = (await createClient(tx, { name: "Brasa Norte", slug: `ev-brasa-${suffix}` })).id;
  });
});

afterAll(async () => {
  await bus.stop();
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`ev-%-${suffix}`}`);
  });
  await admin.unsafe(`drop schema "${SCHEMA}" cascade`);
  await admin.close();
  await close();
});

describe("publish", () => {
  test("a rolled-back transaction leaves no event behind", async () => {
    const consumer = `rollback-${suffix}`;
    await bus.subscribe(consumer, "guest.identified", async () => {}, {
      pollingIntervalSeconds: 0.5,
    });
    const queue = bus.queueName(consumer, "guest.identified");
    const before = await jobCount(queue);

    const attempt = withTenant(db, clientA, async (tx) => {
      await bus.publish(event(clientA), tx);
      throw new Error("state change failed");
    });
    await expect(attempt).rejects.toThrow("state change failed");
    expect(await jobCount(queue)).toBe(before);
  });

  test("a committed transaction delivers the event exactly once", async () => {
    const consumer = `commit-${suffix}`;
    const seen: string[] = [];
    await bus.subscribe(consumer, "guest.identified", async (e) => void seen.push(e.id), {
      pollingIntervalSeconds: 0.5,
    });
    const e = event(clientA);
    await withTenant(db, clientA, (tx) => bus.publish(e, tx));
    await waitFor(() => seen.length >= 1);
    await Bun.sleep(1500);
    expect(seen).toEqual([e.id]);
  });

  test("an invalid event is rejected and nothing is enqueued", async () => {
    const consumer = `invalid-${suffix}`;
    await bus.subscribe(consumer, "guest.identified", async () => {}, {
      pollingIntervalSeconds: 0.5,
    });
    const queue = bus.queueName(consumer, "guest.identified");
    const before = await jobCount(queue);
    const bad = event(clientA, { id: "not-a-uuid" });
    await expect(withTenant(db, clientA, (tx) => bus.publish(bad, tx))).rejects.toThrow();
    expect(await jobCount(queue)).toBe(before);
  });
});

describe("consumers", () => {
  test("every consumer of an event type receives it", async () => {
    const got = { a: 0, b: 0 };
    const opts = { pollingIntervalSeconds: 0.5 };
    await bus.subscribe(`fan-a-${suffix}`, "consent.changed", async () => void got.a++, opts);
    await bus.subscribe(`fan-b-${suffix}`, "consent.changed", async () => void got.b++, opts);
    const e = event(clientA, {
      type: "consent.changed",
      data: {
        guestId: crypto.randomUUID(),
        channel: "email",
        purpose: "marketing",
        granted: true,
      },
    } as Partial<AtriumEvent>);
    await withTenant(db, clientA, (tx) => bus.publish(e, tx));
    await waitFor(() => got.a >= 1 && got.b >= 1);
    expect(got).toEqual({ a: 1, b: 1 });
  });

  test("a second delivery of the same event id has no effect", async () => {
    const consumer = `dedupe-${suffix}`;
    let effects = 0;
    const handler = async () => void effects++;
    const e = event(clientA);
    await deliver(db, consumer, e, handler);
    await deliver(db, consumer, e, handler);
    expect(effects).toBe(1);
    expect(await ledger(consumer)).toBe(1);
  });

  test("the idempotency record is per consumer", async () => {
    const e = event(clientA);
    let effects = 0;
    const handler = async () => void effects++;
    await deliver(db, `one-${suffix}`, e, handler);
    await deliver(db, `two-${suffix}`, e, handler);
    expect(effects).toBe(2);
  });

  test("a failed handler is retried and its effect lands once", async () => {
    const consumer = `retry-${suffix}`;
    let attempts = 0;
    await bus.subscribe(
      consumer,
      "guest.identified",
      async () => {
        attempts++;
        if (attempts === 1) throw new Error("flaky");
      },
      { pollingIntervalSeconds: 0.5 },
    );
    await withTenant(db, clientA, (tx) => bus.publish(event(clientA), tx));
    await waitFor(() => attempts >= 2);
    await Bun.sleep(1500);
    expect(attempts).toBe(2);
    expect(await ledger(consumer)).toBe(1);
  });

  test("after the retry limit the job lands in the dead-letter queue", async () => {
    const consumer = `dead-${suffix}`;
    let attempts = 0;
    await bus.subscribe(
      consumer,
      "guest.identified",
      async () => {
        attempts++;
        throw new Error("always fails");
      },
      { pollingIntervalSeconds: 0.5 },
    );
    const before = await jobCount(DEAD_LETTER_QUEUE);
    await withTenant(db, clientA, (tx) => bus.publish(event(clientA), tx));
    await waitFor(async () => (await jobCount(DEAD_LETTER_QUEUE)) > before, 30000);
    expect(attempts).toBe(1 + FAST_RETRY.limit);
    expect(await ledger(consumer)).toBe(0);
  });

  test("the handler runs inside the event's client scope", async () => {
    const visible: string[] = [];
    await deliver(db, `scope-${suffix}`, event(clientA), async (_e, tx) => {
      const rows = await tx.execute<{ slug: string }>(
        sql`select slug from core.clients where slug like ${`ev-%-${suffix}`}`,
      );
      for (const r of rows) visible.push(r.slug);
    });
    expect(visible).toEqual([`ev-olivo-${suffix}`]);
  });

  test("a consumer switched off for a client ignores the event", async () => {
    const consumer = `off-${suffix}`;
    let effects = 0;
    await deliver(db, consumer, event(clientB), async () => void effects++, {
      isEnabled: async () => false,
    });
    expect(effects).toBe(0);
    expect(await ledger(consumer)).toBe(0);
  });
});
