import { describe, expect, test } from "bun:test";
import {
  SIGNAL_TYPES,
  SIGNAL_TYPES_BY_STAGE,
  SignalBatch,
  SignalRow,
  signalNaturalKey,
} from "./signals";

const base = {
  date: "2026-07-10",
  locationId: "7f0c2a4e-3b1d-4c55-9a3e-0d6f1b2c3a4d",
  source: "metricool",
  signalType: "video_view",
  value: 4820,
};

describe("SignalRow", () => {
  test("applies nullable defaults", () => {
    const row = SignalRow.parse(base);
    expect(row.platform).toBeNull();
    expect(row.elementId).toBeNull();
    expect(row.meta).toBeNull();
    expect(row.guestId).toBeNull();
  });

  test("rejects a signal type outside the enum", () => {
    expect(SignalRow.safeParse({ ...base, signalType: "views" }).success).toBe(false);
  });

  test("rejects impossible dates and loose formats", () => {
    for (const date of ["2026-02-30", "2026-7-10", "10/07/2026", "2026-07-10T00:00:00Z"]) {
      expect(SignalRow.safeParse({ ...base, date }).success).toBe(false);
    }
  });

  test("rejects negative, NaN and infinite values", () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(SignalRow.safeParse({ ...base, value }).success).toBe(false);
    }
  });

  test("accepts a hub button tap with meta", () => {
    const row = SignalRow.parse({
      ...base,
      source: "landing",
      signalType: "order_click",
      value: 1,
      elementId: "hub_order",
      meta: { button: "order", utm: "qr-tent" },
    });
    expect(row.meta).toEqual({ button: "order", utm: "qr-tent" });
  });
});

describe("signal type enum", () => {
  test("has no duplicates and covers every stage", () => {
    expect(new Set(SIGNAL_TYPES).size).toBe(SIGNAL_TYPES.length);
    const staged = Object.values(SIGNAL_TYPES_BY_STAGE).flat().length;
    expect(staged).toBe(SIGNAL_TYPES.length);
  });
});

describe("signalNaturalKey", () => {
  test("same row gives the same key, so a re-run replaces the day", () => {
    const a = SignalRow.parse(base);
    const b = SignalRow.parse({ ...base, value: 5000 });
    expect(signalNaturalKey(a)).toBe(signalNaturalKey(b));
  });

  test("element and platform change the key", () => {
    const a = SignalRow.parse(base);
    const withElement = SignalRow.parse({ ...base, elementId: "reel_0712_pastor" });
    const withPlatform = SignalRow.parse({ ...base, platform: "instagram" });
    const keys = new Set([a, withElement, withPlatform].map(signalNaturalKey));
    expect(keys.size).toBe(3);
  });
});

describe("SignalBatch", () => {
  test("rejects an empty batch", () => {
    expect(SignalBatch.safeParse({ rows: [] }).success).toBe(false);
  });
});
