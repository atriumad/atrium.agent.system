import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  createClient,
  createDatabase,
  eraseGuest,
  listNotifications,
  maskAddress,
  type NotificationTransport,
  recordConsent,
  recordOptOut,
  resolveGuest,
  sendToGuest,
  sendToUser,
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
let a: string;
let b: string;
const userId = `nt-user-${suffix}`;
const guestEmail = (n: string) => `${n}-${suffix}@guest.test`;

const inA = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, a, fn);

const base = (guestId: string) => ({
  clientId: a,
  guestId,
  channel: "email" as const,
  purpose: "marketing" as const,
  kind: "reputation.review_request",
  subject: "How was your visit?",
  body: "Thanks for coming. Tell us how it went: https://example.test/s/abc",
});

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `nt-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `nt-brasa-${suffix}` })).id;
  });
  await admin.unsafe("insert into core.users (id, name, email) values ($1, 'Owner', $2)", [
    userId,
    `owner-${suffix}@casa.test`,
  ]);
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`nt-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.users where id = $1", [userId]);
  await admin.close();
  await close();
});

describe("maskAddress", () => {
  test("keeps the domain of an email and the tail of a phone", () => {
    expect(maskAddress("ana.lopez@mail.com")).toBe("a***@mail.com");
    expect(maskAddress("+17135550142")).toBe("+1******0142");
    expect(maskAddress("123")).toBe("***");
  });
});

describe("sendToGuest", () => {
  test("sends when there is consent, and records only a masked address", async () => {
    const result = await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: guestEmail("ok") });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return sendToGuest(tx, base(g));
    });
    expect(result).toMatchObject({ sent: true, to: "o***@guest.test" });

    const rows = (await admin.unsafe(
      "select to_masked, body, status, transport from core.notifications where client_id = $1",
      [a],
    )) as { to_masked: string; body: string; status: string; transport: string }[];
    expect(rows[0]).toMatchObject({
      status: "recorded",
      transport: "dev",
      to_masked: "o***@guest.test",
    });
    expect(JSON.stringify(rows)).not.toContain(guestEmail("ok"));
  });

  test("no consent means nothing is sent, and nothing is recorded", async () => {
    const before = (await inA((tx) => listNotifications(tx, a))).length;
    const result = await inA(async (tx) =>
      sendToGuest(tx, base(await resolveGuest(tx, a, { email: guestEmail("none") }))),
    );
    expect(result).toEqual({ sent: false, reason: "no_consent" });
    expect((await inA((tx) => listNotifications(tx, a))).length).toBe(before);
  });

  test("an opt-out blocks it, and so does an erased guest", async () => {
    const [optedOut, erased] = await inA(async (tx) => {
      const g1 = await resolveGuest(tx, a, { email: guestEmail("stop") });
      await recordConsent(tx, g1, "email", "marketing", "qr");
      await recordOptOut(tx, g1, "email", "email_unsubscribe");
      const g2 = await resolveGuest(tx, a, { email: guestEmail("gone") });
      await recordConsent(tx, g2, "email", "marketing", "qr");
      await eraseGuest(tx, g2);
      return [await sendToGuest(tx, base(g1)), await sendToGuest(tx, base(g2))];
    });
    expect(optedOut).toEqual({ sent: false, reason: "opted_out" });
    expect(erased).toEqual({ sent: false, reason: "erased" });
  });

  test("sms needs a phone and a consent for sms, not just for email", async () => {
    const result = await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: guestEmail("emailonly") });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return sendToGuest(tx, { ...base(g), channel: "sms" });
    });
    expect(result).toEqual({ sent: false, reason: "no_consent" });
  });

  test("a guest of another client cannot be reached from this scope", async () => {
    const gb = await withTenant(db, b, async (tx) => {
      const g = await resolveGuest(tx, b, { email: guestEmail("other") });
      await recordConsent(tx, g, "email", "marketing", "qr");
      return g;
    });
    expect(await inA((tx) => sendToGuest(tx, base(gb)))).toEqual({
      sent: false,
      reason: "unknown_guest",
    });
  });

  test("the transport receives the real address, once", async () => {
    const delivered: { to: string; body: string }[] = [];
    const spy: NotificationTransport = {
      name: "spy",
      deliver: async (m) => {
        delivered.push({ to: m.to, body: m.body });
        return "sent";
      },
    };
    await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: guestEmail("spy") });
      await recordConsent(tx, g, "email", "marketing", "qr");
      await sendToGuest(tx, base(g), spy);
    });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.to).toBe(guestEmail("spy"));
  });

  test("a malformed kind is refused", async () => {
    await expect(
      inA(async (tx) => sendToGuest(tx, { ...base(crypto.randomUUID()), kind: "Review Request" })),
    ).rejects.toThrow("invalid notification kind");
  });
});

describe("sendToUser", () => {
  test("tells a person on the team without needing guest consent", async () => {
    const result = await inA((tx) =>
      sendToUser(tx, {
        clientId: a,
        userId,
        kind: "reputation.case_alert",
        subject: "New case",
        body: "A guest had a problem.",
      }),
    );
    expect(result).toMatchObject({ sent: true, to: "o***@casa.test" });
  });

  test("an unknown user is a result, not a crash", async () => {
    const result = await inA((tx) =>
      sendToUser(tx, { clientId: a, userId: "nobody", kind: "reputation.case_alert", body: "x" }),
    );
    expect(result.sent).toBe(false);
  });
});

describe("isolation", () => {
  test("a client reads only its own outbox", async () => {
    await withTenant(db, b, async (tx) =>
      sendToUser(tx, { clientId: b, userId, kind: "reputation.case_alert", body: "for b" }),
    );
    expect((await inA((tx) => listNotifications(tx, b))).length).toBe(0);
    const raw = await inA((tx) =>
      tx.execute<{ n: number }>(
        sql`select count(*)::int as n from core.notifications where body = 'for b'`,
      ),
    );
    expect(raw[0]?.n).toBe(0);
  });

  test("a client cannot write an outbox row for another client", async () => {
    await expect(
      inA((tx) =>
        tx.execute(
          sql`insert into core.notifications (client_id, kind, channel, purpose, recipient_type, recipient_id, to_masked, body) values (${b}, 'x.y', 'email', 'transactional', 'user', 'u', 'x***', 'forged')`,
        ),
      ),
    ).rejects.toThrow();
  });

  test("the outbox is append-only for the app role", async () => {
    await expect(
      inA((tx) => tx.execute(sql`update core.notifications set body = 'edited'`)),
    ).rejects.toThrow();
    await expect(inA((tx) => tx.execute(sql`delete from core.notifications`))).rejects.toThrow();
  });
});
