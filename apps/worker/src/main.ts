import { readerFromEnv } from "@atrium/agents";
import { createDatabase, createEventBus } from "@atrium/core";
import { jsonLogger, startWorker } from "./worker";

const { db, close } = createDatabase();
const bus = createEventBus(db);
const reader = readerFromEnv(process.env);
if (!reader) {
  jsonLogger.info("sentiment.disabled", { reason: "no OPENROUTER_API_KEY or SENTIMENT_MODEL" });
}
const worker = await startWorker({
  db,
  bus,
  config: {
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
    ...(process.env.ADMIN_BASE_URL ? { adminBaseUrl: process.env.ADMIN_BASE_URL } : {}),
    ...(reader ? { reader } : {}),
  },
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  jsonLogger.info("worker.stopping", { signal });
  await worker.stop();
  await close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
