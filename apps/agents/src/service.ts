import type { Database, EventBus, NotificationTransport } from "@atrium/core";
import { loadHostManifests, type ResponseReader, reputationTools } from "@atrium/reputation";
import { createGateway } from "./gateway";
import type { UsageMeter } from "./runtime/meter";
import { createAgentsApp, type Logger } from "./server";
import { buildAgentTasks } from "./tasks";

export type AgentsServiceDeps = {
  db: Database;
  /** Where the tools publish their events: the bus, inside the caller's transaction. */
  publish: EventBus["publish"];
  /** The shared secret callers send as a bearer token. */
  token: string;
  /** Shared with the model adapter, so the gateway can write what a call cost. */
  meter: UsageMeter;
  /** The model that reads guests' words. Without it, Sentiment answers `rejected`. */
  reader?: ResponseReader;
  /** Replaces the development transport. Tests use it; Twilio will. */
  transport?: NotificationTransport;
  /** Where survey links point: the public address of the API. */
  publicBaseUrl: string;
  /** Where case alerts point the team. Optional. */
  adminBaseUrl?: string;
  now?: () => Date;
  log?: Logger;
};

/**
 * Everything the service is: the gateway built from the manifests and the module's tools, the
 * tasks that call it, and the app that serves them. The worker no longer builds any of this.
 */
export function createAgentsService(deps: AgentsServiceDeps) {
  const gateway = createGateway({
    db: deps.db,
    manifests: loadHostManifests(),
    tools: reputationTools({
      publicBaseUrl: deps.publicBaseUrl,
      ...(deps.adminBaseUrl ? { adminBaseUrl: deps.adminBaseUrl } : {}),
      publish: deps.publish,
      ...(deps.transport ? { transport: deps.transport } : {}),
      ...(deps.reader ? { reader: deps.reader } : {}),
    }),
    costOf: () => deps.meter.current(),
    ...(deps.now ? { now: deps.now } : {}),
  });
  return createAgentsApp({
    tasks: buildAgentTasks(),
    ctx: {
      gateway,
      db: deps.db,
      now: deps.now ?? (() => new Date()),
      models: { sentiment: Boolean(deps.reader) },
    },
    token: deps.token,
    meter: deps.meter,
    ...(deps.log ? { log: deps.log } : {}),
  });
}
