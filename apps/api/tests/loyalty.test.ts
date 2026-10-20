import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  assignClient,
  assignLocation,
  createAgencyOrganization,
  createAuth,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  setPackage,
  withAgency,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { createApp } from "../src/app";
import { usableLoyaltySecret } from "../src/loyalty";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const AGENCY_SLUG = `atrium-loy-${suffix}`;
const PASSWORD = "correct-horse-battery";
const ORIGIN = "http://localhost:3001";
const SECRET = "loyalty-secret-for-api-tests-0123456789";
const CARD_URL = "http://card.test";
const seed = { type: "user", id: `seed-loy-${suffix}` } as const;

// A fixed clock in the middle of a minute and an hour, so no fixed window rolls over mid-test.
const NOW = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + 1_800_000 + 30_000);

const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const auth = createAuth(db, {
  secret: "test-secret-test-secret-test-secret-32",
  baseURL: ORIGIN,
  agencySlug: AGENCY_SLUG,
});
const session = {
  auth,
  agencySlug: AGENCY_SLUG,
  surveySecret: "survey-secret-survey-secret-0001",
};
const app = createApp({
  db,
  now: () => NOW,
  session,
  loyaltySecret: SECRET,
  qrCardUrl: CARD_URL,
});
const proxied = createApp({
  db,
  now: () => NOW,
  session,
  loyaltySecret: SECRET,
  trustProxy: true,
});
const PROXY_SECRET = "q".repeat(32);
const gated = createApp({
  db,
  now: () => NOW,
  session,
  loyaltySecret: SECRET,
  trustProxy: true,
  loyaltyProxySecret: PROXY_SECRET,
});
const tooShort = createApp({
  db,
  now: () => NOW,
  session,
  loyaltySecret: SECRET,
  trustProxy: true,
  loyaltyProxySecret: "s".repeat(8),
});
const off = createApp({ db, now: () => NOW, session });

const cookies: Record<string, string> = {};
let locA = "";
let locA2 = "";
let locB = "";
let locC = "";

const ipHead = `${Number.parseInt(suffix.slice(0, 2), 16)}.${Number.parseInt(suffix.slice(2, 4), 16)}`;
let ipSeq = 0;
const nextIp = () => `${ipHead}.${Math.floor(ipSeq / 250) + 10}.${(ipSeq++ % 250) + 1}`;
let keySeq = 0;
const key = () => `k-${suffix}-${keySeq++}`;

/** Every body a public route sent, to prove none holds a guest or an email. */
const publicBodies: string[] = [];

async function userWith(label: string, orgId: string, role: string, teamRole?: string) {
  const email = `${label}-${suffix}@loy.test`;
  const { user } = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: label } });
  await auth.api.addMember({
    body: {
      userId: user.id,
      organizationId: orgId,
      role,
      ...(teamRole ? { teamRole } : {}),
    } as never,
  });
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  cookies[label] = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return user.id;
}

const call = (label: string, method: string, path: string, body?: unknown, target = app) =>
  target.request(path, {
    method,
    headers: { "content-type": "application/json", cookie: cookies[label] as string },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function pub(
  path: string,
  init: RequestInit & { ip?: string; target?: typeof app } = {},
): Promise<{ res: Response; body: any }> {
  const { ip = nextIp(), target = app, ...rest } = init;
  const res = await target.request(path, rest, { requestIP: () => ({ address: ip }) });
  const text = await res.text();
  publicBodies.push(text);
  return { res, body: text ? JSON.parse(text) : null };
}

const joinBody = (joinToken: string, extra: object = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ joinToken, ...extra }),
});

const PROGRAM = {
  name: "Cafe Olivo Card",
  stampsRequired: 2,
  rewardLabel: "Free coffee",
  cooldownMinutes: 0,
  active: true,
  accent: "lime",
};

async function makeProgram(label: string, locationId: string, extra: object = {}) {
  const res = await call(label, "PUT", "/api/loyalty/program", {
    locationId,
    ...PROGRAM,
    ...extra,
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).program;
}

async function joinTokenOf(label: string, locationId: string): Promise<string> {
  const res = await call(label, "GET", `/api/loyalty/program/join-link?locationId=${locationId}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as any).token;
}

/** Joins with a fresh device and returns the card. */
async function newCard(joinToken: string) {
  const { res, body } = await pub("/v1/loyalty/cards", joinBody(joinToken));
  expect(res.status).toBe(201);
  return body as { token: string; shortCode: string };
}

const stampBody = (locationId: string, card: { shortCode: string }, k = key()) => ({
  locationId,
  code: card.shortCode,
  idempotencyKey: k,
});

const eventCount = async (code: string, kind: string) =>
  (
    await admin.unsafe(
      `select count(*)::int as n from crm.loyalty_events e join crm.loyalty_cards c on c.id = e.card_id
       where c.short_code = $1 and e.kind = $2`,
      [code.replace("-", ""), kind],
    )
  )[0].n as number;

beforeAll(async () => {
  await migrate(ADMIN_URL);
  let agencyOrg = "";
  let orgA = "";
  let orgB = "";
  let orgC = "";
  let clientA = "";
  let clientB = "";
  let clientC = "";
  await withAgency(db, async (tx) => {
    agencyOrg = (await createAgencyOrganization(tx, { name: "Atrium", slug: AGENCY_SLUG })).id;
    const a = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `loy-a-${suffix}`,
    });
    const b = await createClientWithOrganization(tx, {
      name: "Brasa Norte",
      slug: `loy-b-${suffix}`,
    });
    const c = await createClientWithOrganization(tx, {
      name: "Cafe Cerrado",
      slug: `loy-c-${suffix}`,
    });
    clientA = a.client.id;
    clientB = b.client.id;
    clientC = c.client.id;
    orgA = a.organization.id;
    orgB = b.organization.id;
    orgC = c.organization.id;
    locA = (await createLocation(tx, clientA, { name: "Bellaire", timeZone: "America/Chicago" }))
      .id;
    locA2 = (await createLocation(tx, clientA, { name: "Heights", timeZone: "America/Chicago" }))
      .id;
    locB = (await createLocation(tx, clientB, { name: "Norteville", timeZone: "America/Chicago" }))
      .id;
    locC = (await createLocation(tx, clientC, { name: "Cerrado", timeZone: "America/Chicago" })).id;
    await setPackage(tx, clientA, "pillar_3", seed);
    await setPackage(tx, clientB, "pillar_3", seed);
    await setPackage(tx, clientC, "essential", seed);
  });
  await admin.unsafe("update core.locations set status = 'active' where id in ($1, $2, $3, $4)", [
    locA,
    locA2,
    locB,
    locC,
  ]);
  const amId = await userWith("am", agencyOrg, "account_manager", "account_manager");
  await userWith("admin", agencyOrg, "agency_admin");
  await userWith("owner-a", orgA, "client_owner");
  await userWith("owner-b", orgB, "client_owner");
  await userWith("owner-c", orgC, "client_owner");
  const staffId = await userWith("staff-a", orgA, "client_staff");
  const burstId = await userWith("burst-a", orgA, "client_staff");
  await withAgency(db, async (tx) => {
    await assignClient(tx, amId, clientA, seed);
    await assignLocation(tx, staffId, clientA, locA, seed);
    await assignLocation(tx, burstId, clientA, locA, seed);
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`loy-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1 or slug like $2", [
    `%-${suffix}`,
    AGENCY_SLUG,
  ]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@loy.test`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1 or reason like $2", [
    `%${suffix}`,
    `%${suffix}%`,
  ]);
  await admin.close();
  await close();
});

describe("the public flow, end to end", () => {
  test("join, read, 304, stamp, earn, redeem, email", async () => {
    await makeProgram("owner-a", locA);
    const token = await joinTokenOf("owner-a", locA);

    const first = await pub("/v1/loyalty/cards", joinBody(token, { deviceId: "from-the-body" }));
    expect(first.res.status).toBe(201);
    expect(first.res.headers.get("cache-control")).toBe("no-store");
    expect(first.body.token).toBeString();
    expect(first.body.shortCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const setCookie = first.res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("atr_card_dev=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("Secure");
    const card = first.body;

    const view = await pub(`/v1/loyalty/cards/${card.token}`);
    expect(view.res.status).toBe(200);
    expect(view.res.headers.get("cache-control")).toBe("no-store");
    expect(view.body).toMatchObject({
      state: "active",
      programName: "Cafe Olivo Card",
      stampsRequired: 2,
      stampsInCycle: 0,
      rewardReady: false,
    });
    const etag = view.res.headers.get("etag") as string;
    expect(etag).toBeString();

    const same = await pub(`/v1/loyalty/cards/${card.token}`, {
      headers: { "if-none-match": etag },
    });
    expect(same.res.status).toBe(304);

    // client staff of the place stamps; the card then shows it
    const stamped = await call("staff-a", "POST", "/api/loyalty/stamps", stampBody(locA, card));
    expect(stamped.status).toBe(201);
    expect(await stamped.json()).toMatchObject({ stampsInCycle: 1, rewardEarned: false });
    const again = await pub(`/v1/loyalty/cards/${card.token}`, {
      headers: { "if-none-match": etag },
    });
    expect(again.res.status).toBe(200);
    expect(again.body.stampsInCycle).toBe(1);

    // a full cycle earns the reward, which is then redeemed once
    const second = await call("staff-a", "POST", "/api/loyalty/stamps", stampBody(locA, card));
    expect(await second.json()).toMatchObject({ rewardEarned: true });
    expect((await pub(`/v1/loyalty/cards/${card.token}`)).body.rewardReady).toBe(true);
    const redeemK = key();
    const redeemed = await call("staff-a", "POST", "/api/loyalty/redeem", {
      locationId: locA,
      cardToken: card.token,
      idempotencyKey: redeemK,
    });
    expect(redeemed.status).toBe(200);
    expect(((await redeemed.json()) as any).rewardId).toBeString();
    const nothing = await call("staff-a", "POST", "/api/loyalty/redeem", {
      locationId: locA,
      code: card.shortCode,
      idempotencyKey: key(),
    });
    expect(nothing.status).toBe(409);

    // the email opt-in
    const noConsent = await pub(`/v1/loyalty/cards/${card.token}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ana@example.com", consent: false }),
    });
    expect(noConsent.res.status).toBe(400);
    expect(noConsent.body).toEqual({ error: "consent_required" });
    const bad = await pub(`/v1/loyalty/cards/${card.token}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", consent: true }),
    });
    expect(bad.res.status).toBe(400);
    expect(bad.body).toEqual({ error: "invalid_email" });
    const ok = await pub(`/v1/loyalty/cards/${card.token}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `ana-${suffix}@example.com`, consent: true }),
    });
    expect(ok.res.status).toBe(204);
    const gone = await pub(`/v1/loyalty/cards/${"A".repeat(43)}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ana@example.com", consent: true }),
    });
    expect(gone.res.status).toBe(404);
    expect(gone.body).toEqual({ error: "unavailable" });
  });

  test("the device comes from the cookie the server set, never from the body", async () => {
    const token = await joinTokenOf("owner-a", locA);
    const first = await pub("/v1/loyalty/cards", joinBody(token, { deviceId: "x" }));
    expect(first.res.status).toBe(201);
    const cookie = (first.res.headers.get("set-cookie") ?? "").split(";")[0] as string;
    const second = await pub("/v1/loyalty/cards", {
      ...joinBody(token, { deviceId: "a-different-one" }),
      headers: { "content-type": "application/json", cookie },
    });
    expect(second.res.status).toBe(409);
    expect(second.body).toEqual({ error: "device_limit" });
    expect(Number(second.res.headers.get("retry-after"))).toBeGreaterThan(0);
    // the same body device id with no cookie is a new device: the body is ignored
    const third = await pub("/v1/loyalty/cards", joinBody(token, { deviceId: "x" }));
    expect(third.res.status).toBe(201);
    // a forged cookie value that is not one the server minted is replaced, not trusted
    const forged = await pub("/v1/loyalty/cards", {
      ...joinBody(token),
      headers: { "content-type": "application/json", cookie: "atr_card_dev=1" },
    });
    expect(forged.res.status).toBe(201);
    expect(forged.res.headers.get("set-cookie") ?? "").toContain("atr_card_dev=");
  });

  test("the cookie is Secure over https and when a trusted proxy says so", async () => {
    const token = await joinTokenOf("owner-a", locA);
    const https = await pub("https://api.test/v1/loyalty/cards", joinBody(token));
    expect(https.res.headers.get("set-cookie") ?? "").toContain("Secure");
    const behind = await pub("/v1/loyalty/cards", {
      ...joinBody(token),
      target: gated,
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
        "x-atrium-proxy": PROXY_SECRET,
      },
    });
    expect(behind.res.headers.get("set-cookie") ?? "").toContain("Secure");
  });

  test("the cookie is Secure when QR_CARD_URL is https, not for an untrusted forwarded proto", async () => {
    const token = await joinTokenOf("owner-a", locA);
    const secured = createApp({
      db,
      now: () => NOW,
      session,
      loyaltySecret: SECRET,
      qrCardUrl: "https://card.example.com",
    });
    const viaUrl = await pub("/v1/loyalty/cards", { ...joinBody(token), target: secured });
    expect(viaUrl.res.headers.get("set-cookie") ?? "").toContain("Secure");
    const spoofed = await pub("/v1/loyalty/cards", {
      ...joinBody(token),
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
    });
    expect(spoofed.res.status).toBe(201);
    expect(spoofed.res.headers.get("set-cookie") ?? "").not.toContain("Secure");
  });

  test("a bad, rotated or foreign token is 410", async () => {
    const bogus = await pub("/v1/loyalty/cards", joinBody("not-a-token"));
    expect(bogus.res.status).toBe(410);
    expect(bogus.body).toEqual({ error: "invalid" });
    const survey = await pub("/v1/loyalty/cards", joinBody("q1.0123456789abcdef.0.deadbeef"));
    expect(survey.res.status).toBe(410);
    expect((await pub("/v1/loyalty/cards", { method: "POST", body: "{}" })).res.status).toBe(410);

    await makeProgram("owner-a", locA2);
    const old = await joinTokenOf("owner-a", locA2);
    const rotated = await call("owner-a", "POST", "/api/loyalty/program/rotate-qr", {
      locationId: locA2,
    });
    expect(rotated.status).toBe(200);
    expect((await pub("/v1/loyalty/cards", joinBody(old))).res.status).toBe(410);
    expect(
      (await pub("/v1/loyalty/cards", joinBody(await joinTokenOf("owner-a", locA2)))).res.status,
    ).toBe(201);
  });

  test("an unknown token, or one with a character changed, is 404", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    const last = card.token.slice(-1);
    const changed = card.token.slice(0, -1) + (last === "A" ? "B" : "A");
    for (const t of [changed, "A".repeat(43), "short"]) {
      const r = await pub(`/v1/loyalty/cards/${t}`);
      expect(r.res.status).toBe(404);
      expect(r.body).toEqual({ error: "not_found" });
    }
  });

  test("a garbage token is 404 and writes no rate counter row", async () => {
    const count = async () =>
      Number(
        ((await admin.unsafe("select count(*)::int as n from crm.rate_counters")) as any)[0].n,
      );
    const before = await count();
    for (const t of ["short", "x".repeat(21), `${"a".repeat(21)}+`]) {
      const r = await pub(`/v1/loyalty/cards/${t}`);
      expect(r.res.status).toBe(404);
    }
    expect(await count()).toBe(before);
  });

  /** Puts a card's counter at the limit, so the next HTTP call is the one over it. */
  const fillCounter = async (prefix: string, token: string, count: number) => {
    const windowStart = new Date(Math.floor(NOW.getTime() / 60_000) * 60_000);
    await admin.unsafe(
      "insert into crm.rate_counters (key, window_start, count) values ($1, $2, $3) on conflict (key, window_start) do update set count = excluded.count",
      [`${prefix}:token:${createHash("sha256").update(token).digest("hex")}`, windowStart, count],
    );
  };

  test("reads over the per-token limit are 429 with Retry-After", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    await fillCounter("read", card.token, 119);
    expect((await pub(`/v1/loyalty/cards/${card.token}`)).res.status).toBe(200);
    const over = await pub(`/v1/loyalty/cards/${card.token}`);
    expect(over.res.status).toBe(429);
    expect(Number(over.res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  test("email attempts are limited per token", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    const attempt = () =>
      pub(`/v1/loyalty/cards/${card.token}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nope", consent: true }),
      });
    await fillCounter("email", card.token, 119);
    expect((await attempt()).res.status).toBe(400);
    expect((await attempt()).res.status).toBe(429);
  });

  test("a garbage token on the email route is 404 and writes no rate counter row", async () => {
    const count = async () =>
      Number(
        ((await admin.unsafe("select count(*)::int as n from crm.rate_counters")) as any)[0].n,
      );
    const before = await count();
    for (const t of ["short", "x".repeat(21), `${"a".repeat(21)}+`]) {
      const r = await pub(`/v1/loyalty/cards/${t}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.co", consent: true }),
      });
      expect(r.res.status).toBe(404);
      expect(r.body).toEqual({ error: "unavailable" });
    }
    expect(await count()).toBe(before);
  });

  test("a paused program: the card answers 200 paused and a stamp is refused 409", async () => {
    const token = await joinTokenOf("owner-a", locA2);
    const card = await newCard(token);
    await makeProgram("owner-a", locA2, { active: false });
    const view = await pub(`/v1/loyalty/cards/${card.token}`);
    expect(view.res.status).toBe(200);
    expect(view.body.state).toBe("paused");
    const refused = await call("owner-a", "POST", "/api/loyalty/stamps", stampBody(locA2, card));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "refused", reason: "paused" });
    const join = await pub("/v1/loyalty/cards", joinBody(token));
    expect(join.res.status).toBe(410);
    expect(join.body).toEqual({ error: "paused" });
    await makeProgram("owner-a", locA2, { active: true });
  });

  test("a join is limited per IP, and X-Forwarded-For counts only behind a trusted proxy", async () => {
    // untrusted: the forwarded header is ignored, so 21 different values share one limit
    const socket = nextIp();
    let status = 0;
    for (let i = 0; i < 21; i++) {
      status = (
        await pub("/v1/loyalty/cards", {
          ...joinBody("nope"),
          ip: socket,
          headers: { "content-type": "application/json", "x-forwarded-for": `9.9.${i}.1` },
        })
      ).res.status;
    }
    expect(status).toBe(429);
    const limited = await pub("/v1/loyalty/cards", {
      ...joinBody("nope"),
      ip: socket,
      headers: { "content-type": "application/json", "x-forwarded-for": "8.8.8.8" },
    });
    expect(limited.res.status).toBe(429);
    expect(Number(limited.res.headers.get("retry-after"))).toBeGreaterThan(0);

    // trusted: the first hop is the client, so each forwarded address has its own limit
    const proxy = nextIp();
    const fwd = nextIp();
    for (let i = 0; i < 21; i++) {
      const r = await pub("/v1/loyalty/cards", {
        ...joinBody("nope"),
        ip: proxy,
        target: gated,
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `${fwd}, 10.0.0.1`,
          "x-atrium-proxy": PROXY_SECRET,
        },
      });
      if (i < 20) expect(r.res.status).toBe(410);
      else expect(r.res.status).toBe(429);
    }
    const other = await pub("/v1/loyalty/cards", {
      ...joinBody("nope"),
      ip: proxy,
      target: gated,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": nextIp(),
        "x-atrium-proxy": PROXY_SECRET,
      },
    });
    expect(other.res.status).toBe(410);
  });

  test("with LOYALTY_PROXY_SECRET, X-Forwarded-For counts only when x-atrium-proxy matches", async () => {
    const join = (socket: string, forwarded: string, proxy?: string) =>
      pub("/v1/loyalty/cards", {
        ...joinBody("nope"),
        ip: socket,
        target: gated,
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": forwarded,
          ...(proxy === undefined ? {} : { "x-atrium-proxy": proxy }),
        },
      });
    // no header: every forwarded value is ignored, so the socket's single bucket fills
    const bare = nextIp();
    for (let i = 0; i < 20; i++) expect((await join(bare, `7.7.${i}.1`)).res.status).toBe(410);
    expect((await join(bare, "7.7.99.1")).res.status).toBe(429);
    // a wrong value counts as no header
    const wrong = nextIp();
    for (let i = 0; i < 20; i++)
      expect((await join(wrong, `7.8.${i}.1`, "x".repeat(32))).res.status).toBe(410);
    expect((await join(wrong, "7.8.99.1", "x".repeat(31))).res.status).toBe(429);
    // the right value: each forwarded address has its own bucket
    const behind = nextIp();
    for (let i = 0; i < 21; i++) {
      expect((await join(behind, `7.9.${i}.1`, PROXY_SECRET)).res.status).toBe(410);
    }
  });

  test("TRUST_PROXY without a usable proxy secret fails closed: the socket's address counts", async () => {
    for (const target of [proxied, tooShort]) {
      const socket = nextIp();
      const join = (i: number) =>
        pub("/v1/loyalty/cards", {
          ...joinBody("nope"),
          ip: socket,
          target,
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `6.6.${i}.1`,
            "x-atrium-proxy": "s".repeat(8),
          },
        });
      for (let i = 0; i < 20; i++) expect((await join(i)).res.status).toBe(410);
      expect((await join(99)).res.status).toBe(429);
    }
    const token = await joinTokenOf("owner-a", locA);
    const behind = await pub("/v1/loyalty/cards", {
      ...joinBody(token),
      target: proxied,
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
    });
    expect(behind.res.headers.get("set-cookie") ?? "").not.toContain("Secure");
  });

  test("no CORS headers on a public route", async () => {
    const r = await pub("/v1/loyalty/cards/nope", { headers: { origin: "http://evil.test" } });
    expect(r.res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("no public response holds a guest field or an email", () => {
    expect(publicBodies.length).toBeGreaterThan(10);
    for (const body of publicBodies) {
      expect(body).not.toMatch(/guest/i);
      expect(body).not.toContain("@");
      expect(body).not.toContain('"email"');
    }
  });
});

describe("the program", () => {
  test("the owner reads and changes it; staff reads but cannot change it", async () => {
    const read = await call("staff-a", "GET", `/api/loyalty/program?locationId=${locA}`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as any).program).toMatchObject({ name: "Cafe Olivo Card" });
    const put = await call("staff-a", "PUT", "/api/loyalty/program", {
      locationId: locA,
      ...PROGRAM,
    });
    expect(put.status).toBe(403);
    const link = await call("owner-a", "GET", `/api/loyalty/program/join-link?locationId=${locA}`);
    const body = (await link.json()) as any;
    expect(body.url).toBe(`${CARD_URL}/j/${body.token}`);
    const bare = await call(
      "owner-a",
      "GET",
      `/api/loyalty/program/join-link?locationId=${locA}`,
      undefined,
      proxied,
    );
    expect(((await bare.json()) as any).url).toBeNull();
  });

  test("bad input is 422", async () => {
    expect((await call("owner-a", "GET", "/api/loyalty/program?locationId=nope")).status).toBe(422);
    const badId = await call("owner-a", "GET", "/api/loyalty/program?locationId=nope");
    expect(await badId.json()).toEqual({ error: "invalid_id" });
    const noBody = await call("owner-a", "PUT", "/api/loyalty/program", {
      locationId: locA,
      name: 5,
    });
    expect(noBody.status).toBe(422);
    expect(await noBody.json()).toMatchObject({ error: "invalid_request" });
    const tooMany = await call("owner-a", "PUT", "/api/loyalty/program", {
      locationId: locA,
      ...PROGRAM,
      stampsRequired: 99,
    });
    expect(tooMany.status).toBe(422);
  });

  test("client B never sees client A's program", async () => {
    const res = await call("owner-b", "GET", `/api/loyalty/program?locationId=${locA}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).program).toBeNull();
    const put = await call("owner-b", "PUT", "/api/loyalty/program", {
      locationId: locA,
      ...PROGRAM,
    });
    expect(put.status).toBe(422);
    const rot = await call("owner-b", "POST", "/api/loyalty/program/rotate-qr", {
      locationId: locA,
    });
    expect(rot.status).toBe(404);
  });
});

describe("stamping", () => {
  test("no session is 401", async () => {
    for (const [m, p] of [
      ["GET", "/api/loyalty/program?locationId=x"],
      ["POST", "/api/loyalty/stamps"],
      ["GET", "/api/loyalty/activity"],
      ["GET", "/api/insights/loyalty"],
    ] as const) {
      expect((await app.request(p, { method: m })).status).toBe(401);
    }
  });

  test("staff of place A: 201 for a card of A, 404 for another place", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    expect(
      (await call("staff-a", "POST", "/api/loyalty/stamps", stampBody(locA, card))).status,
    ).toBe(201);
    const wrongPlace = await call("staff-a", "POST", "/api/loyalty/stamps", stampBody(locA2, card));
    expect(wrongPlace.status).toBe(404);
    expect(await wrongPlace.json()).toEqual({ error: "not_found" });
    const otherClient = await call("owner-b", "POST", "/api/loyalty/stamps", stampBody(locA, card));
    expect(otherClient.status).toBe(404);
  });

  test("the account manager and the admin read and manage but cannot stamp or redeem", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    for (const who of ["am", "admin"]) {
      expect((await call(who, "POST", "/api/loyalty/stamps", stampBody(locA, card))).status).toBe(
        403,
      );
      expect(
        (
          await call(who, "POST", "/api/loyalty/redeem", {
            locationId: locA,
            code: card.shortCode,
            idempotencyKey: key(),
          })
        ).status,
      ).toBe(403);
      expect((await call(who, "GET", `/api/loyalty/program?locationId=${locA}`)).status).toBe(200);
    }
  });

  test("void: the manager voids the last stamp; staff cannot", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    await call("staff-a", "POST", "/api/loyalty/stamps", stampBody(locA, card));
    const cardId = (
      await admin.unsafe("select id from crm.loyalty_cards where short_code = $1", [
        card.shortCode.replace("-", ""),
      ])
    )[0].id as string;
    const k = key();
    const voided = await call("am", "POST", "/api/loyalty/void", {
      cardId,
      reason: "wrong card",
      idempotencyKey: k,
    });
    expect(voided.status).toBe(200);
    expect(await voided.json()).toMatchObject({ stampsInCycle: 0 });
    const nothing = await call("am", "POST", "/api/loyalty/void", {
      cardId,
      reason: "again",
      idempotencyKey: key(),
    });
    expect(nothing.status).toBe(409);
    expect(
      (
        await call("staff-a", "POST", "/api/loyalty/void", {
          cardId,
          reason: "x",
          idempotencyKey: key(),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("am", "POST", "/api/loyalty/void", {
          cardId: "nope",
          reason: "x",
          idempotencyKey: key(),
        })
      ).status,
    ).toBe(422);
    const long = await call("am", "POST", "/api/loyalty/void", {
      cardId,
      reason: "x".repeat(201),
      idempotencyKey: key(),
    });
    expect(long.status).toBe(422);
  });

  test("the same idempotency key twice returns the same body and one event", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    const k = key();
    const one = await call("staff-a", "POST", "/api/loyalty/stamps", stampBody(locA, card, k));
    const two = await call("staff-a", "POST", "/api/loyalty/stamps", stampBody(locA, card, k));
    expect(one.status).toBe(201);
    expect(await two.json()).toEqual(await one.json());
    expect(await eventCount(card.shortCode, "stamp")).toBe(1);
  });

  test("the body is checked: ids, key, note, one of code and token", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    const post = (b: unknown) => call("staff-a", "POST", "/api/loyalty/stamps", b);
    const base = stampBody(locA, card);
    const both = await post({ ...base, cardToken: card.token });
    expect(both.status).toBe(422);
    expect(await both.json()).toMatchObject({ error: "invalid_request" });
    const { code: _code, ...neither } = base;
    expect((await post(neither)).status).toBe(422);
    const badId = await post({ ...base, locationId: "nope" });
    expect(badId.status).toBe(422);
    expect(await badId.json()).toEqual({ error: "invalid_id" });
    expect((await post({ ...base, idempotencyKey: "k".repeat(201) })).status).toBe(422);
    expect((await post({ ...base, idempotencyKey: "" })).status).toBe(422);
    expect((await post({ ...base, idempotencyKey: "earned:1" })).status).toBe(422);
    expect((await post({ ...base, idempotencyKey: 7 })).status).toBe(422);
    expect((await post([1])).status).toBe(422);
    expect((await post(null)).status).toBe(422);
    expect(await eventCount(card.shortCode, "stamp")).toBe(0);
  });

  test("the 11th stamp attempt of a staff user in a minute is 429, keyed on the user", async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) {
      last = (
        await call("burst-a", "POST", "/api/loyalty/stamps", {
          locationId: locA,
          code: "AAAA-AAAA",
          idempotencyKey: key(),
        })
      ).status;
      expect(last).toBe(404);
    }
    const over = await call("burst-a", "POST", "/api/loyalty/stamps", {
      locationId: locA,
      code: "AAAA-AAAA",
      idempotencyKey: key(),
    });
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    // another user of the same address is not affected
    expect(
      (
        await call("staff-a", "POST", "/api/loyalty/stamps", {
          locationId: locA,
          code: "AAAA-AAAA",
          idempotencyKey: key(),
        })
      ).status,
    ).toBe(404);
  });
});

describe("activity and the band", () => {
  beforeAll(async () => {
    await makeProgram("owner-b", locB, { name: "Brasa Norte Card" });
    const card = await newCard(await joinTokenOf("owner-b", locB));
    for (let i = 0; i < 1; i++) {
      const r = await call("owner-b", "POST", "/api/loyalty/stamps", stampBody(locB, card));
      expect(r.status).toBe(201);
    }
  });

  test("client A sees A, never B", async () => {
    const act = await call("owner-a", "GET", "/api/loyalty/activity?range=30d");
    expect(act.status).toBe(200);
    const text = JSON.stringify(await act.json());
    expect(text).toContain("Bellaire");
    expect(text).not.toContain("Norteville");
    expect(text).not.toContain("Brasa");
    const band = await call("owner-b", "GET", "/api/insights/loyalty?range=30d");
    expect(band.status).toBe(200);
    expect(((await band.json()) as any).stamps.value).toBe(1);
    const bandA = await call("owner-a", "GET", `/api/insights/loyalty?range=30d&place=${locB}`);
    expect(((await bandA.json()) as any).stamps.value).toBe(0);
  });

  test("an assigned account manager sees only the assigned client", async () => {
    const text = JSON.stringify(
      await (await call("am", "GET", "/api/loyalty/activity?range=30d")).json(),
    );
    expect(text).toContain("Bellaire");
    expect(text).not.toContain("Norteville");
    const all = JSON.stringify(
      await (await call("admin", "GET", "/api/loyalty/activity?range=30d")).json(),
    );
    expect(all).toContain("Bellaire");
    expect(all).toContain("Norteville");
  });

  test("filters and pages are checked", async () => {
    const bad = await call("owner-a", "GET", "/api/loyalty/activity?range=2y");
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "invalid_range" });
    expect((await call("owner-a", "GET", "/api/loyalty/activity?place=nope")).status).toBe(422);
    expect((await call("owner-a", "GET", "/api/loyalty/activity?kind=pizza")).status).toBe(422);
    expect((await call("owner-a", "GET", "/api/loyalty/activity?page=0")).status).toBe(422);
    expect((await call("owner-a", "GET", "/api/loyalty/activity?pageSize=abc")).status).toBe(422);
    expect((await call("owner-a", "GET", "/api/insights/loyalty?range=2y")).status).toBe(422);
    const some = await call("owner-a", "GET", "/api/loyalty/activity?kind=stamp&page=1&pageSize=5");
    expect(some.status).toBe(200);
    const rows = ((await some.json()) as any).rows as any[];
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const r of rows) {
      expect(r.kind).toBe("stamp");
      expect(JSON.stringify(r)).not.toMatch(/token|guest|email/i);
    }
  });
});

describe("the staff card lookup and /api/me", () => {
  test("GET /api/loyalty/card: 200 for staff of the place, 404 for another place, 422 for a bad id, 403 feature_locked below Pillar 3", async () => {
    const card = await newCard(await joinTokenOf("owner-a", locA));
    const get = (who: string, loc: string, code: string) =>
      call(who, "GET", `/api/loyalty/card?locationId=${loc}&code=${encodeURIComponent(code)}`);

    const ok = await get("staff-a", locA, card.shortCode.toLowerCase());
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = (await ok.json()) as any;
    expect(body.card).toMatchObject({
      shortCode: card.shortCode,
      locationId: locA,
      accent: "lime",
      recent: [],
    });
    expect(JSON.stringify(body)).not.toContain(card.token);

    // another place of the same client, an unknown code and a client B session all look alike
    const answers = [
      await get("staff-a", locA2, card.shortCode),
      await get("staff-a", locA, "AAAA-AAAA"),
      await get("staff-a", locA, "!"),
      await get("owner-b", locA, card.shortCode),
    ];
    for (const res of answers) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found" });
    }

    expect((await get("staff-a", "nope", card.shortCode)).status).toBe(422);
    const missing = await call("staff-a", "GET", `/api/loyalty/card?locationId=${locA}`);
    expect(missing.status).toBe(422);
    expect((await get("staff-a", locA, "A".repeat(21))).status).toBe(422);

    const locked = await get("owner-c", locC, card.shortCode);
    expect(locked.status).toBe(403);
    expect(await locked.json()).toEqual({ error: "feature_locked", feature: "retention" });
    expect((await app.request(`/api/loyalty/card?locationId=${locA}&code=x`)).status).toBe(401);
  });

  test("/api/me carries the four loyalty flags by role", async () => {
    const flags = async (who: string) => {
      const me = (await (await call(who, "GET", "/api/me")).json()) as Record<string, unknown>;
      return [me.canReadLoyalty, me.canStampLoyalty, me.canRedeemLoyalty, me.canManageLoyalty];
    };
    // read, stamp, redeem, manage
    expect(await flags("staff-a")).toEqual([true, true, true, false]);
    expect(await flags("owner-a")).toEqual([true, true, true, true]);
    expect(await flags("am")).toEqual([true, false, false, true]);
  });
});

describe("the retention feature is locked", () => {
  test("every session route answers locked for a client on the Essential package", async () => {
    const cases: [string, string, unknown?][] = [
      ["GET", `/api/loyalty/program?locationId=${locC}`],
      ["PUT", "/api/loyalty/program", { locationId: locC, ...PROGRAM }],
      ["POST", "/api/loyalty/program/rotate-qr", { locationId: locC }],
      ["GET", `/api/loyalty/program/join-link?locationId=${locC}`],
      ["POST", "/api/loyalty/stamps", { locationId: locC, code: "AAAA-AAAA", idempotencyKey: "k" }],
      ["POST", "/api/loyalty/redeem", { locationId: locC, code: "AAAA-AAAA", idempotencyKey: "k" }],
      [
        "POST",
        "/api/loyalty/void",
        { cardId: crypto.randomUUID(), reason: "x", idempotencyKey: "k" },
      ],
      ["GET", "/api/loyalty/activity?range=30d"],
      ["GET", "/api/insights/loyalty?range=30d"],
    ];
    for (const [m, p, b] of cases) {
      const res = await call("owner-c", m, p, b);
      expect([m, p, res.status]).toEqual([m, p, 403]);
      expect(await res.json()).toEqual({ error: "feature_locked", feature: "retention" });
    }
  });
});

describe("mounting", () => {
  test("a LOYALTY_SECRET shorter than 32 characters is not usable", () => {
    expect(usableLoyaltySecret(undefined)).toBeUndefined();
    expect(usableLoyaltySecret("")).toBeUndefined();
    expect(usableLoyaltySecret("x".repeat(31))).toBeUndefined();
    expect(usableLoyaltySecret("x".repeat(32))).toBe("x".repeat(32));
    expect(SECRET.length).toBeGreaterThanOrEqual(32);
  });

  test("without LOYALTY_SECRET no loyalty route exists", async () => {
    expect((await off.request("/v1/loyalty/cards/abc")).status).toBe(404);
    expect(
      (
        await off.request("/v1/loyalty/cards", {
          method: "POST",
          body: JSON.stringify({ joinToken: "x" }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await call("owner-a", "GET", `/api/loyalty/program?locationId=${locA}`, undefined, off))
        .status,
    ).toBe(404);
    expect((await call("owner-a", "GET", "/api/insights/loyalty", undefined, off)).status).toBe(
      404,
    );
  });
});
