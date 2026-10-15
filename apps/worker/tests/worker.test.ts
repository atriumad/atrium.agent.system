import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SignalRow } from "@atrium/contracts";
import {
  createClient,
  createDatabase,
  createEventBus,
  createLocation,
  DEAD_LETTER_QUEUE,
  type EventBus,
  withAgency,
  withTenant,
} from "@atrium/core";
import { ingestSignals, type Principal } from "@atrium/signals";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { describeDeadLetter, type Logger, registry, startWorker } from "../src/worker";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const CONFIG = {
  agents: {
    call: async () => ({ decision: "executed" }),
  } as unknown as import("@atrium/contracts").AgentsClient,
};
const SCHEMA = `queue_worker_${suffix}`;
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);

const logs: { level: string; message: string; fields?: Record<string, unknown> }[] = [];
const log: Logger = {
  info: (message, fields) =>
    void logs.push({ level: "info", message, ...(fields ? { fields } : {}) }),
  error: (message, fields) =>
    void logs.push({ level: "error", message, ...(fields ? { fields } : {}) }),
};

let bus: EventBus;
let worker: { stop: () => Promise<void> };
let a: string;
let locA: string;
let principal: Principal;
const guest = crypto.randomUUID();

async function waitFor(check: () => boolean | Promise<boolean>, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(200);
  }
  throw new Error("timed out waiting for condition");
}

const guestRows = () =>
  withTenant(
    db,
    a,
    async (tx) =>
      (
        await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from signals.signals_daily where guest_id = ${guest}`,
        )
      )[0]?.n ?? 0,
  );

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await admin.unsafe(`create schema "${SCHEMA}" authorization atrium_app`);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `wk-olivo-${suffix}` })).id;
    locA = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
  });
  principal = { tokenId: crypto.randomUUID(), name: "test", sources: ["toast"], clientIds: [a] };
  bus = createEventBus(db, {
    url: APP_URL,
    schema: SCHEMA,
    retry: { limit: 1, delaySeconds: 1, maxDelaySeconds: 1 },
  });
  worker = await startWorker({ db, bus, config: CONFIG, log });
});

afterAll(async () => {
  await worker.stop();
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`wk-%-${suffix}`}`),
  );
  await admin.unsafe(`drop schema "${SCHEMA}" cascade`);
  await admin.close();
  await close();
});

describe("startup", () => {
  test("registers every consumer and job the modules offer, and says so", () => {
    const { consumers, jobs } = registry(db, CONFIG);
    const started = logs.find((l) => l.message === "worker.started");
    expect(started?.fields?.consumers).toEqual(consumers.map((c) => c.name));
    expect(started?.fields?.jobs).toEqual(jobs.map((j) => j.name));
    expect(consumers.length).toBeGreaterThan(0);
    expect(jobs.length).toBeGreaterThan(0);
  });

  test("schedules each job once, on its cron", async () => {
    const schedules = await bus.boss.getSchedules();
    for (const job of registry(db, CONFIG).jobs) {
      const found = schedules.filter((s) => s.name === job.name);
      expect(found).toHaveLength(1);
      expect(found[0]?.cron).toBe(job.cron);
    }
  });

  test("registering again, as a second worker would, does not duplicate a schedule", async () => {
    const second = createEventBus(db, { url: APP_URL, schema: SCHEMA });
    const other = await startWorker({ db, bus: second, config: CONFIG, log });
    const names = (await bus.boss.getSchedules()).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    await other.stop();
  });

  test("job names that are not module.thing are refused", async () => {
    await expect(bus.job("Bad Name", "* * * * *", async () => {})).rejects.toThrow("module.thing");
  });
});

describe("guest erasure, end to end", () => {
  test("an erased guest event published in a transaction scrubs the signals", async () => {
    await ingestSignals(
      db,
      principal,
      [
        SignalRow.parse({
          date: "2026-07-10",
          locationId: locA,
          source: "toast",
          signalType: "order",
          value: 2,
          guestId: guest,
        }),
      ],
      { now: () => new Date("2026-10-04T15:00:00Z") },
    );
    expect(await guestRows()).toBe(1);

    await withTenant(db, a, (tx) =>
      bus.publish(
        {
          type: "guest.erased",
          version: 1,
          id: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          clientId: a,
          locationId: null,
          data: { guestId: guest },
        },
        tx,
      ),
    );
    await waitFor(async () => (await guestRows()) === 0);
    expect(await guestRows()).toBe(0);
  }, 30000);
});

describe("jobs", () => {
  test("a job can be run on demand and does its work", async () => {
    const oldEvent = crypto.randomUUID();
    await admin.unsafe(
      "insert into core.processed_events (consumer, event_id, client_id, processed_at) values ($1, $2, $3, now() - interval '45 days')",
      [`prune-${suffix}`, oldEvent, a],
    );
    await bus.runJobNow("core.prune_processed_events");
    await waitFor(async () => {
      const rows = (await admin.unsafe("select 1 from core.processed_events where event_id = $1", [
        oldEvent,
      ])) as unknown[];
      return rows.length === 0;
    });
    await waitFor(() =>
      logs.some((l) => l.message === "job.done" && l.fields?.job === "core.prune_processed_events"),
    );
  }, 40000);

  test("a failing job is logged with its name and retried before it is given up on", async () => {
    let runs = 0;
    await bus.job("worker.always_fails", "0 0 1 1 *", async () => {
      runs++;
      throw new Error("boom");
    });
    await bus.runJobNow("worker.always_fails");
    await waitFor(() => runs >= 2, 30000);
    expect(runs).toBe(2);
  }, 40000);
});

describe("dead letters", () => {
  test("are logged with what they were, never what they carried", async () => {
    const id = crypto.randomUUID();
    await bus.boss.send(DEAD_LETTER_QUEUE, {
      type: "guest.erased",
      version: 1,
      id,
      clientId: a,
      data: { guestId: guest, note: "SHOULD-NOT-BE-LOGGED" },
    });
    await waitFor(() => logs.some((l) => l.message === "dead_letter" && l.fields?.id === id));
    const entry = logs.find((l) => l.message === "dead_letter" && l.fields?.id === id);
    expect(entry?.fields).toEqual({ type: "guest.erased", version: 1, id, clientId: a });
    expect(JSON.stringify(logs)).not.toContain("SHOULD-NOT-BE-LOGGED");
  }, 40000);

  test("describeDeadLetter copes with payloads that are not events", () => {
    expect(describeDeadLetter(null)).toEqual({ kind: "unknown" });
    expect(describeDeadLetter("text")).toEqual({ kind: "unknown" });
    expect(describeDeadLetter({})).toEqual({
      type: undefined,
      version: undefined,
      id: undefined,
      clientId: undefined,
    });
  });
});
