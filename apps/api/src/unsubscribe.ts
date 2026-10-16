import { recordOptOut, verifyUnsubscribeToken, withTenant } from "@atrium/core";
import type { Hono } from "hono";
import type { AppDeps } from "./app";

/**
 * The page behind the footer link of an email. The token is the credential and names a guest in a
 * client; a bad token is a plain 404 that says nothing. A repeat is harmless, and an erased guest
 * has nothing left to withdraw, so both answer 200.
 */
export function mountUnsubscribe(app: Hono<any>, deps: AppDeps) {
  const secret = deps.unsubscribeSecret;
  if (!secret) return;

  app.get("/u/:token/info", (c) =>
    verifyUnsubscribeToken(secret, c.req.param("token"))
      ? c.json({ ok: true })
      : c.json({ error: "not_found" }, 404),
  );

  app.post("/u/:token", async (c) => {
    const who = verifyUnsubscribeToken(secret, c.req.param("token"));
    if (!who) return c.json({ error: "not_found" }, 404);
    try {
      await withTenant(deps.db, who.clientId, (tx) =>
        recordOptOut(tx, who.guestId, "email", "email_unsubscribe", {
          ...(deps.publish ? { publish: deps.publish } : {}),
        }),
      );
    } catch (error) {
      if (!(error instanceof Error && /unknown guest|was erased/.test(error.message))) throw error;
    }
    return c.json({ ok: true });
  });
}
