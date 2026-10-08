import {
  listUserNotifications,
  markUserNotificationsRead,
  type Scope,
  withScope,
} from "@atrium/core";
import type { Hono } from "hono";
import type { AppDeps } from "./app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;

type Env = { Variables: { scope: Scope; userName: string } };

/** What was sent to the signed-in person, and marking it read. Never anyone else's. */
export function mountNotifications(api: Hono<Env>, deps: AppDeps) {
  api.get("/notifications", async (c) => {
    const scope = c.get("scope");
    const found = await withScope(deps.db, scope, (tx) => listUserNotifications(tx, scope.userId));
    return c.json(found);
  });

  api.post("/notifications/read", async (c) => {
    const scope = c.get("scope");
    const body = (await c.req.json().catch(() => null)) as {
      ids?: unknown;
      all?: unknown;
    } | null;
    let which: { ids: string[] } | { all: true };
    if (body?.all === true) which = { all: true };
    else if (
      Array.isArray(body?.ids) &&
      body.ids.length > 0 &&
      body.ids.length <= MAX_IDS &&
      body.ids.every((id) => typeof id === "string" && UUID.test(id))
    ) {
      which = { ids: body.ids as string[] };
    } else return c.json({ error: "invalid_request" }, 422);
    await withScope(deps.db, scope, (tx) =>
      markUserNotificationsRead(tx, scope.userId, which, deps.now?.()),
    );
    return c.json({ ok: true });
  });
}
