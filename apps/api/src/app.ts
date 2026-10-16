import type { AtriumEvent } from "@atrium/contracts";
import { SignalBatch } from "@atrium/contracts";
import type { Database, NotificationTransport, Tx } from "@atrium/core";
import {
  authenticateToken,
  IngestionRejected,
  ingestSignals,
  type Principal,
  type Problem,
} from "@atrium/signals";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { mountCases, type SessionDeps } from "./cases";
import { mountOnboardingPublic } from "./onboarding";
import { mountQrSurvey, mountSurvey } from "./survey";
import { mountUnsubscribe } from "./unsubscribe";
import { mountWebhooks } from "./webhooks";

export type AppDeps = {
  db: Database;
  /** Enqueues an event inside the ingestion transaction. `bus.publish` has this shape. */
  publish?: (event: AtriumEvent, tx: Tx) => Promise<void>;
  /** How mail leaves. Without it the development transport records and sends nothing. */
  transport?: NotificationTransport;
  now?: () => Date;
  onError?: (error: unknown) => void;
  /** Better Auth and the agency slug. Without it the case routes and sign-in are not mounted. */
  session?: SessionDeps;
  /** The secret that signs unsubscribe links. Without it the unsubscribe routes are not mounted. */
  unsubscribeSecret?: string;
  /** The secret that signs Resend's webhooks. Without it the webhook route is not mounted. */
  resendWebhookSecret?: string;
};

/** Cap on what an error response repeats back: a bad batch can have thousands of problems. */
const MAX_REPORTED = 50;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const ErrorBody = z.object({ error: z.string() });
const ProblemBody = z.object({
  index: z.number().int(),
  code: z.string(),
  message: z.string(),
});
const RejectedBody = z.object({
  error: z.literal("rows_rejected"),
  total: z.number().int(),
  problems: z.array(ProblemBody),
});
const InvalidBody = z.object({
  error: z.literal("invalid_request"),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});

const ingestRoute = createRoute({
  method: "post",
  path: "/v1/signals",
  summary: "Ingest signal rows",
  description:
    "Idempotent and all or nothing. A row with the same date, location, source, platform, " +
    "element and type replaces the earlier value, so a connector can always retry.",
  security: [{ connectorToken: [] }],
  request: {
    body: { required: true, content: { "application/json": { schema: SignalBatch } } },
  },
  responses: {
    200: {
      description: "Every row was written.",
      content: {
        "application/json": {
          schema: z.object({
            inserted: z.number().int(),
            updated: z.number().int(),
            clients: z.number().int(),
          }),
        },
      },
    },
    401: {
      description: "Missing, unknown or revoked token.",
      content: { "application/json": { schema: ErrorBody } },
    },
    403: {
      description: "A row is outside the token's sources or clients.",
      content: { "application/json": { schema: RejectedBody } },
    },
    413: { description: "Body over 4 MB.", content: { "application/json": { schema: ErrorBody } } },
    422: {
      description: "Malformed rows, or rows that break a rule.",
      content: { "application/json": { schema: z.union([InvalidBody, RejectedBody]) } },
    },
  },
});

const FORBIDDEN_CODES = new Set(["source_not_permitted", "location_not_permitted"]);

function rejected(problems: Problem[]) {
  return {
    error: "rows_rejected" as const,
    total: problems.length,
    problems: problems.slice(0, MAX_REPORTED),
  };
}

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<{ Variables: { principal: Principal } }>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: "invalid_request" as const,
            issues: result.error.issues.slice(0, MAX_REPORTED).map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          422,
        );
      }
    },
  });

  app.openAPIRegistry.registerComponent("securitySchemes", "connectorToken", {
    type: "http",
    scheme: "bearer",
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use(
    "/v1/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "payload_too_large" }, 413),
    }),
  );

  // Authentication runs before the body is parsed: an anonymous caller gets a 401, not a
  // validation report that teaches it the shape of the API.
  app.use("/v1/*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    const principal =
      scheme?.toLowerCase() === "bearer" && token ? await authenticateToken(deps.db, token) : null;
    if (!principal) return c.json({ error: "unauthorized" }, 401, { "www-authenticate": "Bearer" });
    c.set("principal", principal);
    await next();
  });

  app.openapi(ingestRoute, async (c) => {
    const { rows } = c.req.valid("json");
    try {
      const result = await ingestSignals(deps.db, c.get("principal"), rows, {
        ...(deps.publish ? { publish: deps.publish } : {}),
        ...(deps.now ? { now: deps.now } : {}),
      });
      return c.json(result, 200);
    } catch (error) {
      if (error instanceof IngestionRejected) {
        const status = error.problems.some((p) => FORBIDDEN_CODES.has(p.code)) ? 403 : 422;
        return c.json(rejected(error.problems), status);
      }
      throw error;
    }
  });

  mountSurvey(app, deps);
  mountUnsubscribe(app, deps);
  mountQrSurvey(app, deps);
  mountOnboardingPublic(app, deps);
  mountWebhooks(app, deps);
  if (deps.session) mountCases(app, deps, deps.session);

  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Atrium API", version: "0.1.0" },
  });

  app.onError((error, c) => {
    // Errors Hono raises on purpose (a body that is not JSON) keep their status and say nothing
    // else. Anything unexpected is a 500 with no detail, and goes to the reporter.
    if (error instanceof HTTPException) {
      return c.json(
        { error: error.status === 400 ? "malformed_request" : "http_error" },
        error.status,
      );
    }
    deps.onError?.(error);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
