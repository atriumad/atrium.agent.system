import { describe, expect, test } from "bun:test";
import { Reading } from "./sentiment";

const valid = {
  sentiment: "negative",
  topics: ["food", "wait"],
  concern: "medium",
  safety: false,
};

describe("Reading", () => {
  test("accepts a valid reading", () => {
    expect(Reading.safeParse(valid).success).toBe(true);
  });

  test("rejects more than three topics", () => {
    const topics = ["food", "service", "wait", "price"];
    expect(Reading.safeParse({ ...valid, topics }).success).toBe(false);
  });

  test("rejects an unknown concern", () => {
    expect(Reading.safeParse({ ...valid, concern: "critical" }).success).toBe(false);
  });

  test("rejects an extra key", () => {
    expect(Reading.safeParse({ ...valid, comment: "free text" }).success).toBe(false);
  });

  test("rejects a safety flag that is not a boolean", () => {
    expect(Reading.safeParse({ ...valid, safety: "yes" }).success).toBe(false);
  });
});
