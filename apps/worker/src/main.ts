import { createDatabase, createEventBus } from "@atrium/core";
import { jsonLogger, startWorker } from "./worker";

const { db, close } = createDatabase();
const bus = createEventBus(db);
const worker = await startWorker({
  db,
  bus,
  config: {
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
    ...(process.env.ADMIN_BASE_URL ? { adminBaseUrl: process.env.ADMIN_BASE_URL } : {}),
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
