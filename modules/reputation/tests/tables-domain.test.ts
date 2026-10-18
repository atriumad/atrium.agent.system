// modules/reputation/tests/tables-domain.test.ts
import { describe, expect, test } from "bun:test";
import {
  caseCounts,
  caseInWindow,
  escapeLike,
  negativeCompare,
  ratingDistribution,
  severitySplit,
} from "../domain/tables";

const from = new Date("2026-10-01T00:00:00Z");
const before = new Date("2025-10-01T00:00:00Z");
const inside = new Date("2026-10-10T00:00:00Z");

describe("escapeLike", () => {
  test("prefixes backslash, percent and underscore", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("ratingDistribution", () => {
  test("counts 1 to 5 and ignores the rest", () => {
    expect(ratingDistribution([5, 5, 1, 3, 3, 3, 0, 6])).toEqual([1, 0, 3, 0, 2]);
  });
});

describe("severitySplit", () => {
  test("counts known severities", () => {
    expect(severitySplit(["high", "low", "low", "weird"])).toEqual({ high: 1, medium: 0, low: 2 });
  });
});

describe("caseInWindow", () => {
  test("open or contacted always, resolved only when opened in the window", () => {
    expect(caseInWindow({ status: "contacted", openedAt: before }, from)).toBe(true);
    expect(caseInWindow({ status: "resolved", openedAt: before }, from)).toBe(false);
    expect(caseInWindow({ status: "resolved", openedAt: from }, from)).toBe(true);
  });
});

describe("caseCounts", () => {
  test("counts per tab, only cases in the window", () => {
    const c = (status: string, openedAt = inside) => ({ status, openedAt });
    const cases = [
      c("open"),
      c("open"),
      c("contacted"),
      c("resolved"),
      c("resolved"),
      c("resolved"),
      c("resolved", before),
    ];
    expect(caseCounts(cases, from)).toEqual({
      active: 3,
      open: 2,
      contacted: 1,
      resolved: 3,
      all: 6,
    });
  });
});

describe("negativeCompare", () => {
  const mk = (read: number, negative: number, nulls = 0): (string | null)[] => [
    ...Array.from({ length: negative }, () => "negative"),
    ...Array.from({ length: read - negative }, () => "positive"),
    ...Array.from({ length: nulls }, () => null),
  ];
  test("rate of negative among read, change in points", () => {
    const r = negativeCompare(mk(12, 3), mk(11, 5));
    expect(r.value).toBe(0.25);
    expect(Math.abs((r.change as number) - (0.25 - 5 / 11) * 100)).toBeLessThan(1e-6);
    expect(r.small).toBe(false);
  });
  test("nulls are not read", () => {
    expect(negativeCompare(mk(10, 10, 20), []).n).toBe(10);
  });
  test("small samples give no change", () => {
    const r = negativeCompare(mk(9, 3), mk(20, 5));
    expect(r.small).toBe(true);
    expect(r.change).toBeNull();
    expect(negativeCompare(mk(10, 3), mk(9, 3)).change).toBeNull();
  });
  test("empty gives null value", () => {
    expect(negativeCompare([], []).value).toBeNull();
  });
});
