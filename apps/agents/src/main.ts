import { createDatabase, createEventBus, transportFromEnv } from "@atrium/core";
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

if (token.length < 32) {
  jsonLogger.error("agents.cannot_start", {
    reason: "AGENTS_SERVICE_TOKEN must be at least 32 characters",
  });
  process.exit(1);
}

const dev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
if (!process.env.PUBLIC_BASE_URL && !dev) {
  jsonLogger.error("agents.cannot_start", {
    reason: "PUBLIC_BASE_URL is not set; survey links would point at localhost",
  });
  process.exit(1);
}

// The API verifies unsubscribe tokens with SURVEY_SECRET ?? BETTER_AUTH_SECRET: sign with the same.
const unsubscribeSecret = process.env.SURVEY_SECRET ?? process.env.BETTER_AUTH_SECRET;
if (!unsubscribeSecret && !dev) {
  jsonLogger.error("agents.cannot_start", {
    reason:
      "neither SURVEY_SECRET nor BETTER_AUTH_SECRET is set; unsubscribe links could not be signed",
  });
  process.exit(1);
}

const transport = transportFromEnv(process.env);

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
  transport,
  token,
  meter,
  ...(reader ? { reader } : {}),
  ...(unsubscribeSecret ? { unsubscribeSecret } : {}),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
  ...(process.env.ADMIN_BASE_URL ? { adminBaseUrl: process.env.ADMIN_BASE_URL } : {}),
});

const server = Bun.serve({
  port: Number(process.env.AGENTS_PORT ?? 3005),
  fetch: app.fetch,
  // Bun's default idle limit is 10 s. What bounds a long task is the 20 s budget of ask.send_due,
  // under the client's 30 s default timeout; 255 s (the maximum) is only the idle limit.
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
