import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  ACCESS_LEVELS,
  type AtriumEvent,
  SIGNAL_PLATFORMS,
  SIGNAL_SOURCES,
  SIGNAL_TYPES,
  SignalRow,
} from "@atrium/contracts";
import {
  assignClient,
  createClient,
  createDatabase,
  createLocation,
  withAgency,
  withAssigned,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  authenticateToken,
  createConnectorToken,
  hashToken,
  IngestionRejected,
  ingestSignals,
  revokeConnectorToken,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const actor = { type: "user", id: `sig-admin-${suffix}` } as const;

let a: string;
let b: string;
let locA: string;
let locB: string;
let tokenA: Awaited<ReturnType<typeof authenticateToken>> & object;
let tokenBoth: typeof tokenA;
const NOW = () => new Date("2026-10-04T15:00:00Z");

const row = (overrides: Record<string, unknown> = {}) =>
  SignalRow.parse({
    date: "2026-07-10",
    locationId: locA,
    source: "metricool",
    signalType: "video_view",
    value: 100,
    ...overrides,
  });

function recorder() {
  const events: AtriumEvent[] = [];
  return { events, publish: async (e: AtriumEvent) => void events.push(e) };
}

async function countRows(clientId: string, where = sql`true`) {
  const r = await withTenant(db, clientId, (tx) =>
    tx.execute<{ n: number }>(
      sql`select count(*)::int as n from signals.signals_daily where client_id = ${clientId} and ${where}`,
    ),
  );
  return r[0]?.n ?? 0;
}

// A month the migration does not pre-create. Partitions persist, so the test resets it.
const DROP_TEST_PARTITION = "drop table if exists signals.signals_daily_2021_06";

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await admin.unsafe(DROP_TEST_PARTITION);
  await withAgency(db, async (tx) => {
    a = (await createClient(tx, { name: "Casa Olivo", slug: `sg-olivo-${suffix}` })).id;
    b = (await createClient(tx, { name: "Brasa Norte", slug: `sg-brasa-${suffix}` })).id;
    locA = (await createLocation(tx, a, { name: "Bellaire", timeZone: "America/Chicago" })).id;
    locB = (await createLocation(tx, b, { name: "Norte", timeZone: "America/Chicago" })).id;
  });
  const issued = await withAgency(db, async (tx) => ({
    onlyA: await createConnectorToken(
      tx,
      { name: `n8n-a-${suffix}`, sources: ["metricool", "toast"], clientIds: [a] },
      actor,
    ),
    both: await createConnectorToken(
      tx,
      { name: `n8n-both-${suffix}`, sources: ["metricool"], clientIds: [a, b] },
      actor,
    ),
  }));
  tokenA = (await authenticateToken(db, issued.onlyA.token)) as typeof tokenA;
  tokenBoth = (await authenticateToken(db, issued.both.token)) as typeof tokenBoth;
});

afterAll(async () => {
  await admin.unsafe(DROP_TEST_PARTITION);
  await withAgency(db, async (tx) => {
    await tx.execute(sql`delete from core.clients where slug like ${`sg-%-${suffix}`}`);
  });
  await admin.unsafe("delete from signals.connector_tokens where name like $1", [`%-${suffix}`]);
  await admin.unsafe("delete from core.users where email like $1", [`%-${suffix}@sig.atrium.dev`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("ingestion", () => {
  test("stores rows and reports what it inserted", async () => {
    const result = await ingestSignals(
      db,
      tokenA,
      [row(), row({ signalType: "impression", value: 5 })],
      { now: NOW },
    );
    expect(result).toEqual({ inserted: 2, updated: 0, clients: 1 });
    expect(await countRows(a)).toBe(2);
  });

  test("a re-run replaces the day instead of adding to it", async () => {
    const result = await ingestSignals(db, tokenA, [row({ value: 250 })], { now: NOW });
    expect(result).toEqual({ inserted: 0, updated: 1, clients: 1 });
    expect(await countRows(a, sql`signal_type = 'video_view'`)).toBe(1);
    const r = await withTenant(db, a, (tx) =>
      tx.execute<{ value: string }>(
        sql`select value from signals.signals_daily where signal_type = 'video_view' and date = '2026-07-10'`,
      ),
    );
    expect(Number(r[0]?.value)).toBe(250);
  });

  test("a re-run also replaces meta and guest, including clearing them", async () => {
    const guest = crypto.randomUUID();
    await ingestSignals(
      db,
      tokenA,
      [row({ signalType: "qr_scan", source: "toast", meta: { utm: "tent" }, guestId: guest })],
      { now: NOW },
    );
    await ingestSignals(db, tokenA, [row({ signalType: "qr_scan", source: "toast" })], {
      now: NOW,
    });
    const r = await withTenant(db, a, (tx) =>
      tx.execute<{ meta: unknown; guest_id: string | null }>(
        sql`select meta, guest_id from signals.signals_daily where signal_type = 'qr_scan'`,
      ),
    );
    expect(r[0]).toEqual({ meta: null, guest_id: null });
  });

  test("no platform and no element are part of the key, not wildcards", async () => {
    await ingestSignals(db, tokenA, [row({ signalType: "save", value: 1 })], { now: NOW });
    await ingestSignals(db, tokenA, [row({ signalType: "save", value: 2 })], { now: NOW });
    await ingestSignals(
      db,
      tokenA,
      [row({ signalType: "save", value: 3, platform: "instagram" })],
      { now: NOW },
    );
    await ingestSignals(db, tokenA, [row({ signalType: "save", value: 4, elementId: "reel_9" })], {
      now: NOW,
    });
    expect(await countRows(a, sql`signal_type = 'save'`)).toBe(3);
  });

  test("creates the month's partition when it does not exist yet", async () => {
    const before = await admin.unsafe("select to_regclass('signals.signals_daily_2021_06') as t");
    expect((before[0] as { t: string | null }).t).toBeNull();
    await ingestSignals(db, tokenA, [row({ date: "2021-06-15", signalType: "reach_account" })], {
      now: NOW,
    });
    const after = await admin.unsafe("select to_regclass('signals.signals_daily_2021_06') as t");
    expect((after[0] as { t: string | null }).t).not.toBeNull();
    expect(await countRows(a, sql`date = '2021-06-15'`)).toBe(1);
  });

  test("one batch can span two clients when the token serves both", async () => {
    const result = await ingestSignals(
      db,
      tokenBoth,
      [row({ signalType: "follower_add" }), row({ locationId: locB, signalType: "follower_add" })],
      { now: NOW },
    );
    expect(result.clients).toBe(2);
    expect(await countRows(a, sql`signal_type = 'follower_add'`)).toBe(1);
    expect(await countRows(b, sql`signal_type = 'follower_add'`)).toBe(1);
  });
});

describe("rejections", () => {
  const rejects = async (token: typeof tokenA, rows: ReturnType<typeof row>[]) => {
    try {
      await ingestSignals(db, token, rows, { now: NOW });
    } catch (e) {
      if (e instanceof IngestionRejected) return e.problems.map((p) => p.code);
      throw e;
    }
    return null;
  };

  test("a source outside the token's list", async () => {
    expect(await rejects(tokenBoth, [row({ source: "toast" })])).toEqual(["source_not_permitted"]);
  });

  test("another client's location, and an unknown one, are refused the same way", async () => {
    expect(await rejects(tokenA, [row({ locationId: locB })])).toEqual(["location_not_permitted"]);
    expect(await rejects(tokenA, [row({ locationId: crypto.randomUUID() })])).toEqual([
      "location_not_permitted",
    ]);
  });

  test("dates out of the window", async () => {
    expect(await rejects(tokenA, [row({ date: "2019-12-31" })])).toEqual(["date_out_of_range"]);
    expect(await rejects(tokenA, [row({ date: "2026-12-01" })])).toEqual(["date_out_of_range"]);
  });

  test("a refused batch writes nothing, even for its valid rows", async () => {
    const before = await countRows(a);
    await rejects(tokenA, [
      row({ signalType: "profile_visit", value: 7 }),
      row({ locationId: locB, signalType: "profile_visit" }),
    ]);
    expect(await countRows(a)).toBe(before);
  });
});

describe("events and atomicity", () => {
  test("publishes one signals.ingested per client and source, with the range and count only", async () => {
    const r = recorder();
    await ingestSignals(
      db,
      tokenBoth,
      [
        row({ signalType: "link_click", date: "2026-07-08" }),
        row({ signalType: "link_click", date: "2026-07-11", elementId: "e1" }),
        row({ locationId: locB, signalType: "link_click" }),
      ],
      { now: NOW, publish: r.publish },
    );
    const byClient = Object.fromEntries(r.events.map((e) => [e.clientId, e.data]));
    expect(byClient[a]).toEqual({
      source: "metricool",
      from: "2026-07-08",
      to: "2026-07-11",
      rowCount: 2,
    });
    expect(byClient[b]).toEqual({
      source: "metricool",
      from: "2026-07-10",
      to: "2026-07-10",
      rowCount: 1,
    });
    expect(r.events).toHaveLength(2);
  });

  test("if anything fails after the first client, the whole batch rolls back", async () => {
    let calls = 0;
    const attempt = ingestSignals(
      db,
      tokenBoth,
      [
        row({ signalType: "menu_view", value: 11 }),
        row({ locationId: locB, signalType: "menu_view", value: 12 }),
      ],
      {
        now: NOW,
        publish: async () => {
          calls++;
          if (calls === 2) throw new Error("queue unavailable");
        },
      },
    );
    await expect(attempt).rejects.toThrow("queue unavailable");
    expect(await countRows(a, sql`signal_type = 'menu_view'`)).toBe(0);
    expect(await countRows(b, sql`signal_type = 'menu_view'`)).toBe(0);
  });
});

describe("isolation in the database", () => {
  test("a client sees only its own rows, even without a filter", async () => {
    const rows = await withTenant(db, b, (tx) =>
      tx.execute<{ client_id: string }>(
        sql`select distinct client_id from signals.signals_daily where signal_type = 'follower_add'`,
      ),
    );
    expect(rows.map((r) => r.client_id)).toEqual([b]);
  });

  test("with no scope there is nothing to read", async () => {
    const rows = await db.transaction((tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from signals.signals_daily`),
    );
    expect(rows[0]?.n).toBe(0);
  });

  test("a client cannot write a row for another client", async () => {
    await expect(
      withTenant(db, a, (tx) =>
        tx.execute(
          sql`insert into signals.signals_daily (client_id, location_id, date, source, signal_type, value) values (${b}, ${locB}, '2026-07-10', 'toast', 'order', 1)`,
        ),
      ),
    ).rejects.toThrow();
  });

  test("a location that belongs to another client cannot be paired with this client", async () => {
    await expect(
      withTenant(db, a, (tx) =>
        tx.execute(
          sql`insert into signals.signals_daily (client_id, location_id, date, source, signal_type, value) values (${a}, ${locB}, '2026-07-10', 'toast', 'order', 1)`,
        ),
      ),
    ).rejects.toThrow();
  });

  test("an assigned manager sees only the assigned client's signals", async () => {
    const userId = `sig-am-${suffix}`;
    await admin.unsafe("insert into core.users (id, name, email) values ($1, 'AM', $2)", [
      userId,
      `${userId}@sig.atrium.dev`,
    ]);
    await withAgency(db, (tx) => assignClient(tx, userId, a, actor));
    const clients = await withAssigned(db, userId, (tx) =>
      tx.execute<{ client_id: string }>(
        sql`select distinct client_id from signals.signals_daily where signal_type = 'follower_add'`,
      ),
    );
    expect(clients.map((r) => r.client_id)).toEqual([a]);
  });

  test("a partition cannot be queried directly, because that would skip the policies", async () => {
    await expect(
      withTenant(db, a, (tx) => tx.execute(sql`select * from signals.signals_daily_2026_07`)),
    ).rejects.toThrow();
  });

  test("history is replaced by a re-run, never deleted by the app role", async () => {
    await expect(
      withTenant(db, a, (tx) => tx.execute(sql`delete from signals.signals_daily`)),
    ).rejects.toThrow();
  });

  test("the database refuses a negative value and an unknown type on its own", async () => {
    const insert = (type: string, value: number) =>
      withTenant(db, a, (tx) =>
        tx.execute(
          sql`insert into signals.signals_daily (client_id, location_id, date, source, signal_type, value) values (${a}, ${locA}, '2026-07-10', 'toast', ${type}, ${value})`,
        ),
      );
    await expect(insert("order", -1)).rejects.toThrow();
    await expect(insert("invented_type", 1)).rejects.toThrow();
  });

  test("erasing a client removes its signals", async () => {
    const orphan = await withAgency(db, async (tx) => {
      const id = (await createClient(tx, { name: "Temp", slug: `sg-temp-${suffix}` })).id;
      const loc = (await createLocation(tx, id, { name: "T", timeZone: "UTC" })).id;
      return { id, loc };
    });
    const token = await withAgency(db, (tx) =>
      createConnectorToken(
        tx,
        { name: `n8n-temp-${suffix}`, sources: ["toast"], clientIds: [orphan.id] },
        actor,
      ),
    );
    const principal = (await authenticateToken(db, token.token)) as typeof tokenA;
    await ingestSignals(
      db,
      principal,
      [row({ locationId: orphan.loc, source: "toast", signalType: "order" })],
      { now: NOW },
    );
    expect(await countRows(orphan.id)).toBe(1);
    await withAgency(db, (tx) => tx.execute(sql`delete from core.clients where id = ${orphan.id}`));
    const left = await admin.unsafe(
      "select count(*)::int as n from signals.signals_daily where client_id = $1",
      [orphan.id],
    );
    expect((left[0] as { n: number }).n).toBe(0);
  });
});

describe("database constraints match the contracts", () => {
  async function allowed(table: string, column: string) {
    const rows = (await admin.unsafe(
      `select pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = '${table}'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%${column}%'`,
    )) as { def: string }[];
    return rows.flatMap((r) =>
      [...r.def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1] as string),
    );
  }

  test("sources, platforms and signal types are the same lists in the contract and the table", async () => {
    expect((await allowed("signals.signals_daily", "source")).sort()).toEqual(
      [...SIGNAL_SOURCES].sort(),
    );
    expect((await allowed("signals.signals_daily", "platform")).sort()).toEqual(
      [...SIGNAL_PLATFORMS].sort(),
    );
    expect((await allowed("signals.signals_daily", "signal_type")).sort()).toEqual(
      [...SIGNAL_TYPES].sort(),
    );
  });

  test("access levels used elsewhere stay in step too", async () => {
    expect((await allowed("core.feature_overrides", "level")).sort()).toEqual(
      [...ACCESS_LEVELS].sort(),
    );
  });
});

describe("connector tokens", () => {
  test("only the hash is stored, never the token", async () => {
    const issued = await withAgency(db, (tx) =>
      createConnectorToken(
        tx,
        { name: `n8n-hash-${suffix}`, sources: ["toast"], clientIds: [a] },
        actor,
      ),
    );
    const rows = (await admin.unsafe(
      "select token_hash from signals.connector_tokens where id = $1",
      [issued.id],
    )) as { token_hash: string }[];
    expect(rows[0]?.token_hash).toBe(hashToken(issued.token));
    expect(rows[0]?.token_hash).not.toContain(issued.token);
    expect(issued.token.startsWith("atg_")).toBe(true);
  });

  test("an unknown, malformed or oversized token authenticates as nobody", async () => {
    expect(await authenticateToken(db, "atg_not-a-real-token")).toBeNull();
    expect(await authenticateToken(db, "plain")).toBeNull();
    expect(await authenticateToken(db, `atg_${"x".repeat(500)}`)).toBeNull();
  });

  test("a revoked token stops working at once", async () => {
    const issued = await withAgency(db, (tx) =>
      createConnectorToken(
        tx,
        { name: `n8n-rev-${suffix}`, sources: ["toast"], clientIds: [a] },
        actor,
      ),
    );
    expect(await authenticateToken(db, issued.token)).not.toBeNull();
    expect(await withAgency(db, (tx) => revokeConnectorToken(tx, issued.id, actor))).toBe(true);
    expect(await authenticateToken(db, issued.token)).toBeNull();
    expect(await withAgency(db, (tx) => revokeConnectorToken(tx, issued.id, actor))).toBe(false);
  });

  test("only the agency creates tokens, and only for known sources and real lists", async () => {
    const make =
      (sources: string[], clientIds: string[]) =>
      (tx: Parameters<Parameters<typeof withAgency>[1]>[0]) =>
        createConnectorToken(tx, { name: `n8n-bad-${suffix}`, sources, clientIds }, actor);
    await expect(withTenant(db, a, make(["toast"], [a]))).rejects.toThrow();
    await expect(withAgency(db, make(["myspace"], [a]))).rejects.toThrow("unknown source");
    await expect(withAgency(db, make([], [a]))).rejects.toThrow("at least one source");
    await expect(withAgency(db, make(["toast"], []))).rejects.toThrow("at least one client");
  });

  test("a client cannot read the token table", async () => {
    const rows = await withTenant(db, a, (tx) =>
      tx.execute(sql`select * from signals.connector_tokens`),
    );
    expect(rows.length).toBe(0);
  });

  test("creating a token is audited without the token itself", async () => {
    const rows = (await admin.unsafe(
      "select input, output from core.audit_log where action = 'signals.create_connector_token' and actor_id = $1 limit 1",
      [actor.id],
    )) as { input: unknown; output: unknown }[];
    expect(rows[0]).toBeDefined();
    expect(JSON.stringify(rows[0])).not.toContain("atg_");
  });

  test("using a token stamps its last use", async () => {
    const rows = (await admin.unsafe(
      "select last_used_at from signals.connector_tokens where name = $1",
      [`n8n-a-${suffix}`],
    )) as { last_used_at: Date | null }[];
    expect(rows[0]?.last_used_at).not.toBeNull();
  });
});
