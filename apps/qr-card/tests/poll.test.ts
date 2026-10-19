import { expect, test } from "bun:test";
import { type CardStatus, type CardView, createCardPoller, delayFor, fetchCard } from "../lib/poll";

const TOKEN = "t".repeat(22);

function view(over: Partial<CardView> = {}): CardView {
  return {
    state: "active",
    locationName: "Cafe",
    programName: "Coffee",
    rewardLabel: "Free coffee",
    accent: "lime",
    stampsRequired: 10,
    stampsInCycle: 0,
    rewardReady: false,
    shortCode: "ABCD-EFGH",
    etag: "x",
    ...over,
  };
}

function json(v: CardView, etag: string): Response {
  return new Response(JSON.stringify(v), {
    status: 200,
    headers: { "content-type": "application/json", ETag: etag },
  });
}

type Answer = Response | Error | Promise<Response>;

function makeFetch(queue: Answer[]) {
  const calls: { url: string; headers: Headers; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) throw new Error("queue empty");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return {
    fn,
    calls,
    last: () => calls[calls.length - 1] as (typeof calls)[number],
  };
}

function makeSchedule() {
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const schedule = (fn: () => void, ms: number) => {
    const t = { fn, ms, cancelled: false };
    timers.push(t);
    return () => {
      t.cancelled = true;
    };
  };
  return {
    schedule,
    timers,
    pending: () => timers.filter((t) => !t.cancelled),
    /** Run the one pending timer and let the poller's promises settle. */
    async fire() {
      const t = timers.filter((x) => !x.cancelled).pop();
      if (!t) throw new Error("no pending timer");
      t.cancelled = true;
      t.fn();
      await settle();
    },
  };
}

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

function setup(queue: Answer[], visible = { value: true }) {
  const f = makeFetch(queue);
  const s = makeSchedule();
  const views: CardView[] = [];
  const statuses: CardStatus[] = [];
  const poller = createCardPoller({
    token: TOKEN,
    fetchFn: f.fn,
    schedule: s.schedule,
    isVisible: () => visible.value,
    onView: (v) => views.push(v),
    onStatus: (st) => statuses.push(st),
  });
  return { f, s, views, statuses, poller, visible };
}

test("fetchCard sends If-None-Match itself, with no-store, and reads the ETag", async () => {
  const f = makeFetch([json(view({ stampsInCycle: 2 }), '"e2"')]);
  const r = await fetchCard(TOKEN, '"e1"', f.fn);
  expect(f.last().url).toBe(`/loyalty-api/cards/${TOKEN}`);
  expect(f.last().headers.get("if-none-match")).toBe('"e1"');
  expect(f.last().init.cache).toBe("no-store");
  expect(r.kind).toBe("ok");
  if (r.kind === "ok") {
    expect(r.etag).toBe('"e2"');
    expect(r.view.stampsInCycle).toBe(2);
  }
});

test("fetchCard sends no If-None-Match without an etag", async () => {
  const f = makeFetch([json(view(), '"a"')]);
  await fetchCard(TOKEN, null, f.fn);
  expect(f.last().headers.has("if-none-match")).toBe(false);
});

test("304 is not_modified, 404 not_found, 429 rate_limited with Retry-After seconds, a throw or 5xx error", async () => {
  const f = makeFetch([
    new Response(null, { status: 304 }),
    new Response("{}", { status: 404 }),
    new Response("{}", { status: 429, headers: { "Retry-After": "42" } }),
    new Response("{}", { status: 429 }),
    new Response("{}", { status: 503 }),
    new Error("offline"),
    new Response("not json", { status: 200 }),
  ]);
  expect(await fetchCard(TOKEN, '"a"', f.fn)).toEqual({ kind: "not_modified" });
  expect(await fetchCard(TOKEN, null, f.fn)).toEqual({ kind: "not_found" });
  expect(await fetchCard(TOKEN, null, f.fn)).toEqual({ kind: "rate_limited", retryAfter: 42 });
  expect((await fetchCard(TOKEN, null, f.fn)).kind).toBe("rate_limited");
  expect(await fetchCard(TOKEN, null, f.fn)).toEqual({ kind: "error" });
  expect(await fetchCard(TOKEN, null, f.fn)).toEqual({ kind: "error" });
  expect(await fetchCard(TOKEN, null, f.fn)).toEqual({ kind: "error" });
});

test("delayFor: 5 s visible, 30 s hidden, Retry-After when limited, doubling up to 60 s on errors, stop on not_found", () => {
  const ok = { kind: "not_modified" } as const;
  expect(delayFor(true, ok, 0)).toBe(5_000);
  expect(delayFor(false, ok, 0)).toBe(30_000);
  expect(delayFor(true, { kind: "rate_limited", retryAfter: 90 }, 0)).toBe(90_000);
  expect(delayFor(true, { kind: "error" }, 1)).toBe(10_000);
  expect(delayFor(true, { kind: "error" }, 2)).toBe(20_000);
  expect(delayFor(true, { kind: "error" }, 9)).toBe(60_000);
  expect(delayFor(false, { kind: "error" }, 3)).toBe(60_000);
  expect(delayFor(true, { kind: "not_found" }, 0)).toBeNull();
});

test("the stamp arrives: onView fires for 3, not for the 304, then for 4", async () => {
  const t = setup([
    json(view({ stampsInCycle: 3 }), '"a"'),
    new Response(null, { status: 304 }),
    json(view({ stampsInCycle: 4 }), '"b"'),
  ]);
  t.poller.start();
  await settle();
  expect(t.s.pending().map((x) => x.ms)).toEqual([5_000]);
  await t.s.fire();
  await t.s.fire();
  expect(t.views.map((v) => v.stampsInCycle)).toEqual([3, 4]);
  expect(t.f.calls.map((c) => c.headers.get("if-none-match"))).toEqual([null, '"a"', '"a"']);
  expect(t.statuses.at(-1)).toBe("live");
});

test("a closed card stops polling; a paused one keeps the normal cadence", async () => {
  const closed = setup([json(view({ state: "closed" }), '"c"')]);
  closed.poller.start();
  await settle();
  expect(closed.views).toHaveLength(1);
  expect(closed.s.pending()).toHaveLength(0);

  const paused = setup([json(view({ state: "paused" }), '"p"')]);
  paused.poller.start();
  await settle();
  expect(paused.s.pending().map((x) => x.ms)).toEqual([5_000]);
});

test("not_found stops polling and says so; rate_limited waits Retry-After", async () => {
  const nf = setup([new Response("{}", { status: 404 })]);
  nf.poller.start();
  await settle();
  expect(nf.statuses.at(-1)).toBe("not_found");
  expect(nf.s.pending()).toHaveLength(0);

  const rl = setup([new Response("{}", { status: 429, headers: { "Retry-After": "90" } })]);
  rl.poller.start();
  await settle();
  expect(rl.statuses.at(-1)).toBe("rate_limited");
  expect(rl.s.pending().map((x) => x.ms)).toEqual([90_000]);
});

test("becoming visible fetches at once and cancels the 30 s wait", async () => {
  const visible = { value: false };
  const t = setup([json(view(), '"a"'), new Response(null, { status: 304 })], visible);
  t.poller.start();
  await settle();
  expect(t.s.pending().map((x) => x.ms)).toEqual([30_000]);
  visible.value = true;
  t.poller.visibilityChanged();
  await settle();
  expect(t.f.calls).toHaveLength(2);
  expect(t.s.timers[0]?.cancelled).toBe(true);
  expect(t.s.pending().map((x) => x.ms)).toEqual([5_000]);
});

test("an error after a good view keeps the view and says offline; the next 200 says live", async () => {
  const t = setup([
    json(view({ stampsInCycle: 1 }), '"a"'),
    new Error("offline"),
    json(view({ stampsInCycle: 2 }), '"b"'),
  ]);
  t.poller.start();
  await settle();
  await t.s.fire();
  expect(t.statuses.at(-1)).toBe("offline");
  expect(t.views).toHaveLength(1);
  expect(t.s.pending().map((x) => x.ms)).toEqual([10_000]);
  await t.s.fire();
  expect(t.statuses.at(-1)).toBe("live");
  expect(t.views.map((v) => v.stampsInCycle)).toEqual([1, 2]);
});

test("stop() cancels the pending timer and ignores an answer that lands later", async () => {
  let release!: (r: Response) => void;
  const slow = new Promise<Response>((res) => {
    release = res;
  });
  const t = setup([slow]);
  t.poller.start();
  await settle();
  t.poller.stop();
  release(json(view({ stampsInCycle: 7 }), '"z"'));
  await settle();
  expect(t.views).toHaveLength(0);
  expect(t.s.pending()).toHaveLength(0);

  const t2 = setup([json(view(), '"a"')]);
  t2.poller.start();
  await settle();
  t2.poller.stop();
  expect(t2.s.pending()).toHaveLength(0);
});

test("refresh() during a request waits for it: one request in flight, one timer", async () => {
  let release!: (r: Response) => void;
  const slow = new Promise<Response>((res) => {
    release = res;
  });
  const t = setup([slow, json(view({ stampsInCycle: 2 }), '"b"')]);
  t.poller.start();
  await settle();
  t.poller.refresh();
  await settle();
  expect(t.f.calls).toHaveLength(1);
  release(json(view({ stampsInCycle: 1 }), '"a"'));
  await settle();
  expect(t.f.calls).toHaveLength(2);
  expect(t.views.map((v) => v.stampsInCycle)).toEqual([1, 2]);
  expect(t.s.pending()).toHaveLength(1);
});
