import {
  approveOnboardingRequest,
  listOnboardingRequests,
  OnboardingForbiddenError,
  OnboardingNotFoundError,
  OnboardingStateError,
  rejectOnboardingRequest,
  type Scope,
  submitOnboardingRequest,
  withAgency,
} from "@atrium/core";
import type { Hono } from "hono";
import type { AppDeps } from "./app";
import type { SessionDeps } from "./cases";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

type Env = { Variables: { scope: Scope; userName: string } };

/**
 * The public "request access" form. It answers 202 whatever the input, so nobody can learn which
 * emails are already known, and it is limited per address. The limiter lives in memory: one API
 * process, which is how this runs today.
 */
export function mountOnboardingPublic(app: Hono<any>, deps: AppDeps) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const clock = () => (deps.now ? deps.now().getTime() : Date.now());

  app.post("/onboarding/request", async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const now = clock();
    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    else if (++entry.count > MAX_PER_WINDOW) return c.json({ error: "rate_limited" }, 429);

    const body = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const text = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : "");
    await submitOnboardingRequest(deps.db, {
      businessName: text("businessName"),
      ownerName: text("ownerName"),
      ownerEmail: text("ownerEmail"),
      firstLocationName: text("firstLocationName"),
      firstLocationTimeZone: text("firstLocationTimeZone"),
      note: text("note"),
    });
    return c.json({ ok: true }, 202);
  });
}

export function mountOnboardingAdmin(api: Hono<Env>, deps: AppDeps, session: SessionDeps) {
  const guard = async (
    c: { json: (b: unknown, s?: any) => Response },
    run: () => Promise<Response>,
  ) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof OnboardingForbiddenError) return c.json({ error: "forbidden" }, 403);
      if (error instanceof OnboardingNotFoundError) return c.json({ error: "not_found" }, 404);
      if (error instanceof OnboardingStateError) {
        return c.json({ error: "invalid_state", message: error.message }, 409);
      }
      throw error;
    }
  };

  api.get("/onboarding/requests", (c) =>
    guard(c, async () => {
      const scope = c.get("scope");
      // A request belongs to no client yet, so it is read with agency scope; the use case has
      // already refused any role that may not handle onboarding.
      const requests = await withAgency(deps.db, (tx) => listOnboardingRequests(tx, scope));
      return c.json({ requests });
    }),
  );

  api.post("/onboarding/requests/:id/approve", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      if (!session.setup) return c.json({ error: "not_configured" }, 503);
      const result = await approveOnboardingRequest(deps.db, c.get("scope"), id, {
        auth: session.auth,
        setup: session.setup,
        redirectTo: `${(session.platformUrl ?? "http://localhost:3003").replace(/\/$/, "")}/set-password`,
      });
      return c.json(result);
    }),
  );

  api.post("/onboarding/requests/:id/reject", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      const body = (await c.req.json().catch(() => null)) as { reason?: unknown } | null;
      const reason = body?.reason;
      if (typeof reason !== "string" || reason.trim().length === 0 || reason.length > 500) {
        return c.json({ error: "invalid_request" }, 422);
      }
      await rejectOnboardingRequest(deps.db, c.get("scope"), id, reason.trim());
      return c.json({ ok: true });
    }),
  );
}
