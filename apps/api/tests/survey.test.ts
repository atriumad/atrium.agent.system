import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AtriumEvent } from "@atrium/contracts";
import { createClient, createDatabase, createLocation, withAgency, withTenant } from "@atrium/core";
import {
  generateInvitationToken,
  hashInvitationToken,
  updateLocationSettings,
} from "@atrium/reputation";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createApp } from "../src/app";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const actor = { type: "user", id: `survey-admin-${suffix}` } as const;
const NOW = new Date("2026-10-06T17:00:00Z");
const REVIEW_URL = "https://search.google.com/local/writereview?placeid=SURVEY";

const events: AtriumEvent[] = [];
const errors: unknown[] = [];
const app = createApp({
  db,
  publish: async (e) => void events.push(e),
  now: () => NOW,
  onError: (e) => errors.push(e),
});

let clientId: string;
let locationId: string;

/** An invitation as Ask would have issued it, with the expiry and use the case needs. */
async function invitation(opts: { expiresAt?: Date; usedAt?: Date } = {}): Promise<string> {
  const token = generateInvitationToken();
  await admin.unsafe(
    `insert into reputation.survey_invitations (client_id, location_id, token_hash, channel, expires_at, used_at)
     values ($1, $2, $3, 'email', $4, $5)`,
    [
      clientId,
      locationId,
      hashInvitationToken(token),
      opts.expiresAt ?? new Date(NOW.getTime() + 86_400_000),
      opts.usedAt ?? null,
    ],
  );
  return token;
}

const submit = (token: string, body: unknown, raw?: string) =>
  app.request(`/s/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    clientId = (await createClient(tx, { name: "Casa Olivo", slug: `survey-olivo-${suffix}` })).id;
    locationId = (
      await createLocation(tx, clientId, { name: "Bellaire <b>", timeZone: "America/Chicago" })
    ).id;
    await updateLocationSettings(
      tx,
      clientId,
      locationId,
      { reviewUrl: REVIEW_URL, requestDelayMinutes: 0 },
      actor,
    );
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`survey-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
  expect(errors).toEqual([]);
});

describe("GET /s/:token", () => {
  test("shows the form for a valid link, without a connector token", async () => {
    const res = await app.request(`/s/${await invitation()}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('name="rating"');
  });

  test("escapes the location name", async () => {
    const html = await (await app.request(`/s/${await invitation()}`)).text();
    expect(html).toContain("Bellaire &#60;b&#62;");
    expect(html).not.toContain("Bellaire <b>");
  });

  test("an unknown, malformed, expired or used link is 410", async () => {
    const expired = await invitation({ expiresAt: new Date(NOW.getTime() - 1000) });
    const used = await invitation({ usedAt: new Date(NOW.getTime() - 1000) });
    for (const token of ["svy_nope", "x", generateInvitationToken(), expired, used]) {
      expect((await app.request(`/s/${token}`)).status).toBe(410);
    }
  });
});

describe("POST /s/:token", () => {
  test("stores the response, announces it and returns the review link", async () => {
    const before = events.length;
    const res = await submit(await invitation(), { rating: 5, comment: "Lovely" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reviewUrl: REVIEW_URL });
    const sent = events.slice(before).find((e) => e.type === "survey.response.submitted");
    expect(sent?.clientId).toBe(clientId);
    const rows = await withTenant(db, clientId, (tx) =>
      tx.execute<{ rating: number }>(
        sql`select rating from reputation.survey_responses where comment = 'Lovely'`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rating).toBe(5);
  });

  test("everyone gets the review link, whatever they rate", async () => {
    const res = await submit(await invitation(), { rating: 1 });
    expect(await res.json()).toEqual({ ok: true, reviewUrl: REVIEW_URL });
  });

  test("a link works once", async () => {
    const token = await invitation();
    expect((await submit(token, { rating: 4 })).status).toBe(200);
    const again = await submit(token, { rating: 5 });
    expect(again.status).toBe(410);
    expect(await again.json()).toEqual({ error: "survey link is used" });
  });

  test("an expired or unknown link is 410 and stores nothing", async () => {
    const expired = await invitation({ expiresAt: new Date(NOW.getTime() - 1000) });
    expect((await submit(expired, { rating: 3, comment: "late" })).status).toBe(410);
    expect((await submit("svy_nope", { rating: 3, comment: "late" })).status).toBe(410);
    const rows = await withTenant(db, clientId, (tx) =>
      tx.execute(sql`select 1 from reputation.survey_responses where comment = 'late'`),
    );
    expect(rows).toHaveLength(0);
  });

  test("a rating out of range, a missing rating or a body that is not JSON is 422", async () => {
    const token = await invitation();
    for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, {}, { rating: "5" }]) {
      expect((await submit(token, body)).status).toBe(422);
    }
    expect((await submit(token, null, "{ not json")).status).toBe(422);
    // None of the refusals above used the link up.
    expect((await submit(token, { rating: 4 })).status).toBe(200);
  });

  test("an email that does not look right is 422 and keeps the link usable", async () => {
    const token = await invitation();
    const res = await submit(token, {
      rating: 2,
      wantsContact: true,
      contactEmail: "not-an-email",
    });
    expect(res.status).toBe(422);
    expect((await submit(token, { rating: 2 })).status).toBe(200);
  });
});
