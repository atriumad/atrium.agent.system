import { fetchCard } from "./poll";
import type { cardStore } from "./storage";

export type JoinOutcome =
  | { kind: "card"; token: string }
  | { kind: "invalid" }
  | { kind: "paused" }
  | { kind: "device_limit" }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "error" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const JOIN_RE = new RegExp(`^jq1\\.(${UUID})\\.\\d+\\.[A-Za-z0-9_-]+$`, "i");
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

/** `jq1.<uuid>.<int>.<sig>` gives the program's uuid; anything else gives null. */
export function programIdOf(joinToken: string): string | null {
  return JOIN_RE.exec(joinToken)?.[1]?.toLowerCase() ?? null;
}

type Deps = { fetchFn?: typeof fetch; store: ReturnType<typeof cardStore> };

// One join per token at a time: React strict mode runs an effect twice, and a second POST would
// burn the device's issue limit.
const inFlight = new Map<string, Promise<JoinOutcome>>();

export function startJoin(joinToken: string, deps: Deps): Promise<JoinOutcome> {
  const existing = inFlight.get(joinToken);
  if (existing) return existing;
  const p = join(joinToken, deps).finally(() => inFlight.delete(joinToken));
  inFlight.set(joinToken, p);
  return p;
}

async function join(joinToken: string, { fetchFn = fetch, store }: Deps): Promise<JoinOutcome> {
  const programId = programIdOf(joinToken);
  if (!programId) return { kind: "invalid" };

  const stored = store.load(programId);
  if (stored) {
    const res = await fetchCard(stored, null, fetchFn);
    // Only a 404 means the card is gone. Any other answer opens the card page, which has its own
    // offline and rate-limited states and polls with backoff.
    if (res.kind !== "not_found") return { kind: "card", token: stored };
    store.forget(programId);
  }

  try {
    const res = await fetchFn("/loyalty-api/cards", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ joinToken }),
      cache: "no-store",
    });
    if (res.status === 201) {
      const body = (await res.json()) as { token?: unknown };
      if (typeof body.token !== "string" || !TOKEN_RE.test(body.token)) return { kind: "error" };
      store.save(programId, body.token);
      return { kind: "card", token: body.token };
    }
    if (res.status === 410) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      return body?.error === "paused" ? { kind: "paused" } : { kind: "invalid" };
    }
    if (res.status === 409) return { kind: "device_limit" };
    if (res.status === 429) {
      const seconds = Number(res.headers.get("Retry-After"));
      return {
        kind: "rate_limited",
        retryAfter: Number.isFinite(seconds) && seconds > 0 ? seconds : 30,
      };
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
