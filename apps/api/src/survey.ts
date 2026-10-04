import { SurveySubmission } from "@atrium/contracts";
import {
  DeviceLimitError,
  InvalidSubmissionError,
  InvitationUnavailableError,
  resolveInvitation,
  submitSurvey,
} from "@atrium/reputation";
import type { Hono } from "hono";
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
