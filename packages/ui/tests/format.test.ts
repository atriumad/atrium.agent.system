import { describe, expect, test } from "bun:test";
import { ago, answerLabel, dueLabel, duration, inTab } from "../src/format";

const NOW = new Date("2026-10-06T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const H = 3_600_000;

describe("duration", () => {
  test("minutes, hours with minutes, then days", () => {
    expect(duration(30_000)).toBe("1m");
    expect(duration(45 * 60_000)).toBe("45m");
    expect(duration(3 * H + 20 * 60_000)).toBe("3h 20m");
    expect(duration(5 * H)).toBe("5h");
    expect(duration(72 * H)).toBe("3d");
  });
  test("the sign does not matter", () => {
    expect(duration(-2 * H)).toBe("2h");
  });
});

describe("dueLabel", () => {
  test("an open case counts down to the target", () => {
    expect(dueLabel("open", at(20 * H), NOW)).toEqual({ text: "Due in 20h", tone: "ok" });
  });
  test("it turns urgent in the last four hours", () => {
    expect(dueLabel("open", at(4 * H), NOW)?.tone).toBe("soon");
    expect(dueLabel("open", at(4 * H + 60_000), NOW)?.tone).toBe("ok");
  });
  test("past the target it says by how much", () => {
    expect(dueLabel("open", at(-90 * 60_000), NOW)).toEqual({
      text: "Overdue by 1h 30m",
      tone: "overdue",
    });
  });
  test("a contacted or resolved case has no clock", () => {
    expect(dueLabel("contacted", at(-5 * H), NOW)).toBeNull();
    expect(dueLabel("resolved", at(-5 * H), NOW)).toBeNull();
  });
});

describe("inTab", () => {
  test("active is everything unresolved", () => {
    expect(inTab("open", "active")).toBe(true);
    expect(inTab("contacted", "active")).toBe(true);
    expect(inTab("resolved", "active")).toBe(false);
  });
  test("the status tabs are exact and all has no filter", () => {
    expect(inTab("open", "contacted")).toBe(false);
    expect(inTab("resolved", "resolved")).toBe(true);
    expect(inTab("resolved", "all")).toBe(true);
  });
});

test("ago and answerLabel", () => {
  expect(ago(at(-10_000), NOW)).toBe("just now");
  expect(ago(at(-2 * H), NOW)).toBe("2h ago");
  expect(answerLabel("service")).toBe("the service");
  expect(answerLabel("unknown-thing")).toBe("unknown-thing");
  expect(answerLabel(null)).toBeNull();
});
