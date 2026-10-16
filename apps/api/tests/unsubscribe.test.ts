import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  contactFor,
  createClient,
  createDatabase,
  recordConsent,
  resolveGuest,
  signUnsubscribeToken,
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
const SECRET = "unsubscribe-test-secret";
const errors: unknown[] = [];
const app = createApp({ db, unsubscribeSecret: SECRET, onError: (e) => errors.push(e) });

let clientId: string;
let guestId: string;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    clientId = (await createClient(tx, { name: "Casa Olivo", slug: `unsub-olivo-${suffix}` })).id;
  });
  await withTenant(db, clientId, async (tx) => {
    guestId = await resolveGuest(tx, clientId, { email: `unsub-${suffix}@guest.test` });
    await recordConsent(tx, guestId, "email", "marketing", "qr");
    await recordConsent(tx, guestId, "email", "transactional", "qr");
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`unsub-%-${suffix}`}`),
  );
  await admin.close();
  await close();
  expect(errors).toEqual([]);
});

const allowed = () =>
  withTenant(
    db,
    clientId,
    async (tx) => (await contactFor(tx, guestId, "email", "marketing")).allowed,
  );

describe("the unsubscribe routes", () => {
  test("a valid token confirms on GET info and withdraws consent on POST; repeating is harmless", async () => {
    const token = signUnsubscribeToken(SECRET, clientId, guestId);
    expect((await app.request(`/u/${token}/info`)).status).toBe(200);
    expect(await allowed()).toBe(true);
    const first = await app.request(`/u/${token}`, { method: "POST" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(await allowed()).toBe(false);
    const again = await app.request(`/u/${token}`, { method: "POST" });
    expect(again.status).toBe(200);
  });

  test("the one-click form post of a mail client (List-Unsubscribe=One-Click) works too", async () => {
    const guest2 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `unsub2-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    const token = signUnsubscribeToken(SECRET, clientId, guest2);
    const res = await app.request(`/u/${token}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(res.status).toBe(200);
    expect(
      await withTenant(
        db,
        clientId,
        async (tx) => (await contactFor(tx, guest2, "email", "marketing")).allowed,
      ),
    ).toBe(false);
  });

  test("a tampered token, another secret and junk are 404 and change nothing", async () => {
    const g3 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `unsub3-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    const good = signUnsubscribeToken(SECRET, clientId, g3);
    for (const bad of [
      `${good}x`,
      signUnsubscribeToken("other", clientId, g3),
      "junk",
      good.replace(g3, guestId),
    ]) {
      expect((await app.request(`/u/${bad}`, { method: "POST" })).status).toBe(404);
      expect((await app.request(`/u/${bad}/info`)).status).toBe(404);
    }
    expect(
      await withTenant(
        db,
        clientId,
        async (tx) => (await contactFor(tx, g3, "email", "marketing")).allowed,
      ),
    ).toBe(true);
  });

  test("an erased guest is not an error", async () => {
    const g4 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `unsub4-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    await admin.unsafe("update core.guests set erased_at = now() where id = $1", [g4]);
    const res = await app.request(`/u/${signUnsubscribeToken(SECRET, clientId, g4)}`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
  });

  test("without a secret the routes are not mounted", async () => {
    const bare = createApp({ db });
    expect((await bare.request("/u/anything", { method: "POST" })).status).toBe(404);
  });
});
