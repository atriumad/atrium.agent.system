// modules/reputation/tests/sentiment-domain.test.ts
import { describe, expect, test } from "bun:test";
import { severityFor } from "../domain/recovery";
import {
  escalatedSeverity,
  type Reading,
  readingOpensCase,
  readingSeverity,
  shouldOpenWithReading,
  storedReading,
} from "../domain/sentiment";

const reading = (over: Partial<Reading> = {}): Reading => ({
  sentiment: "negative",
  topics: [],
  concern: "none",
  safety: false,
  ...over,
});

describe("a reading's severity", () => {
  test("concern maps to severity; safety is always high", () => {
    expect(readingSeverity(reading({ concern: "none" }))).toBeNull();
    expect(readingSeverity(reading({ concern: "low" }))).toBe("low");
    expect(readingSeverity(reading({ concern: "medium" }))).toBe("medium");
    expect(readingSeverity(reading({ concern: "high" }))).toBe("high");
    expect(readingSeverity(reading({ concern: "none", safety: true }))).toBe("high");
  });

  test("only medium, high or safety opens a case", () => {
    expect(readingOpensCase(reading({ concern: "none" }))).toBe(false);
    expect(readingOpensCase(reading({ concern: "low" }))).toBe(false);
    expect(readingOpensCase(reading({ concern: "medium" }))).toBe(true);
    expect(readingOpensCase(reading({ concern: "high" }))).toBe(true);
    expect(readingOpensCase(reading({ concern: "low", safety: true }))).toBe(true);
  });
});

describe("escalating", () => {
  test("a reading never lowers the severity the rating gives", () => {
    const concerns = ["none", "low", "medium", "high"] as const;
    for (const rating of [1, 2, 3, 4, 5]) {
      for (const wantsContact of [false, true]) {
        for (const concern of concerns) {
          for (const safety of [false, true]) {
            const base = severityFor(rating, wantsContact);
            const final = escalatedSeverity(rating, wantsContact, reading({ concern, safety }));
            const order = { low: 1, medium: 2, high: 3 } as const;
            if (base) expect(final && order[final] >= order[base]).toBe(true);
          }
        }
      }
    }
  });

  test("no reading leaves the rating's severity untouched", () => {
    expect(escalatedSeverity(2, false, null)).toBe("medium");
    expect(escalatedSeverity(5, false, null)).toBeNull();
  });

  test("a five-star answer with a safety reading is high", () => {
    expect(escalatedSeverity(5, false, reading({ safety: true }))).toBe("high");
  });

  test("a two-star answer with a calm reading stays medium", () => {
    expect(escalatedSeverity(2, false, reading({ concern: "none" }))).toBe("medium");
  });
});

describe("opening a case", () => {
  const base = { wantsContact: false, hasContact: false };
  test("the rating still opens it on its own", () => {
    expect(shouldOpenWithReading({ ...base, rating: 2, reading: null })).toBe(true);
    expect(shouldOpenWithReading({ ...base, rating: 2, reading: reading() })).toBe(true);
  });
  test("a serious reading opens it for a happy rating, with no contact details", () => {
    expect(shouldOpenWithReading({ ...base, rating: 5, reading: reading({ safety: true }) })).toBe(
      true,
    );
    expect(
      shouldOpenWithReading({ ...base, rating: 5, reading: reading({ concern: "low" }) }),
    ).toBe(false);
  });
});

describe("a stored reading", () => {
  test("an unread row has none; a read row round-trips", () => {
    expect(
      storedReading({ sentiment: null, topics: null, concern: null, safety: null }),
    ).toBeNull();
    expect(
      storedReading({ sentiment: "mixed", topics: ["wait"], concern: "low", safety: false }),
    ).toEqual({ sentiment: "mixed", topics: ["wait"], concern: "low", safety: false });
  });
  test("a row outside the schema is treated as unread", () => {
    expect(
      storedReading({ sentiment: "angry", topics: [], concern: "low", safety: false }),
    ).toBeNull();
  });
});
