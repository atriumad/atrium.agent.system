import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AtriumEvent } from "@atrium/contracts";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  canContact,
  contactFor,
  createClient,
  createDatabase,
  eraseGuest,
  IdentityConflictError,
  InvalidContactError,
  recordConsent,
  recordOptOut,
  resolveGuest,
  withAgency,
  withTenant,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
let a: string;
let b: string;

/** Collects events instead of enqueuing them. Same shape as `bus.publish`. */
function recorder() {
  const events: AtriumEvent[] = [];
  return { events, publish: async (e: AtriumEvent) => void events.push(e) };
}

const email = (n: string) => `${n}-${suffix}@guest.test`;
const inA = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, a, fn);

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `g-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `g-brasa-${suffix}` })).id;
  });
});

afterAll(async () => {
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`g-%-${suffix}`}`);
  });
  await close();
});

describe("resolveGuest", () => {
  test("the same email in any format is one guest", async () => {
    const ids = await inA(async (tx) => [
      await resolveGuest(tx, a, { email: email("ana") }),
      await resolveGuest(tx, a, { email: `  ${email("ana").toUpperCase()} ` }),
    ]);
    expect(ids[0]).toBe(ids[1] as string);
  });

  test("a new identifier is attached to the existing guest", async () => {
    const r = recorder();
    const [first, second, third] = await inA(async (tx) => [
      await resolveGuest(tx, a, { email: email("bea") }, r),
      await resolveGuest(tx, a, { email: email("bea"), phone: "(713) 555-0101", name: "Bea" }, r),
      await resolveGuest(tx, a, { phone: "713-555-0101" }, r),
    ]);
    expect(second).toBe(first as string);
    expect(third).toBe(first as string);
    expect(r.events.filter((e) => e.type === "guest.identified")).toHaveLength(1);
  });

  test("concurrent resolves of the same email converge on one guest", async () => {
    const ids = await Promise.all(
      Array.from({ length: 8 }, () => inA((tx) => resolveGuest(tx, a, { email: email("race") }))),
    );
    expect(new Set(ids).size).toBe(1);
  });

  test("the same email under two clients is two guests", async () => {
    const [ga, gb] = await Promise.all([
      withTenant(db, a, (tx) => resolveGuest(tx, a, { email: email("shared") })),
      withTenant(db, b, (tx) => resolveGuest(tx, b, { email: email("shared") })),
    ]);
    expect(ga).not.toBe(gb);
  });

  test("an email and a phone that belong to different guests is a conflict, not a silent merge", async () => {
    const [g1, g2] = await inA(async (tx) => [
      await resolveGuest(tx, a, { email: email("c1") }),
      await resolveGuest(tx, a, { phone: "713-555-0102" }),
    ]);
    const attempt = inA((tx) => resolveGuest(tx, a, { email: email("c1"), phone: "713-555-0102" }));
    await expect(attempt).rejects.toBeInstanceOf(IdentityConflictError);
    await expect(attempt).rejects.toThrow(g1 as string);
    expect(g1).not.toBe(g2);
  });

  test("invalid or missing contacts are rejected", async () => {
    for (const input of [{}, { email: "nope" }, { phone: "555" }, { name: "Only Name" }]) {
      await expect(inA((tx) => resolveGuest(tx, a, input))).rejects.toBeInstanceOf(
        InvalidContactError,
      );
    }
  });

  test("a client cannot see another client's guests, even without a filter", async () => {
    await withTenant(db, b, (tx) => resolveGuest(tx, b, { email: email("only-b") }));
    const rows = await inA((tx) =>
      tx.execute<{ value: string }>(
        sql`select value from core.guest_identifiers where value like ${`%-${suffix}@guest.test`}`,
      ),
    );
    expect(rows.some((r) => r.value === email("only-b"))).toBe(false);
  });
});

describe("consent", () => {
  test("no consent recorded means no contact", async () => {
    const decision = await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("quiet"), phone: "713-555-0103" });
      return contactFor(tx, g, "email", "marketing");
    });
    expect(decision).toEqual({ allowed: false, reason: "no_consent" });
  });

  test("a grant allows exactly its channel and purpose", async () => {
    await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("yes"), phone: "713-555-0104" });
      await recordConsent(tx, g, "email", "marketing", "qr");
      expect(await contactFor(tx, g, "email", "marketing")).toEqual({
        allowed: true,
        address: email("yes"),
      });
      expect((await contactFor(tx, g, "email", "transactional")).allowed).toBe(false);
      expect((await contactFor(tx, g, "sms", "marketing")).allowed).toBe(false);
    });
  });

  test("sms goes to the phone, not the email", async () => {
    await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("both"), phone: "713-555-0105" });
      await recordConsent(tx, g, "sms", "marketing", "pos");
      expect(await contactFor(tx, g, "sms", "marketing")).toEqual({
        allowed: true,
        address: "+17135550105",
      });
    });
  });

  test("consent without an address for the channel is denied", async () => {
    await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("noaddr") });
      await recordConsent(tx, g, "sms", "marketing", "manual");
      expect(await contactFor(tx, g, "sms", "marketing")).toEqual({
        allowed: false,
        reason: "no_contact",
      });
    });
  });

  test("an opt-out ends every purpose on the channel and keeps the other channel", async () => {
    await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("stop"), phone: "713-555-0106" });
      await recordConsent(tx, g, "sms", "marketing", "pos");
      await recordConsent(tx, g, "sms", "transactional", "pos");
      await recordConsent(tx, g, "email", "marketing", "qr");
      await recordOptOut(tx, g, "sms", "sms_stop");
      expect(await contactFor(tx, g, "sms", "marketing")).toEqual({
        allowed: false,
        reason: "opted_out",
      });
      expect(await contactFor(tx, g, "sms", "transactional")).toEqual({
        allowed: false,
        reason: "opted_out",
      });
      expect(await canContact(tx, g, "email", "marketing")).toBe(true);
    });
  });

  test("a later grant overrides an opt-out", async () => {
    await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("back") });
      await recordConsent(tx, g, "email", "marketing", "qr");
      await recordOptOut(tx, g, "email", "email_unsubscribe");
      await recordConsent(tx, g, "email", "marketing", "checkout");
      expect(await canContact(tx, g, "email", "marketing")).toBe(true);
    });
  });

  test("repeating the same decision records nothing and emits nothing", async () => {
    const r = recorder();
    const counts = await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("dup") });
      const first = await recordConsent(tx, g, "email", "marketing", "qr", r);
      const second = await recordConsent(tx, g, "email", "marketing", "qr", r);
      const rows = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from core.consents where guest_id = ${g}`,
      );
      return { first, second, rows: rows[0]?.n };
    });
    expect(counts).toEqual({ first: true, second: false, rows: 1 });
    expect(r.events.filter((e) => e.type === "consent.changed")).toHaveLength(1);
  });

  test("the consent change event carries ids, never the contact", async () => {
    const r = recorder();
    await inA(async (tx) => {
      const g = await resolveGuest(tx, a, { email: email("evt") });
      await recordConsent(tx, g, "email", "marketing", "qr", r);
    });
    const event = r.events.find((e) => e.type === "consent.changed");
    expect(JSON.stringify(event)).not.toContain("@guest.test");
  });

  test("the log is append-only for the app role", async () => {
    const g = await inA(async (tx) => {
      const id = await resolveGuest(tx, a, { email: email("log") });
      await recordConsent(tx, id, "email", "marketing", "qr");
      return id;
    });
    await expect(
      inA((tx) => tx.execute(sql`update core.consents set granted = false where guest_id = ${g}`)),
    ).rejects.toThrow();
    await expect(
      inA((tx) => tx.execute(sql`delete from core.consents where guest_id = ${g}`)),
    ).rejects.toThrow();
  });

  test("an unknown guest is denied", async () => {
    const decision = await inA((tx) => contactFor(tx, crypto.randomUUID(), "email", "marketing"));
    expect(decision).toEqual({ allowed: false, reason: "unknown_guest" });
  });

  test("a guest of another client cannot be contacted from this scope", async () => {
    const gb = await withTenant(db, b, (tx) => resolveGuest(tx, b, { email: email("bg") }));
    await withTenant(db, b, (tx) => recordConsent(tx, gb, "email", "marketing", "qr"));
    const decision = await inA((tx) => contactFor(tx, gb, "email", "marketing"));
    expect(decision).toEqual({ allowed: false, reason: "unknown_guest" });
  });
});

describe("erasure", () => {
  test("removes the contact, keeps the opaque row and the log, and blocks contact", async () => {
    const r = recorder();
    const g = await inA(async (tx) => {
      const id = await resolveGuest(tx, a, {
        email: email("gone"),
        phone: "713-555-0107",
        name: "Gone",
      });
      await recordConsent(tx, id, "email", "marketing", "qr");
      return id;
    });
    const erased = await inA((tx) => eraseGuest(tx, g, r));
    expect(erased).toBe(true);

    await inA(async (tx) => {
      expect(await contactFor(tx, g, "email", "marketing")).toEqual({
        allowed: false,
        reason: "erased",
      });
      const rows = await tx.execute<{
        name: string | null;
        erased_at: Date | null;
        ids: number;
        log: number;
      }>(sql`
        select g.name, g.erased_at,
          (select count(*)::int from core.guest_identifiers where guest_id = g.id) as ids,
          (select count(*)::int from core.consents where guest_id = g.id) as log
        from core.guests g where g.id = ${g}`);
      expect(rows[0]?.name).toBeNull();
      expect(rows[0]?.erased_at).not.toBeNull();
      expect(rows[0]?.ids).toBe(0);
      expect(rows[0]?.log).toBe(1);
    });
    expect(r.events.map((e) => e.type)).toEqual(["guest.erased"]);
  });

  test("is idempotent: a second erasure does nothing and emits nothing", async () => {
    const r = recorder();
    const g = await inA((tx) => resolveGuest(tx, a, { email: email("twice") }));
    expect(await inA((tx) => eraseGuest(tx, g, r))).toBe(true);
    expect(await inA((tx) => eraseGuest(tx, g, r))).toBe(false);
    expect(r.events).toHaveLength(1);
  });

  test("an erased guest cannot receive a new consent", async () => {
    const g = await inA((tx) => resolveGuest(tx, a, { email: email("late") }));
    await inA((tx) => eraseGuest(tx, g));
    await expect(inA((tx) => recordConsent(tx, g, "email", "marketing", "qr"))).rejects.toThrow(
      "erased",
    );
  });

  test("the freed email starts a new guest", async () => {
    const [g1, g2] = await inA(async (tx) => {
      const first = await resolveGuest(tx, a, { email: email("reuse") });
      await eraseGuest(tx, first);
      return [first, await resolveGuest(tx, a, { email: email("reuse") })];
    });
    expect(g2).not.toBe(g1 as string);
  });
});
