import { expect, test } from "bun:test";
// check:deps ignores tests: this is the one place the UI copy meets the module it copies.
import { generateShortCode, normalizeShortCode } from "../../../modules/crm/domain/tokens";
import { formatCardCode, normalizeCardCode } from "../src/loyalty/code";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const pad = (c: string) => c.repeat(8);

test("the UI short code alphabet agrees with the CRM module, character by character", () => {
  for (const c of CHARS) {
    expect(normalizeCardCode(pad(c))).toBe(normalizeShortCode(pad(c)));
  }
});

test("the UI accepts exactly the characters the CRM generates", () => {
  const generated = new Set<string>();
  const alphabetSize = CHARS.split("").filter((c) => normalizeShortCode(pad(c))).length;
  for (let i = 0; i < alphabetSize; i++) {
    for (const ch of generateShortCode(() => (i + 0.5) / alphabetSize)) generated.add(ch);
  }
  expect(generated.size).toBe(alphabetSize);
  for (const ch of generated) expect(normalizeCardCode(pad(ch))).toBe(pad(ch));
});

test("length and format agree", () => {
  const code = generateShortCode();
  expect(code).toHaveLength(8);
  expect(normalizeCardCode(code)).toBe(code);
  expect(normalizeCardCode(code.slice(0, 7))).toBeNull();
  expect(normalizeCardCode(`${code}A`)).toBeNull();
  expect(normalizeShortCode(code.slice(0, 7))).toBeNull();
  expect(normalizeShortCode(`${code}A`)).toBeNull();
  expect(formatCardCode(code)).toBe(`${code.slice(0, 4)}-${code.slice(4)}`);
});
