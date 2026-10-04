import { describe, expect, test } from "bun:test";
import { canDecideApproval, isValidItemType } from "../domain/approvals";
import { maskPersonalData } from "../domain/audit";
import { ALL_AGENTS, isValidAgentSelector, matchesSwitch } from "../domain/kill-switch";
import { ROLES } from "../domain/roles";

describe("maskPersonalData", () => {
  test("masks values under personal keys at any depth", () => {
    const masked = maskPersonalData({
      guest: { name: "Ana López", email: "ana@x.co", phone: "713-555-0142", guestId: "g_1" },
      list: [{ firstName: "Ana" }],
    });
    expect(masked).toEqual({
      guest: { name: "[masked]", email: "[masked]", phone: "[masked]", guestId: "g_1" },
      list: [{ firstName: "[masked]" }],
    });
  });

  test("redacts emails and phone numbers inside free text", () => {
    const text =
      "Please call (713) 555-0142 or +52 55 1234 5678, write to ana.lopez@mail.example.com";
    expect(maskPersonalData({ comment: text })).toEqual({
      comment: "Please call [phone] or [phone], write to [email]",
    });
  });

  test("leaves ids, dates, timestamps and numbers alone", () => {
    const clean = {
      id: "0b6f4f58-1c0e-4b3a-9a53-0f2f5c1d2e3a",
      date: "2026-07-10",
      at: "2026-07-10T12:00:00.000Z",
      rowCount: 4820,
      revenueCents: 123456,
      rating: 4.5,
    };
    expect(maskPersonalData(clean)).toEqual(clean);
  });

  test("does not mutate its input", () => {
    const input = { email: "a@b.co", nested: { phone: "713-555-0142" } };
    maskPersonalData(input);
    expect(input).toEqual({ email: "a@b.co", nested: { phone: "713-555-0142" } });
  });

  test("passes through null, booleans and undefined", () => {
    expect(maskPersonalData(null)).toBeNull();
    expect(maskPersonalData(true)).toBe(true);
    expect(maskPersonalData(undefined)).toBeUndefined();
  });

  test("a runaway structure is cut instead of followed", () => {
    let deep: Record<string, unknown> = { leaf: "ok" };
    for (let i = 0; i < 30; i++) deep = { next: deep };
    expect(JSON.stringify(maskPersonalData(deep))).toContain("[masked]");
  });
});

describe("approvals", () => {
  test("only roles that approve content decide approvals", () => {
    expect(ROLES.filter(canDecideApproval)).toEqual([
      "agency_admin",
      "account_manager",
      "client_owner",
    ]);
  });

  test("item types are module.thing in snake case", () => {
    expect(isValidItemType("reputation.reply")).toBe(true);
    expect(isValidItemType("growth.campaign_launch")).toBe(true);
    for (const bad of ["reply", "Reputation.Reply", "a..b", "a.b-c", ""]) {
      expect(isValidItemType(bad)).toBe(false);
    }
  });
});

describe("kill switch matching", () => {
  test("star is every agent", () => {
    expect(matchesSwitch(ALL_AGENTS, "host.recovery")).toBe(true);
  });
  test("a full id matches exactly one subagent", () => {
    expect(matchesSwitch("host.recovery", "host.recovery")).toBe(true);
    expect(matchesSwitch("host.recovery", "host.capture")).toBe(false);
  });
  test("an agent name covers its subagents but not lookalikes", () => {
    expect(matchesSwitch("host", "host.recovery")).toBe(true);
    expect(matchesSwitch("host", "hostess.greeter")).toBe(false);
  });
  test("selectors are validated", () => {
    for (const ok of ["*", "host", "host.recovery"]) expect(isValidAgentSelector(ok)).toBe(true);
    for (const bad of ["", "Host", "host.", "a.b.c", "host recovery"]) {
      expect(isValidAgentSelector(bad)).toBe(false);
    }
  });
});
