import { describe, expect, test } from "bun:test";
import { SignalRow } from "@atrium/contracts";
import { checkBatch, latestDate, monthsOf, summarize } from "../domain/ingestion";

const LOC_A = "7f0c2a4e-3b1d-4c55-9a3e-0d6f1b2c3a4d";
const LOC_B = "8a1d3b5f-4c2e-4d66-8b4f-1e7a2c3d4b5e";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";

const row = (overrides: Record<string, unknown> = {}) =>
  SignalRow.parse({
    date: "2026-07-10",
    locationId: LOC_A,
    source: "metricool",
    signalType: "video_view",
    value: 10,
    ...overrides,
  });

const context = {
  principal: { sources: ["metricool", "toast"], clientIds: [CLIENT_A] },
  locationClient: new Map([
    [LOC_A, CLIENT_A],
    [LOC_B, CLIENT_B],
  ]),
  today: "2026-10-04",
};

describe("checkBatch", () => {
  test("a clean batch has no problems and is grouped by client", () => {
    const { problems, byClient } = checkBatch([row(), row({ signalType: "impression" })], context);
    expect(problems).toEqual([]);
    expect(byClient.get(CLIENT_A)).toHaveLength(2);
  });

  test("a source the token does not carry is refused", () => {
    const { problems } = checkBatch([row({ source: "gbp" })], context);
    expect(problems.map((p) => p.code)).toEqual(["source_not_permitted"]);
  });

  test("another client's location and a missing location look identical", () => {
    const other = checkBatch([row({ locationId: LOC_B })], context).problems;
    const missing = checkBatch([row({ locationId: crypto.randomUUID() })], context).problems;
    expect(other).toEqual(missing);
    expect(other[0]?.message).toBe("location not permitted");
  });

  test("dates before 2020 or after tomorrow are refused; tomorrow is fine", () => {
    for (const date of ["2019-12-31", "2026-10-06"]) {
      expect(checkBatch([row({ date })], context).problems.map((p) => p.code)).toEqual([
        "date_out_of_range",
      ]);
    }
    expect(checkBatch([row({ date: "2026-10-05" })], context).problems).toEqual([]);
    expect(checkBatch([row({ date: "2020-01-01" })], context).problems).toEqual([]);
  });

  test("the same signal twice in a batch is refused, pointing at the first", () => {
    const { problems } = checkBatch([row(), row({ value: 99 })], context);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ index: 1, code: "duplicate_key" });
    expect(problems[0]?.message).toContain("row 0");
  });

  test("a different element or platform is a different signal", () => {
    const rows = [row(), row({ elementId: "reel_1" }), row({ platform: "instagram" })];
    expect(checkBatch(rows, context).problems).toEqual([]);
  });

  test("reports every problem, not just the first", () => {
    const rows = [row({ source: "gbp" }), row({ locationId: LOC_B }), row({ date: "2019-01-01" })];
    expect(checkBatch(rows, context).problems.map((p) => p.index)).toEqual([0, 1, 2]);
  });
});

describe("helpers", () => {
  test("latestDate is the next day, across month and year ends", () => {
    expect(latestDate("2026-10-04")).toBe("2026-10-05");
    expect(latestDate("2026-12-31")).toBe("2027-01-01");
    expect(latestDate("2028-02-28")).toBe("2028-02-29");
  });

  test("summarize gives the range and the count", () => {
    const rows = [row({ date: "2026-07-12" }), row({ date: "2026-07-09", signalType: "save" })];
    expect(summarize(rows)).toEqual({ from: "2026-07-09", to: "2026-07-12", rowCount: 2 });
  });

  test("monthsOf lists each month once, sorted", () => {
    const rows = [
      row({ date: "2026-08-02" }),
      row({ date: "2026-07-31", signalType: "save" }),
      row({ date: "2026-08-15", signalType: "impression" }),
    ];
    expect(monthsOf(rows)).toEqual(["2026-07-01", "2026-08-01"]);
  });
});

describe("SignalRow edges", () => {
  test("element ids are restricted to a safe alphabet", () => {
    expect(SignalRow.safeParse({ ...row(), elementId: "reel 1; drop" }).success).toBe(false);
    expect(SignalRow.safeParse({ ...row(), elementId: "reel_0712:pastor" }).success).toBe(true);
  });
  test("meta is capped at 2 KB", () => {
    expect(SignalRow.safeParse({ ...row(), meta: { blob: "x".repeat(3000) } }).success).toBe(false);
  });
  test("a guest id must be a uuid", () => {
    expect(SignalRow.safeParse({ ...row(), guestId: "g_88412" }).success).toBe(false);
  });
});
