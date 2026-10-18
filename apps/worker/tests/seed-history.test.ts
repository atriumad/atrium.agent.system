import { describe, expect, test } from "bun:test";
import { buildHistory } from "../scripts/seed-history";

const MIN_SAMPLE = 10;
const localDate = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
/** The local dates of the last `days` days and of the `days` before them, as the Overview counts them. */
function windowDates(now: Date, timeZone: string, days: number) {
  const current: string[] = [];
  const previous: string[] = [];
  for (let i = 0; i < 2 * days; i++) {
    const date = localDate(new Date(now.getTime() - i * 86_400_000), timeZone);
    (i < days ? current : previous).push(date);
  }
  return { current, previous };
}

const NOW = new Date("2026-10-17T15:00:00Z");
const plan = buildHistory({ seed: 7, now: NOW, days: 90 });
const places = plan.clients.flatMap((c) => c.locations.map((l) => ({ client: c, ...l })));
const answers = places.flatMap((p) => p.answers);

describe("buildHistory", () => {
  test("the same seed gives the same plan, another seed another", () => {
    expect(buildHistory({ seed: 7, now: NOW, days: 90 })).toEqual(plan);
    expect(buildHistory({ seed: 8, now: NOW, days: 90 })).not.toEqual(plan);
  });

  test("shape: clients, places in different zones, 90 distinct dates", () => {
    expect(plan.clients.length).toBeGreaterThanOrEqual(2);
    expect(places.length).toBeGreaterThanOrEqual(4);
    const zones = new Set(places.map((p) => p.timeZone));
    expect(zones.has("America/Chicago")).toBe(true);
    expect(zones.has("Pacific/Auckland") || zones.has("Asia/Tokyo")).toBe(true);
    const dates = new Set(answers.map((a) => a.at.toISOString().slice(0, 10)));
    expect(dates.size).toBeGreaterThanOrEqual(90);
    expect(answers.every((a) => a.at.getTime() <= NOW.getTime())).toBe(true);
  });

  test("ratings are integers from 1 to 5", () => {
    for (const a of answers) {
      expect(Number.isInteger(a.rating)).toBe(true);
      expect(a.rating).toBeGreaterThanOrEqual(1);
      expect(a.rating).toBeLessThanOrEqual(5);
    }
  });

  test("one client has fewer than 10 answers", () => {
    const counts = plan.clients.map((c) => c.locations.reduce((n, l) => n + l.answers.length, 0));
    expect(counts.some((n) => n > 0 && n < 10)).toBe(true);
    expect(counts.some((n) => n >= 100)).toBe(true);
  });

  test("exactly one overdue open case and two due within a day", () => {
    const open = answers.flatMap((a) => (a.case && a.case.status === "open" ? [a.case] : []));
    const overdue = open.filter((c) => c.dueAt.getTime() < NOW.getTime());
    const soon = open.filter(
      (c) => c.dueAt.getTime() >= NOW.getTime() && c.dueAt.getTime() <= NOW.getTime() + 86_400_000,
    );
    expect(overdue.length).toBe(1);
    expect(soon.length).toBe(2);
    expect(open.length).toBe(3);
  });

  test("closed cases were contacted between 1 and 20 hours after opening", () => {
    const closed = answers.flatMap((a) => (a.case && a.case.status !== "open" ? [a] : []));
    expect(closed.length).toBeGreaterThan(5);
    for (const a of closed) {
      const hours = ((a.case?.contactedAt?.getTime() ?? 0) - a.at.getTime()) / 3_600_000;
      expect(hours).toBeGreaterThanOrEqual(1);
      expect(hours).toBeLessThanOrEqual(20);
    }
  });

  test("the wait topic is mostly negative", () => {
    const waits = answers.filter((a) => a.topics?.includes("wait"));
    expect(waits.length).toBeGreaterThan(10);
    const negative = waits.filter((a) => a.sentiment === "negative").length;
    expect(negative / waits.length).toBeGreaterThan(0.6);
  });

  test("a delta shows: at least 10 answers in the last 30 days and the 30 before, at one place", () => {
    const ok = places.some((p) => {
      const w = windowDates(NOW, p.timeZone, 30);
      const cur = new Set(w.current);
      const prev = new Set(w.previous);
      const n = (s: Set<string>) =>
        p.answers.filter((a) => s.has(localDate(a.at, p.timeZone))).length;
      return n(cur) >= MIN_SAMPLE && n(prev) >= MIN_SAMPLE;
    });
    expect(ok).toBe(true);
  });

  test("trends: one place rises, another dips in the last 14 days", () => {
    const mean = (rows: { rating: number }[]) =>
      rows.reduce((s, r) => s + r.rating, 0) / rows.length;
    const cut = (days: number) => NOW.getTime() - days * 86_400_000;
    const trends = places.map((p) => {
      const recent = p.answers.filter((a) => a.at.getTime() > cut(14));
      const before = p.answers.filter((a) => a.at.getTime() <= cut(14));
      const early = p.answers.filter((a) => a.at.getTime() <= cut(60));
      const late = p.answers.filter((a) => a.at.getTime() > cut(30));
      return {
        dip: recent.length && before.length ? mean(before) - mean(recent) : 0,
        rise: early.length && late.length ? mean(late) - mean(early) : 0,
      };
    });
    expect(trends.some((t) => t.rise > 0.4)).toBe(true);
    expect(trends.some((t) => t.dip > 0.7)).toBe(true);
  });

  test("clicks, request statuses and unread answers all appear", () => {
    expect(answers.some((a) => a.reviewClickedAt !== null)).toBe(true);
    expect(answers.some((a) => a.readAt === null)).toBe(true);
    expect(answers.some((a) => a.readAt !== null && a.sentiment && a.topics)).toBe(true);
    const reqs = places.flatMap((p) => p.requests);
    for (const status of ["sent", "scheduled", "skipped"] as const) {
      expect(reqs.some((r) => r.status === status)).toBe(true);
    }
    expect(reqs.some((r) => r.status === "sent" && r.answerKey !== null)).toBe(true);
    expect(reqs.some((r) => r.status === "sent" && r.answerKey === null)).toBe(true);
  });
});
