import { describe, expect, test } from "bun:test";
import {
  type ConsentRecord,
  currentConsent,
  decideContact,
  normalizeEmail,
  normalizePhone,
} from "../domain/contact";

describe("normalizeEmail", () => {
  test("trims and lowercases", () => {
    expect(normalizeEmail("  Ana.Lopez@Example.COM ")).toBe("ana.lopez@example.com");
  });
  test("rejects what is not an address", () => {
    for (const bad of ["", "ana", "ana@", "@x.co", "a b@x.co", "ana@x"]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe("normalizePhone", () => {
  test("US formats become E.164", () => {
    for (const raw of [
      "(713) 555-0142",
      "713-555-0142",
      "7135550142",
      "1 713 555 0142",
      "+1 (713) 555-0142",
    ]) {
      expect(normalizePhone(raw)).toBe("+17135550142");
    }
  });
  test("international numbers need a plus", () => {
    expect(normalizePhone("+52 55 1234 5678")).toBe("+525512345678");
    expect(normalizePhone("52 55 1234 5678")).toBeNull();
  });
  test("rejects short, long and impossible numbers", () => {
    for (const bad of ["", "555-0142", "0135550142", "1135550142", "+123", "+1234567890123456"]) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});

describe("currentConsent", () => {
  const log: ConsentRecord[] = [
    { channel: "email", purpose: "marketing", granted: true },
    { channel: "email", purpose: "transactional", granted: true },
    { channel: "email", purpose: "marketing", granted: false },
  ];
  test("the latest record wins, per channel and purpose", () => {
    expect(currentConsent(log, "email", "marketing")).toBe("opted_out");
    expect(currentConsent(log, "email", "transactional")).toBe("granted");
  });
  test("a purpose with no record has no consent", () => {
    expect(currentConsent([], "email", "transactional")).toBe("none");
  });
  test("a later grant overrides an earlier opt-out", () => {
    const relog = [...log, { channel: "email", purpose: "marketing", granted: true } as const];
    expect(currentConsent(relog, "email", "marketing")).toBe("granted");
  });
});

describe("decideContact", () => {
  const ok = { guestExists: true, erased: false, consent: "granted", address: "a@b.co" } as const;
  test("allows with consent and an address", () => {
    expect(decideContact(ok)).toEqual({ allowed: true, address: "a@b.co" });
  });
  test("each missing piece denies, with its reason", () => {
    expect(decideContact({ ...ok, guestExists: false })).toEqual({
      allowed: false,
      reason: "unknown_guest",
    });
    expect(decideContact({ ...ok, erased: true })).toEqual({ allowed: false, reason: "erased" });
    expect(decideContact({ ...ok, consent: "none" })).toEqual({
      allowed: false,
      reason: "no_consent",
    });
    expect(decideContact({ ...ok, consent: "opted_out" })).toEqual({
      allowed: false,
      reason: "opted_out",
    });
    expect(decideContact({ ...ok, address: null })).toEqual({
      allowed: false,
      reason: "no_contact",
    });
  });
  test("an erased guest is denied even with a recorded grant", () => {
    expect(decideContact({ ...ok, erased: true }).allowed).toBe(false);
  });
});
