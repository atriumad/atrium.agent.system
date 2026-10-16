// apps/api/src/webhooks.ts
import { applyDeliveryEvent, verifySvixSignature } from "@atrium/core";
import type { Hono } from "hono";
import type { AppDeps } from "./app";

const EVENTS = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
} as const;

/**
 * Resend's events. Public, but signed: nothing is parsed before the signature checks out, and an
 * event cannot change anything else than the status of a message we sent. Opens and clicks are
 * not handled. A transient bounce is a delay, not a verdict, so it changes nothing.
 */
export function mountWebhooks(app: Hono<any>, deps: AppDeps) {
  const secret = deps.resendWebhookSecret;
  if (!secret) return;

  app.post("/webhooks/resend", async (c) => {
    const body = await c.req.text();
    const valid = verifySvixSignature({
      secret,
      id: c.req.header("svix-id"),
      timestamp: c.req.header("svix-timestamp"),
      signature: c.req.header("svix-signature"),
      body,
      now: deps.now?.() ?? new Date(),
    });
    if (!valid) return c.json({ error: "unauthorized" }, 401);

    let event: { type?: unknown; data?: { email_id?: unknown; bounce?: { type?: unknown } } };
    try {
      event = JSON.parse(body);
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    const type =
      typeof event.type === "string" ? EVENTS[event.type as keyof typeof EVENTS] : undefined;
    const providerId = event.data?.email_id;
    if (!type || typeof providerId !== "string") return c.json({ ok: true });
    if (type === "bounced" && event.data?.bounce?.type === "Transient") return c.json({ ok: true });

    await applyDeliveryEvent(
      deps.db,
      { type, providerId },
      {
        ...(deps.publish ? { publish: deps.publish } : {}),
      },
    );
    return c.json({ ok: true });
  });
}
