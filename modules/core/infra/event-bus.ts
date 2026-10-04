import { type AtriumEvent, EVENT_TYPES, type EventType, parseEvent } from "@atrium/contracts";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { fromBunSql, fromDrizzle, PgBoss } from "pg-boss";
import { type Database, type Tx, withTenant } from "./db";

/**
 * Transactional events on pg-boss. Docs: architecture / Events and contracts, ADR 0006.
 *
 * - publish() enqueues inside the caller's transaction: stored change and event commit together.
 * - Each consumer has its own queue, so every consumer of an event type receives it (fan-out).
 * - Delivery retries with exponential backoff; after the limit the job goes to the dead-letter
 *   queue for review.
 * - A consumer's effect and its idempotency record commit in one transaction, so a second
 *   delivery of the same event id has no effect.
 */

export const DEAD_LETTER_QUEUE = "events.dead_letter";

export type RetryPolicy = {
  /** Attempts after the first delivery. Docs: 5. */
  limit: number;
  /** Seconds before the first retry; doubles each time (with jitter). */
  delaySeconds: number;
  maxDelaySeconds: number;
};

export const DEFAULT_RETRY: RetryPolicy = { limit: 5, delaySeconds: 30, maxDelaySeconds: 3600 };

export type EventHandler<T extends EventType> = (
  event: Extract<AtriumEvent, { type: T }>,
  tx: Tx,
) => Promise<void>;

export type SubscribeOptions = {
  /** Consumers can be switched off per client (feature flags). Default: always on. */
  isEnabled?: (tx: Tx, clientId: string) => Promise<boolean>;
  pollingIntervalSeconds?: number;
};

export type EventBusOptions = {
  /** Connection for pg-boss. Defaults to DATABASE_URL (the app role). */
  url?: string;
  schema?: string;
  retry?: RetryPolicy;
};

const queueName = (consumer: string, type: EventType) => `${consumer}.${type}`;

export function createEventBus(db: Database, options: EventBusOptions = {}) {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const retry = options.retry ?? DEFAULT_RETRY;
  const client = new SQL(url);
  // The schema is created by the migrations (owned by the app role), so pg-boss only fills it.
  const boss = new PgBoss({
    db: fromBunSql(client),
    schema: options.schema ?? "queue",
    createSchema: false,
  });
  const queues = new Set<string>();

  const queueOptions = {
    retryLimit: retry.limit,
    retryDelay: retry.delaySeconds,
    retryBackoff: true,
    retryDelayMax: retry.maxDelaySeconds,
    deadLetter: DEAD_LETTER_QUEUE,
  };

  async function ensureQueue(name: string) {
    if (queues.has(name)) return;
    await boss.createQueue(name, queueOptions);
    queues.add(name);
  }

  return {
    boss,

    async start() {
      await boss.start();
      await boss.createQueue(DEAD_LETTER_QUEUE, { retentionSeconds: 30 * 24 * 3600 });
    },

    async stop() {
      await boss.stop({ graceful: true });
      await client.close();
    },

    /**
     * Validates and enqueues an event inside `tx`. If the transaction rolls back, so does the
     * event. `id` is the idempotency key and also dedupes the enqueue.
     */
    async publish(event: AtriumEvent, tx: Tx) {
      const valid = parseEvent(event);
      await boss.publish(valid.type, valid, {
        db: fromDrizzle(tx, sql),
        singletonKey: valid.id,
      });
    },

    /** Registers a consumer for one event type. Idempotent per (consumer, event id). */
    async subscribe<T extends EventType>(
      consumer: string,
      type: T,
      handler: EventHandler<T>,
      subscribeOptions: SubscribeOptions = {},
    ) {
      if (!EVENT_TYPES.includes(type)) throw new Error(`unknown event type: ${type}`);
      const name = queueName(consumer, type);
      // The queue only ever carries `type`, so widening the handler is safe at runtime.
      const anyHandler = handler as unknown as EventHandler<EventType>;
      await ensureQueue(name);
      await boss.subscribe(type, name);
      await boss.work(
        name,
        { pollingIntervalSeconds: subscribeOptions.pollingIntervalSeconds ?? 2 },
        async (jobs) => {
          for (const job of jobs) {
            await deliver(db, consumer, job.data, anyHandler, subscribeOptions);
          }
        },
      );
    },

    /**
     * A recurring job (cron, UTC unless `tz`). Runs on exactly one worker per tick, retries with
     * backoff, and lands in the dead-letter queue if it keeps failing. Registering it again is a
     * no-op, so every worker can call this at startup.
     */
    async job(
      name: string,
      cron: string,
      handler: () => Promise<void>,
      jobOptions: { tz?: string; pollingIntervalSeconds?: number } = {},
    ) {
      if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(name)) {
        throw new Error(`job names are module.thing in snake case: ${name}`);
      }
      await ensureQueue(name);
      await boss.work(
        name,
        { pollingIntervalSeconds: jobOptions.pollingIntervalSeconds ?? 5 },
        async () => {
          await handler();
        },
      );
      await boss.schedule(name, cron, null, { tz: jobOptions.tz ?? "UTC" });
    },

    /** Runs a registered job now, outside its schedule. For tests and operators. */
    runJobNow: (name: string) => boss.send(name),

    /**
     * Calls `handler` for every job that exhausted its retries. This is where an alert goes
     * (Sentry); the job's original payload is passed through untouched.
     */
    async onDeadLetter(handler: (payload: unknown) => Promise<void>) {
      await boss.work(DEAD_LETTER_QUEUE, { pollingIntervalSeconds: 5 }, async (jobs) => {
        for (const job of jobs) await handler(job.data);
      });
    },

    /** Event types with at least one consumer queue are created at subscribe time. */
    queueName,
  };
}

export type EventBus = ReturnType<typeof createEventBus>;

/** A consumer a module offers; the worker subscribes it at startup. */
export type ConsumerDefinition<T extends EventType = EventType> = {
  /** `module.thing`, unique. Names the queue and the idempotency record. */
  name: string;
  event: T;
  handler: EventHandler<T>;
  options?: SubscribeOptions;
};

/** A recurring job a module offers; the worker schedules it at startup. */
export type JobDefinition = {
  /** `module.thing`, unique. */
  name: string;
  /** Cron, UTC. */
  cron: string;
  run: () => Promise<void>;
};

/** Keeps the event type and the handler's event in step when a module declares a consumer. */
export function defineConsumer<T extends EventType>(definition: ConsumerDefinition<T>) {
  return definition;
}

/** One delivery. Throws to fail the job and trigger a retry. */
export async function deliver(
  db: Database,
  consumer: string,
  raw: unknown,
  handler: EventHandler<EventType>,
  options: SubscribeOptions = {},
) {
  const event = parseEvent(raw);
  await withTenant(db, event.clientId, async (tx) => {
    if (options.isEnabled && !(await options.isEnabled(tx, event.clientId))) return;
    const inserted = await tx.execute<{ event_id: string }>(sql`
      insert into core.processed_events (consumer, event_id, client_id)
      values (${consumer}, ${event.id}, ${event.clientId})
      on conflict do nothing
      returning event_id`);
    if (inserted.length === 0) return;
    await handler(event as never, tx);
  });
}
