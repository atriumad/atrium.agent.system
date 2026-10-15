import { createDatabase, createEventBus } from "@atrium/core";
import { sentimentReader } from "./reader";
import { assertModelAllowed, hostConfigFromEnv, modelFor } from "./runtime/config";
import { createUsageMeter } from "./runtime/meter";
import { openRouterModel } from "./runtime/model";
import { jsonLogger } from "./server";
import { createAgentsService } from "./service";

const token = process.env.AGENTS_SERVICE_TOKEN;
if (!token) {
  jsonLogger.error("agents.cannot_start", { reason: "AGENTS_SERVICE_TOKEN is not set" });
  process.exit(1);
}

const { db, close } = createDatabase();
const bus = createEventBus(db);
await bus.start();

const config = hostConfigFromEnv(process.env);
const meter = createUsageMeter();
const port = config.apiKey ? openRouterModel({ apiKey: config.apiKey, meter }) : undefined;
const sentimentModel = modelFor(config, "host.sentiment");
if (port && sentimentModel) assertModelAllowed(sentimentModel, process.env);
const reader = port && sentimentModel ? sentimentReader(port, sentimentModel) : undefined;
if (!reader) {
  jsonLogger.info("sentiment.disabled", {
    reason: "no HOST_LLM_API_KEY or no model for host.sentiment",
  });
}

const app = createAgentsService({
  db,
  publish: (event, tx) => bus.publish(event, tx),
  token,
  meter,
  ...(reader ? { reader } : {}),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
  ...(process.env.ADMIN_BASE_URL ? { adminBaseUrl: process.env.ADMIN_BASE_URL } : {}),
});

const server = Bun.serve({
  port: Number(process.env.AGENTS_PORT ?? 3005),
  fetch: app.fetch,
  // A model call can take 15 s and ask.send_due loops: the default 10 s would drop the connection.
  idleTimeout: 255,
});
jsonLogger.info("agents.started", { port: server.port });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  jsonLogger.info("agents.stopping", { signal });
  // Let in-flight tasks finish before the bus and the database go away.
  await server.stop();
  await bus.stop();
  await close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
