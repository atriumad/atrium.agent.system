import { createAuth, createDatabase, createEventBus, createSetupLinkCapture } from "@atrium/core";
import { createApp } from "./app";

const { db, close } = createDatabase();
const bus = createEventBus(db);
await bus.start();

// Sign-in and the case routes need a secret; without one the API still takes connector traffic.
const secret = process.env.BETTER_AUTH_SECRET;
const agencySlug = process.env.AGENCY_SLUG ?? "atrium";
const setup = createSetupLinkCapture();
const session = secret
  ? {
      auth: createAuth(db, {
        secret,
        baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
        agencySlug,
        onPasswordSetup: setup.onPasswordSetup,
        trustedOrigins: (
          process.env.TRUSTED_ORIGINS ?? "http://localhost:3002,http://localhost:3003"
        )
          .split(",")
          .filter(Boolean),
      }),
      agencySlug,
      surveySecret: process.env.SURVEY_SECRET ?? secret,
      hubUrl: process.env.HUB_URL ?? "http://localhost:3004",
      setup,
      platformUrl: process.env.PLATFORM_URL ?? "http://localhost:3003",
    }
  : undefined;
if (!session)
  console.log(
    JSON.stringify({
      level: "warn",
      message: "BETTER_AUTH_SECRET unset: sign-in and case routes are off",
    }),
  );

const app = createApp({
  db,
  ...(session ? { session } : {}),
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
