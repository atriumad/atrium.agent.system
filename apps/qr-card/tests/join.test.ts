import { beforeEach, expect, test } from "bun:test";
import { programIdOf, startJoin } from "../lib/join";
import { cardStore, type StorageLike } from "../lib/storage";

const PID = "11111111-1111-4111-8111-111111111111";
const JT = `jq1.${PID}.1.sig`;

function mapStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

type Call = { url: string; method: string; body: string };

function makeFake(answers: Response[]) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    await Promise.resolve();
    const next = answers.shift();
    if (!next) throw new Error("no answer queued");
    return next;
  }) as typeof fetch;
  return {
    fn,
    calls,
    get posts() {
      return calls.filter((c) => c.method === "POST").length;
    },
    last: () => calls[calls.length - 1] as Call,
  };
}

const created = (token = "t".repeat(22)) =>
  new Response(JSON.stringify({ token, shortCode: "ABCD-EFGH" }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
const status = (s: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status: s, headers });

let store: ReturnType<typeof cardStore>;
let jt: string;
let n = 0;

beforeEach(() => {
  store = cardStore(mapStorage());
  // The in-flight map is module level and keyed by token; a fresh token per test keeps tests apart.
  n += 1;
  jt = `jq1.${PID}.${n}.sig`;
});

test("programIdOf reads the program from a join token and refuses anything else", () => {
  expect(programIdOf(JT)).toBe(PID);
  expect(programIdOf("qr1.x.1.sig")).toBeNull();
  expect(programIdOf("jq1.not-a-uuid.1.sig")).toBeNull();
});

test("201 saves the card for the program and returns it", async () => {
  const fake = makeFake([created()]);
  expect(await startJoin(jt, { fetchFn: fake.fn, store })).toEqual({
    kind: "card",
    token: "t".repeat(22),
  });
  expect(store.load(PID)).toBe("t".repeat(22));
  expect(fake.last().url).toBe("/loyalty-api/cards");
  expect(JSON.parse(fake.last().body)).toEqual({ joinToken: jt });
});

test("Review Focus 1: two calls at once post once", async () => {
  const fake = makeFake([created()]);
  const deps = { fetchFn: fake.fn, store };
  const [a, b] = await Promise.all([startJoin(jt, deps), startJoin(jt, deps)]);
  expect(a).toEqual(b);
  expect(fake.posts).toBe(1);
});

test("Review Focus 2: a stored card that still answers opens without a POST", async () => {
  store.save(PID, "s".repeat(22));
  const fake = makeFake([
    new Response(JSON.stringify({ state: "active" }), { status: 200, headers: { ETag: '"x"' } }),
  ]);
  expect(await startJoin(jt, { fetchFn: fake.fn, store })).toEqual({
    kind: "card",
    token: "s".repeat(22),
  });
  expect(fake.posts).toBe(0);
});

test("a stored card that is gone is forgotten and a new one is issued", async () => {
  store.save(PID, "s".repeat(22));
  const fake = makeFake([status(404), created("n".repeat(22))]);
  expect(await startJoin(jt, { fetchFn: fake.fn, store })).toEqual({
    kind: "card",
    token: "n".repeat(22),
  });
  expect(fake.posts).toBe(1);
  expect(store.load(PID)).toBe("n".repeat(22));
});

test("410 paused, 410 invalid, 409 device_limit, 429 with Retry-After, 502 error", async () => {
  const run = async (res: Response) => {
    const fake = makeFake([res]);
    n += 1;
    return startJoin(`jq1.${PID}.${n}.sig`, { fetchFn: fake.fn, store });
  };
  expect(await run(status(410, { error: "paused" }))).toEqual({ kind: "paused" });
  expect(await run(status(410, { error: "revoked" }))).toEqual({ kind: "invalid" });
  expect(await run(status(410))).toEqual({ kind: "invalid" });
  expect(await run(status(409, { error: "device_limit" }))).toEqual({ kind: "device_limit" });
  expect(await run(status(429, undefined, { "Retry-After": "42" }))).toEqual({
    kind: "rate_limited",
    retryAfter: 42,
  });
  expect(await run(status(429))).toEqual({ kind: "rate_limited", retryAfter: 30 });
  expect(await run(status(502))).toEqual({ kind: "error" });
  expect(store.load(PID)).toBeNull();
});

test("a network failure is an error and a settled join can be retried", async () => {
  const bad = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  expect(await startJoin(jt, { fetchFn: bad, store })).toEqual({ kind: "error" });
  const fake = makeFake([created()]);
  expect(await startJoin(jt, { fetchFn: fake.fn, store })).toEqual({
    kind: "card",
    token: "t".repeat(22),
  });
});

test("a malformed join token makes no request", async () => {
  const fake = makeFake([]);
  expect(await startJoin("qr1.x.1.sig", { fetchFn: fake.fn, store })).toEqual({ kind: "invalid" });
  expect(fake.calls.length).toBe(0);
});
