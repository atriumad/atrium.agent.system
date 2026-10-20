import { expect, test } from "bun:test";
import { formatCardCode, normalizeCardCode, parseScannedCode } from "../src/loyalty/code";

test("normalize, format and parse a scanned code", () => {
  expect(normalizeCardCode("abcd-efgh")).toBe("ABCDEFGH");
  expect(normalizeCardCode("ABCD EFG0")).toBeNull(); // 0 is not in the alphabet
  expect(normalizeCardCode("ABCDEFG")).toBeNull(); // too short
  expect(formatCardCode("ABCDEFGH")).toBe("ABCD-EFGH");
  expect(parseScannedCode("  abcd-efgh\n")).toBe("ABCDEFGH");
  expect(parseScannedCode("https://evil.test/ABCDEFGH")).toBeNull();
});
