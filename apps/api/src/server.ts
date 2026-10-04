import { createDatabase, createEventBus } from "@atrium/core";
import { createApp } from "./app";

const { db, close } = createDatabase();
const bus = createEventBus(db);
await bus.start();

const app = createApp({
  db,
  publish: (event, tx) => bus.publish(event, tx),
  onError: (error) => console.error(JSON.stringify({ level: "error", message: String(error) })),
});

const server = Bun.serve({ port: Number(process.env.PORT ?? 3001), fetch: app.fetch });
console.log(JSON.stringify({ level: "info", message: `api listening on ${server.port}` }));

async function shutdown() {
  await server.stop();
  await bus.stop();
  await close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
