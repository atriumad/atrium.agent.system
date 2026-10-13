// modules/reputation/tests/sentiment.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type AtriumEvent, SurveySubmission } from "@atrium/contracts";
import {
  createAgencyOrganization,
  createClientWithOrganization,
  createDatabase,
  createLocation,
  setPackage,
  withAgency,
  withTenant,
} from "@atrium/core";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { migrate } from "../../../scripts/migrate";
import {
  classifyResponse,
  type ReaderInput,
  ReadingInvalidError,
  type ResponseReader,
  readResponse,
  submitSurvey,
  updateLocationSettings,
} from "../index";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://atrium:atrium@localhost:5432/atrium";
const APP_URL =
  process.env.DATABASE_URL ?? "postgres://atrium_app:atrium_app@localhost:5432/atrium";

const suffix = crypto.randomUUID().slice(0, 8);
const { db, close } = createDatabase(APP_URL);
const admin = new SQL(ADMIN_URL);
const actor = { type: "user", id: `sent-admin-${suffix}` } as const;
const NOW = new Date("2026-10-06T17:00:00Z");
const events: AtriumEvent[] = [];
const publish = async (e: AtriumEvent) => void events.push(e);
const deps = { now: () => NOW, publish };

let a: string;
let locA: string;
let device = 0;

const inA = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db, a, fn);

const respond = async (overrides: Record<string, unknown>) =>
  (
    await submitSurvey(
      db,
      { kind: "qr", clientId: a, locationId: locA, deviceHash: `dev-${suffix}-${device++}` },
      SurveySubmission.parse(overrides),
      deps,
    )
  ).responseId;

function fakeReader(answer: unknown) {
  const calls: ReaderInput[] = [];
  const reader: ResponseReader = {
    model: "test/fake",
    async read(input) {
      calls.push(input);
      return answer;
    },
  };
  return { reader, calls };
}

const SERIOUS = { sentiment: "negative", topics: ["food"], concern: "high", safety: true };
const row = async (id: string) =>
  (
    (await admin.unsafe(
      "select sentiment, topics, concern, safety, read_at, read_model from reputation.survey_responses where id = $1",
      [id],
    )) as Record<string, unknown>[]
  )[0];

beforeAll(async () => {
  await migrate(ADMIN_URL);
  await withAgency(db, async (tx) => {
    await createAgencyOrganization(tx, { name: "Atrium", slug: `atrium-sent-${suffix}` });
    const ca = await createClientWithOrganization(tx, {
      name: "Casa Olivo",
      slug: `sent-olivo-${suffix}`,
    });
    a = ca.client.id;
    locA = (
      await createLocation(tx, a, { name: "Casa Olivo Bellaire", timeZone: "America/Chicago" })
    ).id;
    await setPackage(tx, a, "pillar_3", actor);
    await updateLocationSettings(
      tx,
      a,
      locA,
      {
        reviewUrl: "https://search.google.com/local/writereview?placeid=SENT",
        requestDelayMinutes: 60,
      },
      actor,
    );
  });
});

afterAll(async () => {
  await withAgency(db, (tx) =>
    tx.execute(sql`delete from core.clients where slug like ${`sent-%-${suffix}`}`),
  );
  await admin.unsafe("delete from core.organizations where slug like $1", [`%-${suffix}`]);
  await admin.unsafe("delete from core.audit_log where actor_id like $1", [`%${suffix}`]);
  await admin.close();
  await close();
});

describe("readResponse", () => {
  test("stores the labels, the model and the time, and publishes the event with labels only", async () => {
    const id = await respond({ rating: 5, comment: "Rico, pero me intoxiqué." });
    const { reader, calls } = fakeReader(SERIOUS);
    const before = events.filter((e) => e.type === "survey.response.read").length;

    const outcome = await inA((tx) => readResponse(tx, reader, id, deps));

    expect(outcome).toEqual({
      status: "read",
      sentiment: "negative",
      concern: "high",
      safety: true,
    });
    expect(calls).toEqual([
      { rating: 5, bestPart: null, improve: null, comment: "Rico, pero me intoxiqué." },
    ]);
    expect(await row(id)).toMatchObject({
      sentiment: "negative",
      topics: ["food"],
      concern: "high",
      safety: true,
      read_model: "test/fake",
    });
    const published = events.filter((e) => e.type === "survey.response.read");
    expect(published.length).toBe(before + 1);
    expect(JSON.stringify(published.at(-1))).not.toContain("intoxiqué");
  });

  test("reading twice calls the model once and publishes once", async () => {
    const id = await respond({ rating: 5, comment: "Todo bien." });
    const { reader, calls } = fakeReader({
      sentiment: "positive",
      topics: [],
      concern: "none",
      safety: false,
    });
    const before = events.filter((e) => e.type === "survey.response.read").length;
    const first = await inA((tx) => readResponse(tx, reader, id, deps));
    const second = await inA((tx) => readResponse(tx, reader, id, deps));
    expect(first.status).toBe("read");
    expect(second).toEqual({
      status: "already_read",
      sentiment: "positive",
      concern: "none",
      safety: false,
    });
    expect(calls.length).toBe(1);
    expect(events.filter((e) => e.type === "survey.response.read").length).toBe(before + 1);
  });

  test("two readers racing on one response: one publishes, both get labels, no row lock is held across the model", async () => {
    const id = await respond({ rating: 5, comment: "Carrera de lecturas." });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const reader: ResponseReader = {
      model: "test/race",
      async read() {
        started++;
        await gate;
        return { sentiment: "mixed", topics: ["wait"], concern: "low", safety: false };
      },
    };
    const before = events.filter((e) => e.type === "survey.response.read").length;
    const both = Promise.all([
      inA((tx) => readResponse(tx, reader, id, deps)),
      inA((tx) => readResponse(tx, reader, id, deps)),
    ]);
    const deadline = Date.now() + 3000;
    while (started < 2 && Date.now() < deadline) await Bun.sleep(25);
    release();
    const outcomes = await both;

    expect(started).toBe(2);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["already_read", "read"]);
    for (const o of outcomes) {
      expect(o).toMatchObject({ sentiment: "mixed", concern: "low", safety: false });
    }
    expect(events.filter((e) => e.type === "survey.response.read").length).toBe(before + 1);
    expect(await row(id)).toMatchObject({
      sentiment: "mixed",
      topics: ["wait"],
      read_model: "test/race",
    });
  });

  test("a response with no comment is not sent to the model and stays unread", async () => {
    const id = await respond({ rating: 4 });
    const { reader, calls } = fakeReader(SERIOUS);
    const outcome = await inA((tx) => readResponse(tx, reader, id, deps));
    expect(outcome).toEqual({ status: "no_text", sentiment: null, concern: null, safety: null });
    expect(calls.length).toBe(0);
    expect((await row(id))?.read_at).toBeNull();
  });

  test("an answer outside the schema is rejected and the response stays unread", async () => {
    const id = await respond({ rating: 5, comment: "Hola" });
    for (const bad of [
      { sentiment: "positive", topics: [], concern: "critical", safety: false },
      {
        sentiment: "positive",
        topics: ["food", "wait", "price", "staff"],
        concern: "none",
        safety: false,
      },
      { sentiment: "positive", topics: [], concern: "none", safety: false, extra: "x" },
      "not an object",
    ]) {
      const { reader } = fakeReader(bad);
      await expect(inA((tx) => readResponse(tx, reader, id, deps))).rejects.toBeInstanceOf(
        ReadingInvalidError,
      );
    }
    expect((await row(id))?.read_at).toBeNull();
  });

  test("a reader that throws leaves the response unread", async () => {
    const id = await respond({ rating: 5, comment: "Hola" });
    const reader: ResponseReader = {
      model: "test/down",
      read: async () => {
        throw new Error("provider down");
      },
    };
    await expect(inA((tx) => readResponse(tx, reader, id, deps))).rejects.toThrow("provider down");
    expect((await row(id))?.read_at).toBeNull();
  });

  test("duplicate topics are stored once", async () => {
    const id = await respond({ rating: 3, comment: "Lento y lento" });
    const { reader } = fakeReader({
      sentiment: "mixed",
      topics: ["wait", "wait"],
      concern: "low",
      safety: false,
    });
    await inA((tx) => readResponse(tx, reader, id, deps));
    expect((await row(id))?.topics).toEqual(["wait"]);
  });

  test("the database refuses a half-read row", async () => {
    const id = await respond({ rating: 5, comment: "Hola" });
    await expect(
      (async () =>
        admin.unsafe(
          "update reputation.survey_responses set sentiment = 'positive' where id = $1",
          [id],
        ))(),
    ).rejects.toThrow();
  });
});

describe("classifyResponse with a reading", () => {
  test("a five-star answer with a safety reading is high and needs a case", async () => {
    const id = await respond({ rating: 5, comment: "Me dio una alergia fuerte." });
    expect(await inA((tx) => classifyResponse(tx, id))).toEqual({
      severity: null,
      shouldOpen: false,
    });
    await inA((tx) => readResponse(tx, fakeReader(SERIOUS).reader, id, deps));
    expect(await inA((tx) => classifyResponse(tx, id))).toEqual({
      severity: "high",
      shouldOpen: true,
    });
  });

  test("a calm reading never lowers a two-star answer", async () => {
    const id = await respond({ rating: 2, comment: "Meh" });
    await inA((tx) =>
      readResponse(
        tx,
        fakeReader({ sentiment: "positive", topics: [], concern: "none", safety: false }).reader,
        id,
        deps,
      ),
    );
    expect(await inA((tx) => classifyResponse(tx, id))).toEqual({
      severity: "medium",
      shouldOpen: true,
    });
  });

  test("a low concern labels but does not open a case", async () => {
    const id = await respond({ rating: 5, comment: "Un poco lento" });
    await inA((tx) =>
      readResponse(
        tx,
        fakeReader({ sentiment: "mixed", topics: ["wait"], concern: "low", safety: false }).reader,
        id,
        deps,
      ),
    );
    expect(await inA((tx) => classifyResponse(tx, id))).toEqual({
      severity: "low",
      shouldOpen: false,
    });
  });
});
