import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  ACCENTS,
  canStamp,
  type EventRow,
  formatShortCode,
  generateCardToken,
  generateShortCode,
  hashCardToken,
  LIMITS,
  looksLikeCardToken,
  normalizeShortCode,
  progress,
  rateAllowed,
  retryAfterSeconds,
  signJoinToken,
  verifyJoinToken,
  windowStart,
} from "../domain";

describe("card tokens", () => {
  test("generateCardToken is 22 base64url characters and unique", () => {
    const a = generateCardToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(generateCardToken()).not.toBe(a);
  });
  test("hashCardToken is 64 hex and stable", () => {
    const t = generateCardToken();
    expect(hashCardToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCardToken(t)).toBe(hashCardToken(t));
  });
  test("looksLikeCardToken", () => {
    expect(looksLikeCardToken(generateCardToken())).toBe(true);
    expect(looksLikeCardToken("")).toBe(false);
    expect(looksLikeCardToken("a".repeat(21))).toBe(false);
    expect(looksLikeCardToken(`${"a".repeat(21)}+`)).toBe(false);
  });
});

describe("short codes", () => {
  test("generateShortCode uses only the alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateShortCode();
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });
  test("an injected random of 0 gives the first character", () => {
    expect(generateShortCode(() => 0)).toBe("22222222");
    expect(generateShortCode(() => 1)).toBe("ZZZZZZZZ");
  });
  test("formatShortCode", () => {
    expect(formatShortCode("K7M492QD")).toBe("K7M4-92QD");
  });
  test("normalizeShortCode", () => {
    expect(normalizeShortCode(" k7m4-92qd ")).toBe("K7M492QD");
    expect(normalizeShortCode("K7M4-92Q")).toBeNull();
    expect(normalizeShortCode("K7M4-92Q0")).toBeNull();
  });
});

describe("join tokens", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const token = signJoinToken("s", id, 3);
  test("round trips", () => {
    expect(verifyJoinToken("s", token)).toEqual({ programId: id, version: 3 });
  });
  test("rejects tampering", () => {
    const parts = token.split(".");
    const sig = parts[3] as string;
    const flipped = `${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`;
    expect(verifyJoinToken("s", [...parts.slice(0, 3), flipped].join("."))).toBeNull();
    expect(verifyJoinToken("s", `${parts[0]}.${id}.4.${sig}`)).toBeNull();
    expect(verifyJoinToken("other", token)).toBeNull();
  });
  test("the signature is the HMAC of join:<programId>:<version>", () => {
    const expected = createHmac("sha256", "s").update(`join:${id}:3`).digest("base64url");
    expect(token).toBe(`jq1.${id}.3.${expected}`);
    const old = createHmac("sha256", "s").update(`jq1.${id}.3`).digest("base64url");
    expect(verifyJoinToken("s", `jq1.${id}.3.${old}`)).toBeNull();
  });
  test("rejects other prefixes", () => {
    expect(verifyJoinToken("s", token.replace(/^jq1/, "qr1"))).toBeNull();
    expect(verifyJoinToken("s", token.replace(/^jq1/, "jq2"))).toBeNull();
  });
  test("rejects a non-uuid id and non-positive versions", () => {
    const forge = (pid: string, v: string) => {
      const payload = `jq1.${pid}.${v}`;
      const message = `join:${pid}:${v}`;
      return `${payload}.${createHmac("sha256", "s").update(message).digest("base64url")}`;
    };
    expect(verifyJoinToken("s", forge("nope", "3"))).toBeNull();
    expect(verifyJoinToken("s", forge(id, "0"))).toBeNull();
    expect(verifyJoinToken("s", forge(id, "-1"))).toBeNull();
  });
  test("signing refuses bad input", () => {
    expect(() => signJoinToken("s", "nope", 3)).toThrow();
    expect(() => signJoinToken("s", id, 0)).toThrow();
    expect(() => signJoinToken("s", id, -1)).toThrow();
    expect(() => signJoinToken("s", id, 1.5)).toThrow();
    expect(() => signJoinToken("s", id, 1_000_000)).toThrow();
    expect(() => signJoinToken("s", id, 999_999)).not.toThrow();
  });
  test("the program id comes back lower-cased", () => {
    const mixed = "ABCDEF12-1111-4111-8111-111111111111";
    expect(verifyJoinToken("s", signJoinToken("s", mixed, 2))?.programId).toBe(mixed.toLowerCase());
  });
  test("a token for one program never verifies as another", () => {
    const other = id.replace(/^1/, "2");
    expect(verifyJoinToken("s", token.replace(id, other))).toBeNull();
  });
});

const T0 = new Date("2026-10-01T10:00:00Z").getTime();
let n = 0;
const ev = (kind: EventRow["kind"], extra: Partial<EventRow> = {}): EventRow => ({
  kind,
  at: new Date(T0 + n * 1000),
  id: `e${n}`,
  seq: n++,
  ...extra,
});
const stamps = (count: number) => Array.from({ length: count }, () => ev("stamp"));

describe("progress", () => {
  test("counts stamps in the cycle", () => {
    expect(progress(stamps(3), 8)).toEqual({
      stampsInCycle: 3,
      rewardsEarned: 0,
      rewardsRedeemed: 0,
      rewardReady: false,
    });
  });
  test("a reward starts a new cycle and is ready until redeemed", () => {
    const events = [...stamps(8), ev("reward_earned")];
    const p = progress(events, 8);
    expect(p).toMatchObject({ stampsInCycle: 0, rewardsEarned: 1, rewardReady: true });
    const redeemed = progress([...events, ev("reward_redeemed")], 8);
    expect(redeemed).toMatchObject({ rewardsRedeemed: 1, rewardReady: false });
  });
  test("a void cancels the stamp it points to", () => {
    const s = stamps(3);
    const events = [...s, ev("void", { voidsId: (s[2] as EventRow).id })];
    expect(progress(events, 8).stampsInCycle).toBe(2);
  });
  test("a void of a stamp from a finished cycle is ignored", () => {
    const old = stamps(8);
    const events = [
      ...old,
      ev("reward_earned"),
      ...stamps(2),
      ev("void", { voidsId: (old[0] as EventRow).id }),
    ];
    expect(progress(events, 8).stampsInCycle).toBe(2);
  });
});

describe("progress ordering", () => {
  const at = new Date(T0);
  const stamp = { id: "s", seq: 1, kind: "stamp", at } as const;
  const earned = { id: "r", seq: 2, kind: "reward_earned", at } as const;
  test("equal timestamps are ordered by seq", () => {
    expect(progress([stamp, earned], 8)).toMatchObject({ stampsInCycle: 0, rewardsEarned: 1 });
  });
  test("array order does not matter, seq does", () => {
    expect(progress([earned, stamp], 8)).toMatchObject({ stampsInCycle: 0, rewardsEarned: 1 });
  });
  test("a void with the same at and a higher seq cancels its stamp", () => {
    const v = { id: "v", seq: 2, kind: "void", at, voidsId: "s" } as const;
    expect(progress([v, stamp], 8).stampsInCycle).toBe(0);
  });
  test("reward_redeemed counts each time", () => {
    const events = [
      ev("reward_earned"),
      ev("reward_earned"),
      ev("reward_redeemed"),
      ev("reward_redeemed"),
    ];
    expect(progress(events, 8)).toMatchObject({ rewardsRedeemed: 2, rewardReady: false });
  });
  test("a void pointing at a non-stamp is a no-op", () => {
    const earnedEvent = ev("reward_earned");
    const s = ev("stamp");
    const events = [earnedEvent, s, ev("void", { voidsId: earnedEvent.id })];
    expect(progress(events, 8)).toMatchObject({ stampsInCycle: 1, rewardsEarned: 1 });
  });
});

describe("canStamp", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const base = {
    programActive: true,
    locationActive: true,
    cardClosed: false,
    lastStampAt: null,
    cooldownMinutes: 240,
    now,
  };
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  test("paused and closed", () => {
    expect(canStamp({ ...base, programActive: false })).toEqual({ ok: false, reason: "paused" });
    expect(canStamp({ ...base, locationActive: false })).toEqual({ ok: false, reason: "paused" });
    expect(canStamp({ ...base, cardClosed: true })).toEqual({ ok: false, reason: "closed" });
  });
  test("cooldown", () => {
    expect(canStamp({ ...base, lastStampAt: ago(239) })).toEqual({
      ok: false,
      reason: "cooldown",
      retryAt: new Date(now.getTime() + 60_000),
    });
    expect(canStamp({ ...base, lastStampAt: ago(240) })).toEqual({ ok: true });
    expect(canStamp(base)).toEqual({ ok: true });
    expect(canStamp({ ...base, cooldownMinutes: 0, lastStampAt: now })).toEqual({ ok: true });
  });
  test("accents", () => {
    expect(ACCENTS).toEqual(["lime", "clay", "charcoal", "sage"]);
  });
});

describe("rate", () => {
  test("windowStart floors to the window", () => {
    expect(windowStart(new Date("2026-10-01T10:17:45Z"), 3600).toISOString()).toBe(
      "2026-10-01T10:00:00.000Z",
    );
    expect(windowStart(new Date("2026-10-01T10:17:45Z"), 60).toISOString()).toBe(
      "2026-10-01T10:17:00.000Z",
    );
  });
  test("rateAllowed", () => {
    expect(rateAllowed(20, 20)).toBe(true);
    expect(rateAllowed(21, 20)).toBe(false);
  });
  test("retryAfterSeconds is within the window", () => {
    const s = retryAfterSeconds(new Date("2026-10-01T10:17:45Z"), 3600);
    expect(s).toBe(2535);
    expect(retryAfterSeconds(new Date("2026-10-01T10:00:00Z"), 3600)).toBe(3600);
  });
  test("LIMITS", () => {
    expect(LIMITS.joinPerIp).toEqual({ limit: 20, windowSeconds: 3600 });
    expect(LIMITS.cardPerDevicePerDay).toEqual({ limit: 1, windowSeconds: 86400 });
    expect(LIMITS.cardsPerProgramPerHour).toEqual({ limit: 200, windowSeconds: 3600 });
    expect(LIMITS.readsPerToken).toEqual({ limit: 120, windowSeconds: 60 });
    expect(LIMITS.stampsPerStaff).toEqual({ limit: 10, windowSeconds: 60 });
  });
});
