import { type Auth, can, resolveScope, type Scope, withScope } from "@atrium/core";
import {
  advanceCase,
  CaseForbiddenError,
  CaseNotFoundError,
  CaseTransitionError,
  getCaseDetail,
  listCaseSummaries,
} from "@atrium/reputation";
import { Hono } from "hono";
import type { AppDeps } from "./app";
import { mountSurveyAdmin } from "./surveys-admin";

export type SessionDeps = {
  auth: Auth;
  agencySlug: string;
  /** Signs QR links. */
  surveySecret?: string | undefined;
  /** The Hub's public origin, where survey links point. */
  hubUrl?: string | undefined;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["open", "contacted", "resolved"] as const;
const NOTE_MAX = 1000;

type Vars = { scope: Scope; userName: string };

/**
 * What the Manager and the Platform read and do about recovery cases. Authenticated by the
 * Better Auth session cookie, not a connector token. The role comes from the database
 * membership (`resolveScope`), and RLS decides which clients' cases a scope can see: this code
 * never filters by client.
 */
export function mountCases(app: Hono<any>, deps: AppDeps, session: SessionDeps) {
  app.on(["GET", "POST"], "/api/auth/*", (c) => session.auth.handler(c.req.raw));

  const api = new Hono<{ Variables: Vars }>();

  api.use("*", async (c, next) => {
    const found = await session.auth.api.getSession({ headers: c.req.raw.headers });
    if (!found) return c.json({ error: "unauthorized" }, 401);
    const scope = await resolveScope(
      deps.db,
      {
        userId: found.user.id,
        activeOrganizationId: (found.session as { activeOrganizationId?: string | null })
          .activeOrganizationId,
      },
      session.agencySlug,
    );
    if (!scope) return c.json({ error: "forbidden" }, 403);
    c.set("scope", scope);
    c.set("userName", found.user.name);
    await next();
  });

  api.get("/me", (c) => {
    const scope = c.get("scope");
    return c.json({
      userId: scope.userId,
      name: c.get("userName"),
      role: scope.role,
      kind: scope.kind,
      canWorkCases: can(scope.role, "task", "work"),
      canReadSurveys: can(scope.role, "survey", "read"),
      canViewForms: can(scope.role, "survey", "forms"),
      canOperateSurveys: can(scope.role, "survey", "operate"),
      canManageSurveys: can(scope.role, "survey", "manage"),
      canRequestSurveys: can(scope.role, "survey", "request"),
    });
  });

  api.get("/cases", async (c) => {
    const status = c.req.query("status");
    if (status !== undefined && !(STATUSES as readonly string[]).includes(status)) {
      return c.json({ error: "invalid_status" }, 422);
    }
    const cases = await withScope(deps.db, c.get("scope"), (tx) =>
      listCaseSummaries(tx, status as (typeof STATUSES)[number] | undefined),
    );
    return c.json({ cases });
  });

  api.get("/cases/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
    const found = await withScope(deps.db, c.get("scope"), (tx) => getCaseDetail(tx, id));
    return found ? c.json({ case: found }) : c.json({ error: "not_found" }, 404);
  });

  api.post("/cases/:id/advance", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      to?: unknown;
      note?: unknown;
    } | null;
    const to = body?.to;
    const note = body?.note ?? null;
    if (to !== "contacted" && to !== "resolved") return c.json({ error: "invalid_request" }, 422);
    if (note !== null && (typeof note !== "string" || note.length > NOTE_MAX)) {
      return c.json({ error: "invalid_request" }, 422);
    }
    try {
      await withScope(deps.db, c.get("scope"), (tx) =>
        advanceCase(tx, c.get("scope"), id, to, note?.trim() || null, {
          ...(deps.publish ? { publish: deps.publish } : {}),
          ...(deps.now ? { now: deps.now } : {}),
        }),
      );
      const updated = await withScope(deps.db, c.get("scope"), (tx) => getCaseDetail(tx, id));
      return c.json({ case: updated });
    } catch (error) {
      if (error instanceof CaseForbiddenError) return c.json({ error: "forbidden" }, 403);
      if (error instanceof CaseNotFoundError) return c.json({ error: "not_found" }, 404);
      if (error instanceof CaseTransitionError) {
        return c.json({ error: "invalid_transition", message: error.message }, 409);
      }
      throw error;
    }
  });

  mountSurveyAdmin(api, deps, {
    qrSecret: session.surveySecret,
    hubUrl: (session.hubUrl ?? "http://localhost:3004").replace(/\/$/, ""),
  });

  app.route("/api", api);
}
