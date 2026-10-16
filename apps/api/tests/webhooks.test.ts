// apps/api/tests/webhooks.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  createClient,
  createDatabase,
  recordConsent,
  resolveGuest,
  sendToGuest,
  withAgency,
  withTenant,
} from "@atrium/core";
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
const secretBytes = Buffer.from(`webhook-test-secret-${suffix}`);
const SECRET = `whsec_${secretBytes.toString("base64")}`;
const NOW = new Date("2026-10-15T12:00:00Z");
const errors: unknown[] = [];
const app = createApp({
  db,
  resendWebhookSecret: SECRET,
  now: () => NOW,
  onError: (e) => errors.push(e),
});
let clientId: string;
let guestId: string;

const signed = (payload: unknown, overrides: Record<string, string> = {}) => {
  const body = JSON.stringify(payload);
  const id = `evt_${crypto.randomUUID()}`;
  const ts = String(Math.floor(NOW.getTime() / 1000));
  const signature = `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
  return {
    body,
    headers: {
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": signature,
      "content-type": "application/json",
      ...overrides,
    },
  };
};
const post = (r: { body: string; headers: Record<string, string> }) =>
  app.request("/webhooks/resend", { method: "POST", ...r });
const statusOf = async (providerId: string) =>
  (
    (await admin.unsafe("select status from core.notifications where provider_id = $1", [
      providerId,
    ])) as { status: string }[]
  )[0]?.status;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    clientId = (await createClient(tx, { name: "Casa Olivo", slug: `hook-${suffix}` })).id;
  });
  await withTenant(db, clientId, async (tx) => {
    guestId = await resolveGuest(tx, clientId, { email: `hook-${suffix}@guest.test` });
    await recordConsent(tx, guestId, "email", "marketing", "qr");
    await sendToGuest(
      tx,
      {
        clientId,
        guestId,
        channel: "email",
        purpose: "marketing",
        kind: "reputation.review_request",
        subject: "s",
        body: "b",
      },
      { name: "fake", deliver: async () => ({ status: "sent", providerId: `msg_${suffix}` }) },
    );
  });
});
afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`hook-${suffix}`}`),
  );
  await admin.close();
  await close();
  expect(errors).toEqual([]);
});

describe("POST /webhooks/resend", () => {
  test("no signature, a wrong one, a stale timestamp and a tampered body are 401 and change nothing", async () => {
    const good = signed({ type: "email.delivered", data: { email_id: `msg_${suffix}` } });
    expect(
      (await app.request("/webhooks/resend", { method: "POST", body: good.body })).status,
    ).toBe(401);
    expect(
      (await post({ ...good, headers: { ...good.headers, "svix-signature": "v1,AAAA" } })).status,
    ).toBe(401);
    expect(
      (await post({ ...good, headers: { ...good.headers, "svix-timestamp": "1" } })).status,
    ).toBe(401);
    expect((await post({ ...good, body: good.body.replace("delivered", "bounced") })).status).toBe(
      401,
    );
    expect(await statusOf(`msg_${suffix}`)).toBe("sent");
  });

  test("a signed delivered event updates the status; unknown ids and other event types answer 200", async () => {
    const delivered = await post(
      signed({ type: "email.delivered", data: { email_id: `msg_${suffix}` } }),
    );
    expect(delivered.status).toBe(200);
    expect(await statusOf(`msg_${suffix}`)).toBe("delivered");
    expect(
      (await post(signed({ type: "email.delivered", data: { email_id: "msg_nope" } }))).status,
    ).toBe(200);
    expect(
      (await post(signed({ type: "email.opened", data: { email_id: `msg_${suffix}` } }))).status,
    ).toBe(200);
    expect(await statusOf(`msg_${suffix}`)).toBe("delivered");
  });

  test("a signed bounce marks the message and blocks the guest; a transient bounce changes nothing", async () => {
    const transient = await post(
      signed({
        type: "email.bounced",
        data: { email_id: `msg_${suffix}`, bounce: { type: "Transient" } },
      }),
    );
    expect(transient.status).toBe(200);
    expect(await statusOf(`msg_${suffix}`)).toBe("delivered");
    const hard = await post(
      signed({
        type: "email.bounced",
        data: { email_id: `msg_${suffix}`, bounce: { type: "Permanent" } },
      }),
    );
    expect(hard.status).toBe(200);
    expect(await statusOf(`msg_${suffix}`)).toBe("bounced");
    const rows = (await admin.unsafe(
      "select granted from core.consents where guest_id = $1 order by seq desc limit 1",
      [guestId],
    )) as { granted: boolean }[];
    expect(rows[0]?.granted).toBe(false);
  });

  test("an invalid JSON body with a valid signature is 400; without a secret the route is not mounted", async () => {
    const body = "not json";
    const id = "evt_x";
    const ts = String(Math.floor(NOW.getTime() / 1000));
    const signature = `v1,${createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
    const res = await app.request("/webhooks/resend", {
      method: "POST",
      body,
      headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": signature },
    });
    expect(res.status).toBe(400);
    const bare = createApp({ db });
    expect((await bare.request("/webhooks/resend", { method: "POST", body: "{}" })).status).toBe(
      404,
    );
  });
});

describe("POST /webhooks/resend: hardening", () => {
  test("an oversize body is 413 with or without a signature, and a normal event still works", async () => {
    const big = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "x", pad: "a".repeat(300 * 1024) },
    });
    expect((await app.request("/webhooks/resend", { method: "POST", body: big })).status).toBe(413);
    expect((await post({ ...signed({ pad: "a".repeat(300 * 1024) }) })).status).toBe(413);
    expect((await post(signed({ type: "email.opened", data: { email_id: "x" } }))).status).toBe(
      200,
    );
  });

  test("a signed body that is not an object is 200 and changes nothing", async () => {
    for (const payload of [null, [], "x", 5]) {
      expect((await post(signed(payload))).status).toBe(200);
    }
  });

  test("only a permanent bounce blocks: undetermined, missing and unknown bounce types change nothing", async () => {
    const g = await withTenant(db, clientId, async (tx) => {
      const x = await resolveGuest(tx, clientId, { email: `hook2-${suffix}@guest.test` });
      await recordConsent(tx, x, "email", "marketing", "qr");
      await sendToGuest(
        tx,
        {
          clientId,
          guestId: x,
          channel: "email",
          purpose: "marketing",
          kind: "reputation.review_request",
          subject: "s",
          body: "b",
        },
        { name: "fake", deliver: async () => ({ status: "sent", providerId: `msg_${suffix}_2` }) },
      );
      return x;
    });
    const id = `msg_${suffix}_2`;
    for (const bounce of [{ type: "Undetermined" }, { type: "Weird" }, undefined]) {
      const res = await post(
        signed({ type: "email.bounced", data: { email_id: id, ...(bounce ? { bounce } : {}) } }),
      );
      expect(res.status).toBe(200);
      expect(await statusOf(id)).toBe("sent");
    }
    const rows = (await admin.unsafe(
      "select granted from core.consents where guest_id = $1 order by seq desc limit 1",
      [g],
    )) as { granted: boolean }[];
    expect(rows[0]?.granted).toBe(true);
  });

  test("a signed complaint marks the message and withdraws consent with its own source", async () => {
    const g = await withTenant(db, clientId, async (tx) => {
      const x = await resolveGuest(tx, clientId, { email: `hook3-${suffix}@guest.test` });
      await recordConsent(tx, x, "email", "marketing", "qr");
      await sendToGuest(
        tx,
        {
          clientId,
          guestId: x,
          channel: "email",
          purpose: "marketing",
          kind: "reputation.review_request",
          subject: "s",
          body: "b",
        },
        { name: "fake", deliver: async () => ({ status: "sent", providerId: `msg_${suffix}_3` }) },
      );
      return x;
    });
    expect(
      (await post(signed({ type: "email.complained", data: { email_id: `msg_${suffix}_3` } })))
        .status,
    ).toBe(200);
    expect(await statusOf(`msg_${suffix}_3`)).toBe("complained");
    const rows = (await admin.unsafe(
      "select granted, source from core.consents where guest_id = $1 order by seq desc limit 1",
      [g],
    )) as { granted: boolean; source: string }[];
    expect(rows[0]).toEqual({ granted: false, source: "email_complaint" });
  });
});
