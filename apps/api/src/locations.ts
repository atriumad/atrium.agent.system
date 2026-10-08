import {
  decideLocation,
  InvalidLocationError,
  LOCATION_ACTIONS,
  type LocationAction,
  LocationForbiddenError,
  LocationNotFoundError,
  LocationStateError,
  listLocationLabels,
  requestLocation,
  type Scope,
  withScope,
} from "@atrium/core";
import type { Hono } from "hono";
import type { AppDeps } from "./app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX = 500;

type Env = { Variables: { scope: Scope; userName: string } };

/**
 * A client asks for a place; the agency decides on it. Role checks live in the use cases and
 * row-level security decides which clients a caller can see: a manager who is not assigned to the
 * client simply finds no such location.
 */
export function mountLocations(api: Hono<Env>, deps: AppDeps) {
  const guard = async (
    c: { json: (b: unknown, s?: any) => Response },
    run: () => Promise<Response>,
  ) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof LocationForbiddenError) return c.json({ error: "forbidden" }, 403);
      if (error instanceof LocationNotFoundError) return c.json({ error: "not_found" }, 404);
      if (error instanceof LocationStateError) {
        return c.json({ error: "invalid_state", message: error.message }, 409);
      }
      if (error instanceof InvalidLocationError) {
        return c.json({ error: "invalid_request", message: error.message }, 422);
      }
      throw error;
    }
  };

  api.get("/locations", async (c) => {
    const rows = await withScope(deps.db, c.get("scope"), (tx) => listLocationLabels(tx));
    return c.json({
      locations: rows.map((l) => ({
        id: l.id,
        name: l.locationName,
        clientId: l.clientId,
        clientName: l.clientName,
        status: l.status,
      })),
    });
  });

  api.post("/locations/request", (c) =>
    guard(c, async () => {
      const body = (await c.req.json().catch(() => null)) as {
        name?: unknown;
        timeZone?: unknown;
      } | null;
      if (typeof body?.name !== "string" || typeof body?.timeZone !== "string") {
        return c.json({ error: "invalid_request" }, 422);
      }
      const scope = c.get("scope");
      const { name, timeZone } = body;
      const id = await withScope(deps.db, scope, (tx) =>
        requestLocation(tx, scope, { name, timeZone }),
      );
      return c.json({ id }, 201);
    }),
  );

  api.post("/locations/:id/decide", (c) =>
    guard(c, async () => {
      const id = c.req.param("id");
      if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
      const body = (await c.req.json().catch(() => null)) as {
        action?: unknown;
        reason?: unknown;
      } | null;
      const action = body?.action;
      const reason = body?.reason ?? null;
      if (typeof action !== "string" || !(LOCATION_ACTIONS as string[]).includes(action)) {
        return c.json({ error: "invalid_request" }, 422);
      }
      if (reason !== null && (typeof reason !== "string" || reason.length > REASON_MAX)) {
        return c.json({ error: "invalid_request" }, 422);
      }
      const scope = c.get("scope");
      const status = await withScope(deps.db, scope, (tx) =>
        decideLocation(tx, scope, id, action as LocationAction, reason?.trim() || null),
      );
      return c.json({ status });
    }),
  );
}
