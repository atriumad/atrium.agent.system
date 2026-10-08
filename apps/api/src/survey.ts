import { SurveySubmission } from "@atrium/contracts";
import {
  clientIdForLocation,
  describeLocations,
  locationStatusFor,
  withTenant,
} from "@atrium/core";
import {
  DeviceLimitError,
  getLocationSettings,
  hashDevice,
  InvalidSubmissionError,
  InvitationUnavailableError,
  resolveInvitation,
  submitSurvey,
  verifyQrToken,
} from "@atrium/reputation";
import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppDeps } from "./app";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const page = (body: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>How was your visit?</title><body style="font-family:system-ui;max-width:28rem;margin:2rem auto;padding:0 1rem">${body}</body></html>`;

/**
 * The guest-facing survey: the page a review request links to. Public by design, so it lives
 * outside `/v1` and carries no connector token; the invitation token in the path is the credential.
 * This is a plain page for testing the flow. The real survey UI replaces it.
 */
export function mountSurvey(app: Hono<any>, deps: AppDeps) {
  // What the Hub survey page needs before it draws the form: the venue name, or why the link is dead.
  app.get("/s/:token/info", async (c) => {
    const resolved = await resolveInvitation(deps.db, c.req.param("token"), deps.now?.());
    if (!resolved.ok) return c.json({ error: resolved.reason }, 410);
    return c.json({ locationName: resolved.target.locationName });
  });

  app.get("/s/:token", async (c) => {
    const resolved = await resolveInvitation(deps.db, c.req.param("token"), deps.now?.());
    if (!resolved.ok) {
      return c.html(
        page(`<h1>This link is ${resolved.reason === "used" ? "already used" : "not valid"}.</h1>`),
        410,
      );
    }
    const name = escape(resolved.target.locationName);
    return c.html(
      page(`<h1>How was ${name}?</h1>
<form id="f">
  <p>Rating: ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}" required> ${n}</label>`).join(" ")}</p>
  <p><textarea name="comment" maxlength="1000" placeholder="Comment (optional)" style="width:100%"></textarea></p>
  <p><label><input type="checkbox" name="wantsContact"> Contact me about this</label></p>
  <p><input name="contactEmail" type="email" placeholder="Email (only if you want contact)"></p>
  <button>Send</button>
</form>
<p id="out"></p>
<script>
f.onsubmit = async (e) => {
  e.preventDefault();
  const d = new FormData(f);
  const res = await fetch(location.pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rating: Number(d.get("rating")),
      comment: d.get("comment") || null,
      wantsContact: d.get("wantsContact") === "on",
      contactEmail: d.get("contactEmail") || null,
    }),
  });
  const body = await res.json();
  out.innerHTML = res.ok
    ? 'Thank you!' + (body.reviewUrl ? ' <a href="' + body.reviewUrl + '">Leave a Google review</a>' : '')
    : 'Could not send: ' + (body.error || res.status);
};
</script>`),
    );
  });

  app.post("/s/:token", async (c) => {
    const parsed = SurveySubmission.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
    try {
      const result = await submitSurvey(
        deps.db,
        { kind: "invitation", token: c.req.param("token") },
        parsed.data,
        {
          ...(deps.publish ? { publish: deps.publish } : {}),
          ...(deps.now ? { now: deps.now } : {}),
        },
      );
      return c.json({ ok: true, reviewUrl: result.reviewUrl });
    } catch (error) {
      if (error instanceof InvitationUnavailableError) return c.json({ error: error.message }, 410);
      if (error instanceof InvalidSubmissionError) return c.json({ error: error.message }, 422);
      if (error instanceof DeviceLimitError) return c.json({ error: "already_answered" }, 429);
      throw error;
    }
  });
}

const DEVICE_COOKIE = "atr_dev";

/**
 * The printed QR: a signed, multi-use link per location with no row behind it. Rotating the
 * location's QR version kills every copy already printed. One anonymous answer per device per
 * window, told apart by a cookie that is stored only as a salted hash.
 */
export function mountQrSurvey(app: Hono<any>, deps: AppDeps) {
  const secret = deps.session?.surveySecret;

  const resolve = async (token: string) => {
    if (!secret) return null;
    const parsed = verifyQrToken(secret, token);
    if (!parsed) return null;
    const clientId = await clientIdForLocation(deps.db, parsed.locationId);
    if (!clientId) return null;
    if ((await locationStatusFor(deps.db, parsed.locationId)) !== "active") return null;
    return withTenant(deps.db, clientId, async (tx) => {
      const settings = await getLocationSettings(tx, parsed.locationId);
      if (settings.qrVersion !== parsed.version) return null;
      const label = (await describeLocations(tx, [parsed.locationId])).get(parsed.locationId);
      return label
        ? { clientId, locationId: parsed.locationId, locationName: label.locationName }
        : null;
    });
  };

  app.get("/q/:token/info", async (c) => {
    const found = await resolve(c.req.param("token"));
    if (!found) return c.json({ error: "unknown" }, 410);
    return c.json({ locationName: found.locationName });
  });

  app.post("/q/:token", async (c) => {
    const parsed = SurveySubmission.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_request" }, 422);
    const found = await resolve(c.req.param("token"));
    if (!found || !secret) return c.json({ error: "unknown" }, 410);

    let deviceId = getCookie(c, DEVICE_COOKIE);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      setCookie(c, DEVICE_COOKIE, deviceId, {
        httpOnly: true,
        sameSite: "Lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    try {
      const result = await submitSurvey(
        deps.db,
        {
          kind: "qr",
          clientId: found.clientId,
          locationId: found.locationId,
          deviceHash: hashDevice(secret, deviceId),
        },
        parsed.data,
        {
          ...(deps.publish ? { publish: deps.publish } : {}),
          ...(deps.now ? { now: deps.now } : {}),
        },
      );
      return c.json({ ok: true, reviewUrl: result.reviewUrl });
    } catch (error) {
      if (error instanceof InvalidSubmissionError) return c.json({ error: error.message }, 422);
      if (error instanceof DeviceLimitError) return c.json({ error: "already_answered" }, 429);
      throw error;
    }
  });
}
