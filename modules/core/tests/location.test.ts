import { describe, expect, test } from "bun:test";
import { isValidTimeZone, localDay } from "../domain/location";

describe("location", () => {
  test("validates IANA time zones", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  test("the signal date is the location's local day, not UTC", () => {
    const instant = new Date("2026-07-11T02:30:00Z");
    expect(localDay(instant, "America/Chicago")).toBe("2026-07-10");
    expect(localDay(instant, "UTC")).toBe("2026-07-11");
  });
});
