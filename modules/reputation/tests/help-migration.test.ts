import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  withAgency,
  withScope,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import { closeRequest, createSurveyRequest } from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const actor = { type: "user", id: `hm-admin-${suffix}` } as const;

let clientA = "";
let clientB = "";
let locA = "";

const insertRequest = async (cols: {
  note: string | null;
  response?: string | null;
  handledBy?: string | null;
}) => {
  const [row] = (await admin.unsafe(
    `insert into reputation.survey_requests
       (client_id, location_id, requested_by, requested_by_name, note, status, handled_by, handled_at, response)
     values ($1, $2, $3, 'Olivia Owner', $4, $5, $6, $7, $8) returning id`,
    [
      clientA,
      locA,
      `hm-owner-${suffix}`,
      cols.note,
      cols.response ? "fulfilled" : "open",
      cols.response ? (cols.handledBy ?? "hm-am") : null,
      cols.response ? new Date(Date.now() + 60_000) : null,
      cols.response ?? null,
    ],
  )) as { id: string }[];
  return row?.id as string;
};

const messages = async (requestId: string) =>
  (await admin.unsafe(
    "select side, body, author_name from reputation.survey_request_messages where request_id = $1 order by created_at, side",
    [requestId],
  )) as { side: string; body: string; author_name: string }[];

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-hm-${suffix}` });
    clientA = (
      await createClientWithOrganization(tx, { name: "Casa Olivo", slug: `hm-a-${suffix}` })
    ).client.id;
    clientB = (
      await createClientWithOrganization(tx, { name: "Brasa Norte", slug: `hm-b-${suffix}` })
    ).client.id;
    locA = (await createLocation(tx, clientA, { name: "Bellaire", timeZone: "America/Chicago" }))
      .id;
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`hm-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.close();
  await close();
});

describe("0008 constraints", () => {
  test("a message under another client's request is refused", async () => {
    const requestId = await insertRequest({ note: "Hello" });
    await expect(
      (async () =>
        admin.unsafe(
          `insert into reputation.survey_request_messages
             (request_id, client_id, author_id, author_name, side, body)
           values ($1, $2, 'x', 'X', 'client', 'hi')`,
          [requestId, clientB],
        ))(),
    ).rejects.toThrow();
  });

  test("side, body length and attachment kind are checked", async () => {
    const requestId = await insertRequest({ note: "Hello" });
    const insert = (side: string, body: string, attachment: string | null) =>
      (async () =>
        admin.unsafe(
          `insert into reputation.survey_request_messages
             (request_id, client_id, author_id, author_name, side, body, attachment)
           values ($1, $2, 'x', 'X', $3, $4, $5::text::jsonb)`,
          [requestId, clientA, side, body, attachment],
        ))();
    await expect(insert("robot", "hi", null)).rejects.toThrow();
    await expect(insert("client", "", null)).rejects.toThrow();
    await expect(insert("client", "x".repeat(2001), null)).rejects.toThrow();
    await expect(insert("client", "hi", JSON.stringify({ kind: "file" }))).rejects.toThrow();
    await insert("client", "hi", JSON.stringify({ kind: "review", url: "https://x.test/r" }));
  });
});

describe("0008 backfill", () => {
  const backfill = readFileSync(
    join(import.meta.dir, "../migrations/0008_help_threads.sql"),
    "utf8",
  ).split("-- backfill:")[1] as string;

  test("a request with a note and a response becomes two ordered messages", async () => {
    const id = await insertRequest({ note: "Change our Google link", response: "Done, check it." });
    await admin.unsafe(backfill);
    expect(await messages(id)).toEqual([
      { side: "client", body: "Change our Google link", author_name: "Olivia Owner" },
      { side: "agency", body: "Done, check it.", author_name: "Atrium team" },
    ]);
    const [r] = (await admin.unsafe(
      "select last_author_side, last_preview from reputation.survey_requests where id = $1",
      [id],
    )) as { last_author_side: string; last_preview: string }[];
    expect(r).toEqual({ last_author_side: "agency", last_preview: "Done, check it." });
  });

  test("a request with no note gets a placeholder first message, and re-running adds nothing", async () => {
    const id = await insertRequest({ note: null });
    await admin.unsafe(backfill);
    await admin.unsafe(backfill);
    expect(await messages(id)).toEqual([
      { side: "client", body: "(no message)", author_name: "Olivia Owner" },
    ]);
  });

  test("a request made by the new code is never touched by the backfill", async () => {
    const scope = {
      kind: "client",
      userId: `hm-owner-${suffix}`,
      role: "client_owner",
      clientId: clientA,
    } as const;
    const requestId = await withScope(db, scope, (tx) =>
      createSurveyRequest(tx, scope, "Olivia Owner", { locationId: locA, note: "Fresh" }),
    );
    await withScope(db, scope, (tx) =>
      closeRequest(tx, scope, "Olivia Owner", requestId, "fulfilled", "All good now"),
    );
    const before = await messages(requestId);
    expect(before.length).toBe(2);
    await admin.unsafe(backfill);
    expect(await messages(requestId)).toEqual(before);
  });
});
