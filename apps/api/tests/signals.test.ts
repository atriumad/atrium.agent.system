import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AtriumEvent } from "@atrium/contracts";
import {
  createClient,
  createDatabase,
  createEventBus,
  createLocation,
  withAgency,
  withTenant,
} from "@atrium/core";
import { createConnectorToken, revokeConnectorToken } from "@atrium/signals";
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
const actor = { type: "user", id: `api-admin-${suffix}` } as const;

const events: AtriumEvent[] = [];
const errors: unknown[] = [];
const app = createApp({
  db,
  publish: async (e) => void events.push(e),
  now: () => new Date("2026-10-04T15:00:00Z"),
  onError: (e) => errors.push(e),
});

let a: string;
let b: string;
let locA: string;
let locB: string;
let token: string;
let revokedToken: string;

const row = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-07-10",
  locationId: locA,
  source: "toast",
  signalType: "order",
  value: 42,
  ...overrides,
});

const post = (rows: unknown, auth: string | null = `Bearer ${token}`, raw?: string) =>
  app.request("/v1/signals", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: raw ?? JSON.stringify({ rows }),
  });

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `api-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `api-brasa-${suffix}` })).id;
    locA = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
    locB = (await createLocation(tx, b, { name: "Norte", timeZone: "America/Chicago" })).id;
    token = (
      await createConnectorToken(
        tx,
        { name: `n8n-api-${suffix}`, sources: ["toast"], clientIds: [a] },
        actor,
      )
    ).token;
    const old = await createConnectorToken(
      tx,
      { name: `n8n-old-${suffix}`, sources: ["toast"], clientIds: [a] },
      actor,
    );
    revokedToken = old.token;
    await revokeConnectorToken(tx, old.id, actor);
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`api-%-${suffix}`}`),
  );
  await admin.unsafe("delete from signals.connector_tokens where name like $1", [`%-${suffix}`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("GET /health", () => {
  test("answers without a token", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("authentication", () => {
  test("no header, wrong scheme, unknown token and revoked token are all 401", async () => {
    for (const auth of [null, "Basic abc", "Bearer", "Bearer atg_nope", `Bearer ${revokedToken}`]) {
      const res = await post([row()], auth);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
    }
  });

  test("an anonymous caller is refused before the body is looked at", async () => {
    const res = await post(null, null, "{ not json");
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/signals", () => {
  test("writes the rows and says what happened", async () => {
    const res = await post([row(), row({ signalType: "revenue", value: 5400 })]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: 2, updated: 0, clients: 1 });
    expect(events.at(-1)?.type).toBe("signals.ingested");
  });

  test("sending the same day again replaces it, so a connector can always retry", async () => {
    await post([row({ signalType: "lead", value: 1 })]);
    const res = await post([row({ signalType: "lead", value: 9 })]);
    expect(await res.json()).toEqual({ inserted: 0, updated: 1, clients: 1 });
    const r = await withTenant(db, a, (tx) =>
      tx.execute<{ n: number; revision: number }>(
        sql`select count(*)::int as n, max(revision)::int as revision from signals.signals_daily where signal_type = 'lead'`,
      ),
    );
    expect(r[0]).toEqual({ n: 1, revision: 2 });
  });

  test("an unknown signal type is 422 with the offending path", async () => {
    const res = await post([row({ signalType: "views" })]);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; issues: { path: string }[] };
    expect(body.error).toBe("invalid_request");
    expect(body.issues[0]?.path).toBe("rows.0.signalType");
  });

  test("broken JSON is 400, and an empty batch or a missing body is 422, never 500", async () => {
    const broken = await post(null, `Bearer ${token}`, "{ not json");
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: "malformed_request" });
    expect((await post([])).status).toBe(422);
    expect((await post(null, `Bearer ${token}`, "{}")).status).toBe(422);
  });

  test("another client's location is 403, and looks the same as an unknown one", async () => {
    const other = await post([row({ locationId: locB })]);
    const unknown = await post([row({ locationId: crypto.randomUUID() })]);
    expect(other.status).toBe(403);
    expect(unknown.status).toBe(403);
    const [x, y] = [await other.json(), await unknown.json()];
    expect(x).toEqual(y);
    expect(x).toMatchObject({
      error: "rows_rejected",
      problems: [{ code: "location_not_permitted", message: "location not permitted" }],
    });
  });

  test("a source outside the token is 403", async () => {
    const res = await post([row({ source: "metricool", signalType: "impression" })]);
    expect(res.status).toBe(403);
  });

  test("a date out of range and a duplicate are 422", async () => {
    expect((await post([row({ date: "2019-01-01" })])).status).toBe(422);
    const dup = await post([row(), row({ value: 1 })]);
    expect(dup.status).toBe(422);
    expect(await dup.json()).toMatchObject({ problems: [{ index: 1, code: "duplicate_key" }] });
  });

  test("a refused batch writes nothing", async () => {
    const before = await withTenant(db, a, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from signals.signals_daily`),
    );
    await post([row({ signalType: "rsvp" }), row({ locationId: locB, signalType: "rsvp" })]);
    const after = await withTenant(db, a, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from signals.signals_daily`),
    );
    expect(after[0]?.n).toBe(before[0]?.n ?? -1);
  });

  test("an error response never repeats thousands of problems back", async () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      row({ locationId: crypto.randomUUID(), elementId: `e${i}` }),
    );
    const res = await post(rows);
    const body = (await res.json()) as { total: number; problems: unknown[] };
    expect(body.total).toBe(200);
    expect(body.problems).toHaveLength(50);
  });

  test("a body over 4 MB is 413", async () => {
    const res = await post(
      null,
      `Bearer ${token}`,
      JSON.stringify({ rows: [row({ meta: { pad: "x".repeat(4 * 1024 * 1024) } })] }),
    );
    expect(res.status).toBe(413);
  });

  test("an unexpected failure is a 500 with no detail, and is reported", async () => {
    const broken = createApp({
      db,
      publish: async () => {
        throw new Error("secret internal detail");
      },
      now: () => new Date("2026-10-04T15:00:00Z"),
      onError: (e) => errors.push(e),
    });
    const res = await broken.request("/v1/signals", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ rows: [row({ signalType: "opt_in" })] }),
    });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
    expect(errors.some((e) => String(e).includes("secret internal detail"))).toBe(true);
  });
});

describe("OpenAPI", () => {
  test("documents the route and the bearer scheme", async () => {
    const res = await app.request("/openapi.json");
    const doc = (await res.json()) as {
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(Object.keys(doc.paths)).toContain("/v1/signals");
    expect(doc.components.securitySchemes.connectorToken).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });
});

describe("with the real event bus", () => {
  test("an accepted batch reaches a consumer of signals.ingested, once", async () => {
    const schema = `queue_api_${suffix}`;
    await admin.unsafe(`create schema "${schema}" authorization atrium_app`);
    const bus = createEventBus(db, { url: APP_URL, schema });
    await bus.start();
    try {
      const seen: AtriumEvent[] = [];
      await bus.subscribe("rollup", "signals.ingested", async (e) => void seen.push(e), {
        pollingIntervalSeconds: 0.5,
      });
      const live = createApp({
        db,
        publish: (event, tx) => bus.publish(event, tx),
        now: () => new Date("2026-10-04T15:00:00Z"),
      });
      const res = await live.request("/v1/signals", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rows: [
            row({ signalType: "redemption" }),
            row({ signalType: "repeat_visit", date: "2026-07-12" }),
          ],
        }),
      });
      expect(res.status).toBe(200);

      const deadline = Date.now() + 15000;
      while (seen.length === 0 && Date.now() < deadline) await Bun.sleep(150);
      await Bun.sleep(1500);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        type: "signals.ingested",
        clientId: a,
        data: { source: "toast", from: "2026-07-10", to: "2026-07-12", rowCount: 2 },
      });
    } finally {
      await bus.stop();
      await admin.unsafe(`drop schema "${schema}" cascade`);
    }
  });
});
