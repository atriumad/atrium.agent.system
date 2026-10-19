export type CardView = {
  state: "active" | "paused" | "closed";
  locationName: string;
  programName: string;
  rewardLabel: string;
  accent: "lime" | "clay" | "charcoal" | "sage";
  stampsRequired: number;
  stampsInCycle: number;
  rewardReady: boolean;
  shortCode: string;
  etag: string;
};

export type PollResult =
  | { kind: "ok"; view: CardView; etag: string | null }
  | { kind: "not_modified" }
  | { kind: "not_found" }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "error" };

export type CardStatus = "loading" | "live" | "offline" | "not_found" | "rate_limited";

const VISIBLE_MS = 5_000;
const HIDDEN_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * One poll of the card. It sends If-None-Match itself and asks for no-store: the API answers
 * `Cache-Control: no-store`, so the browser would never revalidate for us.
 */
export async function fetchCard(
  token: string,
  etag: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<PollResult> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (etag) headers["If-None-Match"] = etag;
    const res = await fetchFn(`/loyalty-api/cards/${token}`, { headers, cache: "no-store" });
    if (res.status === 304) return { kind: "not_modified" };
    if (res.status === 404) return { kind: "not_found" };
    if (res.status === 429) {
      const seconds = Number(res.headers.get("Retry-After"));
      return {
        kind: "rate_limited",
        retryAfter: Number.isFinite(seconds) && seconds > 0 ? seconds : 30,
      };
    }
    if (!res.ok) return { kind: "error" };
    const view = (await res.json()) as CardView;
    return { kind: "ok", view, etag: res.headers.get("ETag") };
  } catch {
    return { kind: "error" };
  }
}

/** Milliseconds until the next poll, or null to stop. `failures` is the run of errors so far. */
export function delayFor(visible: boolean, result: PollResult, failures: number): number | null {
  const base = visible ? VISIBLE_MS : HIDDEN_MS;
  switch (result.kind) {
    case "not_found":
      return null;
    case "rate_limited":
      return Math.max(result.retryAfter, 1) * 1000;
    case "error":
      return Math.min(base * 2 ** Math.max(failures, 0), MAX_BACKOFF_MS);
    default:
      return base;
  }
}

export type CardPollerOptions = {
  token: string;
  fetchFn?: typeof fetch;
  schedule?: (fn: () => void, ms: number) => () => void;
  isVisible: () => boolean;
  onView: (view: CardView) => void;
  onStatus: (s: CardStatus) => void;
};

const defaultSchedule = (fn: () => void, ms: number) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** Polls one card: at most one timer and one request at a time, the ETag kept in a closure. */
export function createCardPoller(opts: CardPollerOptions) {
  const schedule = opts.schedule ?? defaultSchedule;
  let etag: string | null = null;
  let failures = 0;
  let cancelTimer: (() => void) | null = null;
  let inFlight = false;
  let again = false;
  let stopped = true;
  let finished = false;

  function clearTimer() {
    cancelTimer?.();
    cancelTimer = null;
  }

  function arm(ms: number) {
    clearTimer();
    cancelTimer = schedule(() => {
      cancelTimer = null;
      void run();
    }, ms);
  }

  async function run() {
    if (stopped) return;
    clearTimer();
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    const result = await fetchCard(opts.token, etag, opts.fetchFn);
    inFlight = false;
    if (stopped) return;
    finished = false;
    let closed = false;
    switch (result.kind) {
      case "ok":
        failures = 0;
        if (result.etag) etag = result.etag;
        opts.onView(result.view);
        opts.onStatus("live");
        closed = result.view.state === "closed";
        break;
      case "not_modified":
        failures = 0;
        opts.onStatus("live");
        break;
      case "not_found":
        opts.onStatus("not_found");
        break;
      case "rate_limited":
        opts.onStatus("rate_limited");
        break;
      case "error":
        failures += 1;
        opts.onStatus("offline");
        break;
    }
    const delay = closed ? null : delayFor(opts.isVisible(), result, failures);
    if (delay === null) finished = true;
    if (again) {
      again = false;
      void run();
    } else if (delay !== null) {
      arm(delay);
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      finished = false;
      opts.onStatus("loading");
      void run();
    },
    stop() {
      stopped = true;
      again = false;
      clearTimer();
    },
    visibilityChanged() {
      if (stopped || finished) return;
      if (opts.isVisible()) void run();
    },
    refresh() {
      if (stopped) return;
      void run();
    },
  };
}
