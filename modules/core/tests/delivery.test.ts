// modules/core/tests/delivery.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  applyDeliveryEvent,
  contactFor,
  createClient,
  createDatabase,
  recordConsent,
  resolveGuest,
  sendToGuest,
  withAgency,
  withTenant,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";
const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
let clientId: string;
let guestId: string;

const statusOf = async (providerId: string) =>
  (
    (await admin.unsafe("select status from core.notifications where provider_id = $1", [
      providerId,
    ])) as { status: string }[]
  )[0]?.status;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    clientId = (await createClient(tx, { name: "Casa Olivo", slug: `delivery-${suffix}` })).id;
  });
  await withTenant(db, clientId, async (tx) => {
    guestId = await resolveGuest(tx, clientId, { email: `delivery-${suffix}@guest.test` });
    await recordConsent(tx, guestId, "email", "marketing", "qr");
  });
});
afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`delivery-${suffix}`}`),
  );
  await admin.close();
  await close();
});

async function send(providerId: string) {
  await withTenant(db, clientId, (tx) =>
    sendToGuest(
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
      { name: "fake", deliver: async () => ({ status: "sent", providerId }) },
    ),
  );
}

describe("delivery events", () => {
  test("delivered moves a sent message forward; a repeat and an older status change nothing", async () => {
    const id = `msg_${suffix}_a`;
    await send(id);
    expect(await applyDeliveryEvent(db, { type: "delivered", providerId: id })).toBe("applied");
    expect(await statusOf(id)).toBe("delivered");
    expect(await applyDeliveryEvent(db, { type: "delivered", providerId: id })).toBe("ignored");
  });

  test("an unknown provider id is ignored", async () => {
    expect(await applyDeliveryEvent(db, { type: "delivered", providerId: "msg_unknown" })).toBe(
      "ignored",
    );
  });

  test("a bounce marks the message and withdraws consent, so the next contact is denied", async () => {
    const id = `msg_${suffix}_b`;
    await send(id);
    expect(
      await withTenant(
        db,
        clientId,
        async (tx) => (await contactFor(tx, guestId, "email", "marketing")).allowed,
      ),
    ).toBe(true);
    expect(await applyDeliveryEvent(db, { type: "bounced", providerId: id })).toBe("applied");
    expect(await statusOf(id)).toBe("bounced");
    const after = await withTenant(db, clientId, (tx) =>
      contactFor(tx, guestId, "email", "marketing"),
    );
    expect(after).toEqual({ allowed: false, reason: "opted_out" });
    const log = (await admin.unsafe(
      "select source from core.consents where guest_id = $1 and granted = false order by seq desc limit 1",
      [guestId],
    )) as { source: string }[];
    expect(log[0]?.source).toBe("email_bounce");
  });

  test("a complaint after a delivery moves it forward and records its own source", async () => {
    const g2 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `delivery2-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    const id = `msg_${suffix}_c`;
    await withTenant(db, clientId, (tx) =>
      sendToGuest(
        tx,
        {
          clientId,
          guestId: g2,
          channel: "email",
          purpose: "marketing",
          kind: "reputation.review_request",
          subject: "s",
          body: "b",
        },
        { name: "fake", deliver: async () => ({ status: "sent", providerId: id }) },
      ),
    );
    await applyDeliveryEvent(db, { type: "delivered", providerId: id });
    expect(await applyDeliveryEvent(db, { type: "complained", providerId: id })).toBe("applied");
    expect(await statusOf(id)).toBe("complained");
    const log = (await admin.unsafe(
      "select source from core.consents where guest_id = $1 and granted = false order by seq desc limit 1",
      [g2],
    )) as { source: string }[];
    expect(log[0]?.source).toBe("email_complaint");
  });

  test("a status never moves backwards: delivered after a bounce is ignored", async () => {
    const g3 = await withTenant(db, clientId, async (tx) => {
      const g = await resolveGuest(tx, clientId, { email: `delivery3-${suffix}@guest.test` });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    const id = `msg_${suffix}_d`;
    await withTenant(db, clientId, (tx) =>
      sendToGuest(
        tx,
        {
          clientId,
          guestId: g3,
          channel: "email",
          purpose: "marketing",
          kind: "reputation.review_request",
          subject: "s",
          body: "b",
        },
        { name: "fake", deliver: async () => ({ status: "sent", providerId: id }) },
      ),
    );
    await applyDeliveryEvent(db, { type: "bounced", providerId: id });
    expect(await applyDeliveryEvent(db, { type: "delivered", providerId: id })).toBe("ignored");
    expect(await statusOf(id)).toBe("bounced");
  });
});
