import { createGateway } from "@atrium/agents";
import {
  type ConsumerDefinition,
  coreJobs,
  type Database,
  type EventBus,
  type JobDefinition,
  type NotificationTransport,
} from "@atrium/core";
import {
  askAgent,
  loadHostManifests,
  type ResponseReader,
  recoveryAgent,
  erasureConsumer as reputationErasure,
  reputationTools,
  sentimentAgent,
} from "@atrium/reputation";
import { ensureFuturePartitions, signalsConsumers, signalsJobs } from "@atrium/signals";

export type WorkerConfig = {
  /** Where survey links point: the public address of the API. */
  publicBaseUrl: string;
  /** Where case alerts point the team. Optional. */
  adminBaseUrl?: string;
  /** Replaces the development transport. Tests use it; Twilio will. */
  transport?: NotificationTransport;
  /** Injectable clock for the agents, for tests. */
  now?: () => Date;
  /** The model that reads guests' words. Without it, Sentiment does not run. */
  reader?: ResponseReader;
};

/**
 * Everything the worker runs. A module adds its consumers and jobs here, and nowhere else:
 * the worker is the one place that knows which modules exist. Agents act through the gateway,
 * which is built here from their manifests and the module's tools.
 */
export function registry(
  db: Database,
  bus: Pick<EventBus, "publish">,
  config: WorkerConfig,
): { consumers: ConsumerDefinition[]; jobs: JobDefinition[] } {
  const gateway = createGateway({
    db,
    manifests: loadHostManifests(),
    tools: reputationTools({
      publicBaseUrl: config.publicBaseUrl,
      ...(config.adminBaseUrl ? { adminBaseUrl: config.adminBaseUrl } : {}),
      publish: (event, tx) => bus.publish(event, tx),
      ...(config.transport ? { transport: config.transport } : {}),
      ...(config.reader ? { reader: config.reader } : {}),
    }),
    ...(config.now ? { now: config.now } : {}),
  });
  const ask = askAgent(gateway, db, config.now);
  const recovery = recoveryAgent(gateway);
  const sentiment = sentimentAgent(gateway);

  return {
    consumers: [
      ...signalsConsumers,
      reputationErasure,
      ...ask.consumers,
      ...recovery.consumers,
      ...(config.reader ? sentiment.consumers : []),
    ],
    jobs: [...coreJobs(db), ...signalsJobs(db), ...ask.jobs],
  };
}

export type Logger = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

export const jsonLogger: Logger = {
  info: (message, fields) => console.log(JSON.stringify({ level: "info", message, ...fields })),
  error: (message, fields) => console.error(JSON.stringify({ level: "error", message, ...fields })),
};

/** The only fields of a dead job worth logging: what it was, never what it carried. */
export function describeDeadLetter(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return { kind: "unknown" };
  const { type, version, id, clientId } = payload as Record<string, unknown>;
  return { type, version, id, clientId };
}

export type WorkerDeps = { db: Database; bus: EventBus; config: WorkerConfig; log?: Logger };

/**
 * Starts the bus, subscribes every consumer, schedules every job and watches the dead-letter
 * queue. Subscriptions are stored in the database, so the API can publish as soon as a worker
 * has started once; do not take traffic from a fresh database before this has run.
 */
export async function startWorker({ db, bus, config, log = jsonLogger }: WorkerDeps) {
  await bus.start();
  const { consumers, jobs } = registry(db, bus, config);

  for (const consumer of consumers) {
    await bus.subscribe(consumer.name, consumer.event, consumer.handler, consumer.options);
  }
  for (const job of jobs) {
    await bus.job(job.name, job.cron, async () => {
      try {
        await job.run();
        log.info("job.done", { job: job.name });
      } catch (error) {
        log.error("job.failed", { job: job.name, error: String(error) });
        throw error;
      }
    });
  }
  await bus.onDeadLetter(async (payload) => {
    log.error("dead_letter", describeDeadLetter(payload));
  });

  // Partitions are also created on demand, but a fresh worker makes sure the months ahead exist.
  await ensureFuturePartitions(db);

  log.info("worker.started", {
    consumers: consumers.map((c) => c.name),
    jobs: jobs.map((j) => j.name),
  });
  return { stop: () => bus.stop() };
}
