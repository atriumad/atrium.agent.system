import { createAgentsClient } from "@atrium/contracts";
import { createDatabase, createEventBus } from "@atrium/core";
import { jsonLogger, startWorker } from "./worker";

const url = process.env.AGENTS_URL;
const token = process.env.AGENTS_SERVICE_TOKEN;
if (!url || !token) {
  jsonLogger.error("worker.cannot_start", {
    reason: "AGENTS_URL and AGENTS_SERVICE_TOKEN must be set",
  });
  process.exit(1);
}

const { db, close } = createDatabase();
const bus = createEventBus(db);
const worker = await startWorker({
  db,
  bus,
  config: { agents: createAgentsClient({ url, token }) },
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
