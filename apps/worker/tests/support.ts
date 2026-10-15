import { createAgentsService, createUsageMeter } from "@atrium/agents";
import { type AgentsClient, createAgentsClient } from "@atrium/contracts";
import type { Database, EventBus, NotificationTransport } from "@atrium/core";
import type { ResponseReader } from "@atrium/reputation";

/**
 * The real agents service, on a free port of this process, with the real gateway and database.
 * The worker under test talks to it over HTTP, exactly as in production. Only the clock, the
 * transport and the model are replaced.
 */
export async function startAgents(deps: {
  db: Database;
  bus: Pick<EventBus, "publish">;
  now: () => Date;
  publicBaseUrl: string;
  adminBaseUrl?: string;
  reader?: ResponseReader;
  transport?: NotificationTransport;
}): Promise<{ client: AgentsClient; stop: () => void }> {
  const token = `test-token-${crypto.randomUUID()}`;
  const app = createAgentsService({
    db: deps.db,
    publish: (event, tx) => deps.bus.publish(event, tx),
    token,
    meter: createUsageMeter(),
    now: deps.now,
    publicBaseUrl: deps.publicBaseUrl,
    ...(deps.adminBaseUrl ? { adminBaseUrl: deps.adminBaseUrl } : {}),
    ...(deps.reader ? { reader: deps.reader } : {}),
    ...(deps.transport ? { transport: deps.transport } : {}),
    log: { info: () => {}, error: () => {} },
  });
  const server = Bun.serve({ port: 0, fetch: app.fetch });
  return {
    client: createAgentsClient({ url: `http://localhost:${server.port}`, token }),
    stop: () => server.stop(true),
  };
}
