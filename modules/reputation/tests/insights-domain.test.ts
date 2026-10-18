// modules/reputation/tests/insights-domain.test.ts
import { describe, expect, test } from "bun:test";
import {
  type AnswerRow,
  clientStatus,
  compareCount,
  compareMean,
  compareRate,
  dailySeries,
  localDate,
  median,
  parseRange,
  splitByTopic,
  weightedMean,
  windowDates,
} from "../domain/insights";

const row = (over: Partial<AnswerRow> = {}): AnswerRow => ({
  locationId: "p1",
  createdAt: new Date("2026-10-17T12:00:00Z"),
  rating: 5,
  sentiment: "positive",
  topics: ["food"],
  readAt: null,
  reviewClickedAt: null,
  invitationId: null,
  ...over,
});

const fill = (n: number, value: number) => Array.from({ length: n }, () => value);

describe("parseRange", () => {
  test("defaults, accepts and rejects", () => {
    expect(parseRange(undefined)).toBe("30d");
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("1y")).toBeNull();
  });
});

describe("localDate", () => {
  const at = new Date("2026-10-18T03:30:00Z");
  test("uses the place time zone", () => {
    expect(localDate(at, "America/Chicago")).toBe("2026-10-17");
    expect(localDate(at, "Asia/Tokyo")).toBe("2026-10-18");
  });
  test("empty zone falls back to UTC", () => {
    expect(localDate(at, "")).toBe("2026-10-18");
  });
  test("falls back to UTC for an invalid zone", () => {
    expect(localDate(at, "Not/AZone")).toBe("2026-10-18");
  });
});

describe("windowDates", () => {
  test("current ends today, previous precedes it", () => {
    const { current, previous } = windowDates(new Date("2026-10-17T12:00:00Z"), "UTC", 7);
    expect(current).toHaveLength(7);
    expect(previous).toHaveLength(7);
    expect(current[6]).toBe("2026-10-17");
    expect(current[0]).toBe("2026-10-11");
    expect(previous[6]).toBe("2026-10-10");
  });
});

describe("compareMean", () => {
  test("value and change", () => {
    const r = compareMean(fill(12, 4.2), fill(11, 4.0));
    expect(r.value).toBeCloseTo(4.2, 9);
    expect(r.change).toBeCloseTo(0.2, 9);
    expect(r.small).toBe(false);
  });
  test("small current", () => {
    const r = compareMean(fill(9, 4), fill(20, 4));
    expect(r.small).toBe(true);
    expect(r.change).toBeNull();
  });
  test("small previous", () => {
    expect(compareMean(fill(20, 4), fill(9, 4)).change).toBeNull();
  });
  test("boundary", () => {
    const ok = compareMean(fill(10, 4), fill(10, 3));
    expect(ok.small).toBe(false);
    expect(ok.change).toBeCloseTo(1, 9);
    expect(compareMean(fill(10, 4), fill(9, 3)).change).toBeNull();
  });
  test("empty gives null, never NaN", () => {
    const r = compareMean([], []);
    expect(r.value).toBeNull();
    expect(r.change).toBeNull();
  });
});

describe("compareCount", () => {
  test("percent change", () => {
    expect(compareCount(130, 100).change).toBeCloseTo(30, 9);
    expect(compareCount(5, 0).change).toBeNull();
  });
  test("exact 10 boundary", () => {
    const ok = compareCount(10, 10);
    expect(ok.small).toBe(false);
    expect(ok.change).toBeCloseTo(0, 9);
    expect(compareCount(10, 9).change).toBeNull();
  });
});

describe("compareRate", () => {
  test("percentage points", () => {
    const r = compareRate({ num: 40, den: 100 }, { num: 45, den: 100 });
    expect(r.value).toBe(0.4);
    expect(r.change).toBeCloseTo(-5, 9);
  });
  test("exact 10 boundary", () => {
    const ok = compareRate({ num: 5, den: 10 }, { num: 4, den: 10 });
    expect(ok.small).toBe(false);
    expect(ok.change).toBeCloseTo(10, 9);
    expect(compareRate({ num: 5, den: 10 }, { num: 4, den: 9 }).change).toBeNull();
  });
  test("zero denominator", () => {
    const r = compareRate({ num: 0, den: 0 }, { num: 45, den: 100 });
    expect(r.value).toBeNull();
    expect(r.change).toBeNull();
  });
});

describe("median", () => {
  test("odd, even, empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("dailySeries", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  test("counts on the local date of the place", () => {
    const s = dailySeries(
      [row({ createdAt: new Date("2026-10-17T04:30:00Z") })],
      [{ id: "p1", timeZone: "America/Chicago" }],
      now,
      7,
    );
    expect(s.find((d) => d.date === "2026-10-16")?.count).toBe(1);
    expect(s.find((d) => d.date === "2026-10-17")?.count).toBe(0);
  });
  test("excludes answers older than the window", () => {
    const old = new Date(now.getTime() - 91 * 86_400_000);
    const s = dailySeries([row({ createdAt: old })], [{ id: "p1", timeZone: "UTC" }], now, 90);
    expect(s).toHaveLength(90);
    expect(s.reduce((a, d) => a + d.count, 0)).toBe(0);
  });
  test("Tokyo: a late-UTC answer lands on the next local day", () => {
    const s = dailySeries(
      [row({ createdAt: new Date("2026-10-17T15:30:00Z") })],
      [{ id: "p1", timeZone: "Asia/Tokyo" }],
      new Date("2026-10-17T16:00:00Z"),
      7,
    );
    expect(s[6]).toEqual({ date: "2026-10-18", average: 5, count: 1 });
  });
  test("Chicago: the series ends on the place's local today", () => {
    const s = dailySeries(
      [row({ createdAt: new Date("2026-10-16T20:00:00Z") })],
      [{ id: "p1", timeZone: "America/Chicago" }],
      new Date("2026-10-17T02:00:00Z"),
      7,
    );
    expect(s[6]?.date).toBe("2026-10-16");
    expect(s[6]?.count).toBe(1);
    expect(s[0]?.date).toBe("2026-10-10");
  });
  test("Kiritimati: 23:30 local on the last day is in the window", () => {
    const s = dailySeries(
      [row({ createdAt: new Date("2026-10-18T09:30:00Z") })],
      [{ id: "p1", timeZone: "Pacific/Kiritimati" }],
      new Date("2026-10-18T09:45:00Z"),
      7,
    );
    expect(s[6]).toEqual({ date: "2026-10-18", average: 5, count: 1 });
  });
  test("two places: exact length, ascending, rows outside their own window excluded", () => {
    const s = dailySeries(
      [
        row({ locationId: "t", createdAt: new Date("2026-10-17T15:30:00Z") }),
        row({ locationId: "c", createdAt: new Date("2026-10-17T10:00:00Z") }),
        row({ locationId: "c", createdAt: new Date("2026-10-11T18:00:00Z") }),
        row({ locationId: "t", createdAt: new Date("2026-10-11T12:00:00Z") }),
      ],
      [
        { id: "t", timeZone: "Asia/Tokyo" },
        { id: "c", timeZone: "America/Chicago" },
      ],
      new Date("2026-10-17T16:00:00Z"),
      7,
    );
    expect(s).toHaveLength(7);
    expect(s.map((d) => d.date)).toEqual([...s.map((d) => d.date)].sort());
    expect(s[6]?.date).toBe("2026-10-18");
    expect(s.reduce((a, d) => a + d.count, 0)).toBe(2);
    expect(s[5]?.count).toBe(1);
    expect(s[6]?.count).toBe(1);
  });
  test("empty days are null, no NaN", () => {
    const s = dailySeries([row({ rating: 4 })], [{ id: "p1", timeZone: "UTC" }], now, 7);
    expect(s[0]).toEqual({ date: "2026-10-11", average: null, count: 0 });
    expect(s[6]).toEqual({ date: "2026-10-17", average: 4, count: 1 });
    expect(JSON.stringify(s)).not.toContain("NaN");
    expect(s.every((d) => d.average === null || !Number.isNaN(d.average))).toBe(true);
  });
});

describe("splitByTopic", () => {
  const rows = [
    row({ sentiment: "negative", topics: ["wait-time"] }),
    row({ sentiment: "mixed", topics: ["wait-time"] }),
    row({ sentiment: "positive", topics: ["food"] }),
    row({ sentiment: null, topics: ["food"] }),
  ];
  test("buckets and sorts", () => {
    const out = splitByTopic(rows, 10);
    expect(out[0]).toEqual({ topic: "wait-time", total: 2, negative: 1, neutral: 1, positive: 0 });
    expect(out[1]?.topic).toBe("food");
    expect(out[1]?.total).toBe(1);
  });
  test("limit", () => {
    expect(splitByTopic(rows, 1)).toHaveLength(1);
  });
});

describe("clientStatus", () => {
  test("precedence", () => {
    expect(clientStatus({ overdue: 1, approvals: 2, pendingPlaces: 0 })).toBe("needs_a_person");
    expect(clientStatus({ overdue: 0, approvals: 2, pendingPlaces: 0 })).toBe("approvals_waiting");
    expect(clientStatus({ overdue: 0, approvals: 0, pendingPlaces: 1 })).toBe("setting_up");
    expect(clientStatus({ overdue: 0, approvals: 0, pendingPlaces: 0 })).toBe("healthy");
  });
});

describe("weightedMean", () => {
  test("weights by n", () => {
    expect(
      weightedMean([
        { sum: 8, n: 2 },
        { sum: 12, n: 3 },
      ]),
    ).toBe(4);
    expect(weightedMean([])).toBeNull();
  });
});
