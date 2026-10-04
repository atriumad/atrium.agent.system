import { describe, expect, test } from "bun:test";
import { SurveySubmission } from "@atrium/contracts";
import {
  generateInvitationToken,
  hashDevice,
  hashInvitationToken,
  INVITATION_DAYS,
  invitationExpiry,
  invitationState,
  looksLikeInvitationToken,
  signQrToken,
  verifyQrToken,
} from "../domain/invitations";
import {
  canTransition,
  caseDueAt,
  isOverdue,
  severityFor,
  shouldOpenCase,
} from "../domain/recovery";
import { isQuietHour, isStaleVisit, nextSendTime } from "../domain/timing";

describe("recovery rules", () => {
  test("a rating of 1 to 3 opens a case; severity falls as the rating rises", () => {
    expect([1, 2, 3].map((r) => severityFor(r, false))).toEqual(["high", "medium", "low"]);
    for (const rating of [1, 2, 3]) {
      expect(shouldOpenCase({ rating, wantsContact: false, hasContact: false })).toBe(true);
    }
  });

  test("a happy guest opens a case only by asking to be contacted, and only with a way to do it", () => {
    expect(shouldOpenCase({ rating: 5, wantsContact: false, hasContact: false })).toBe(false);
    expect(shouldOpenCase({ rating: 5, wantsContact: true, hasContact: false })).toBe(false);
    expect(shouldOpenCase({ rating: 5, wantsContact: true, hasContact: true })).toBe(true);
    expect(severityFor(5, true)).toBe("low");
    expect(severityFor(4, false)).toBeNull();
  });

  test("the first response is due in 24 hours, and only an open case can be overdue", () => {
    const opened = new Date("2026-10-05T12:00:00Z");
    const dueAt = caseDueAt(opened);
    expect(dueAt.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(isOverdue({ status: "open", dueAt }, new Date("2026-10-06T12:00:01Z"))).toBe(true);
    expect(isOverdue({ status: "open", dueAt }, new Date("2026-10-06T11:59:59Z"))).toBe(false);
    expect(isOverdue({ status: "contacted", dueAt }, new Date("2026-10-09T00:00:00Z"))).toBe(false);
  });

  test("a case moves open to contacted to resolved, or straight to resolved, never back", () => {
    expect(canTransition("open", "contacted")).toBe(true);
    expect(canTransition("open", "resolved")).toBe(true);
    expect(canTransition("contacted", "resolved")).toBe(true);
    expect(canTransition("contacted", "open")).toBe(false);
    expect(canTransition("resolved", "open")).toBe(false);
    expect(canTransition("resolved", "contacted")).toBe(false);
  });
});

describe("invitations", () => {
  test("tokens are random, prefixed, and stored only as a hash", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
    expect(a.startsWith("svy_")).toBe(true);
    expect(hashInvitationToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(a)).not.toContain(a);
  });

  test("anything that does not look like a token is refused before a lookup", () => {
    expect(looksLikeInvitationToken(generateInvitationToken())).toBe(true);
    for (const bad of ["", "svy_", "abc", `svy_${"x".repeat(200)}`]) {
      expect(looksLikeInvitationToken(bad)).toBe(false);
    }
  });

  test("a link lives seven days and works once", () => {
    const created = new Date("2026-10-05T12:00:00Z");
    const expiresAt = invitationExpiry(created);
    expect(INVITATION_DAYS).toBe(7);
    expect(expiresAt.toISOString()).toBe("2026-10-12T12:00:00.000Z");
    expect(invitationState({ expiresAt, usedAt: null }, new Date("2026-10-12T11:59:59Z"))).toBe(
      "valid",
    );
    expect(invitationState({ expiresAt, usedAt: null }, expiresAt)).toBe("expired");
    expect(invitationState({ expiresAt, usedAt: new Date() }, created)).toBe("used");
  });
});

describe("QR tokens", () => {
  const secret = "test-secret-test-secret-test-secret-32";
  const loc = "7f0c2a4e-3b1d-4c55-9a3e-0d6f1b2c3a4d";

  test("a signed token names its location and version", () => {
    expect(verifyQrToken(secret, signQrToken(secret, loc, 3))).toEqual({
      locationId: loc,
      version: 3,
    });
  });

  test("a changed location, version or signature fails", () => {
    const token = signQrToken(secret, loc, 1);
    const [p, l, v, s] = token.split(".") as [string, string, string, string];
    const other = "8a1d3b5f-4c2e-4d66-8b4f-1e7a2c3d4b5e";
    for (const forged of [
      `${p}.${other}.${v}.${s}`,
      `${p}.${l}.2.${s}`,
      `${p}.${l}.${v}.${s.slice(0, -2)}xx`,
      `${p}.${l}.${v}.`,
    ]) {
      expect(verifyQrToken(secret, forged)).toBeNull();
    }
  });

  test("another secret, malformed text and a bad version are refused", () => {
    expect(
      verifyQrToken("another-secret-another-secret-32chars", signQrToken(secret, loc, 1)),
    ).toBeNull();
    for (const bad of [
      "",
      "qr1",
      "qr1.a.b.c",
      `qr1.${loc}.0.sig`,
      `qr1.${loc}.-1.sig`,
      `qr2.${loc}.1.sig`,
    ]) {
      expect(verifyQrToken(secret, bad)).toBeNull();
    }
  });

  test("a device hash is stable, salted and never the cookie", () => {
    const h = hashDevice(secret, "cookie-123");
    expect(h).toBe(hashDevice(secret, "cookie-123"));
    expect(h).not.toBe(hashDevice("another-secret-another-secret-32chars", "cookie-123"));
    expect(h).not.toContain("cookie-123");
  });
});

describe("send timing", () => {
  const CHICAGO = "America/Chicago";

  test("quiet hours are 21:00 to 09:00", () => {
    expect([8, 9, 12, 20, 21, 23, 0].map(isQuietHour)).toEqual([
      true,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  test("a daytime delay is kept as is", () => {
    const now = new Date("2026-10-05T17:00:00Z"); // 12:00 in Chicago (CDT)
    expect(nextSendTime(now, 120, CHICAGO).toISOString()).toBe("2026-10-05T19:00:00.000Z");
  });

  test("a delay that lands after 21:00 local waits until 09:00 the next morning", () => {
    const now = new Date("2026-10-06T01:30:00Z"); // 20:30 in Chicago
    // 20:30 + 2h = 22:30 local, quiet. Next 09:00 local is 2026-10-06 09:00 CDT = 14:00Z.
    expect(nextSendTime(now, 120, CHICAGO).toISOString()).toBe("2026-10-06T14:00:00.000Z");
  });

  test("a delay that lands before 09:00 local waits until 09:00 the same day", () => {
    const now = new Date("2026-10-05T10:00:00Z"); // 05:00 in Chicago
    expect(nextSendTime(now, 60, CHICAGO).toISOString()).toBe("2026-10-05T14:00:00.000Z");
  });

  test("uses the location's own zone, not the server's", () => {
    const now = new Date("2026-10-05T17:00:00Z"); // 03:00 next day in Sydney? it is 04:00 AEDT, quiet
    expect(nextSendTime(now, 0, "Australia/Sydney").toISOString()).toBe("2026-10-05T22:00:00.000Z");
  });

  test("holds across the daylight-saving change", () => {
    // 2026-11-01 02:00 CDT -> 01:00 CST. 22:00 CST on Oct 31... use Nov 1 evening, after the change.
    const now = new Date("2026-11-02T03:30:00Z"); // 21:30 CST on Nov 1
    expect(nextSendTime(now, 0, CHICAGO).toISOString()).toBe("2026-11-02T15:00:00.000Z"); // 09:00 CST
  });

  test("a zero delay in the daytime is immediate", () => {
    const now = new Date("2026-10-05T17:00:00Z");
    expect(nextSendTime(now, 0, CHICAGO).getTime()).toBe(now.getTime());
  });

  test("a visit more than two local days old is stale", () => {
    const now = new Date("2026-10-05T17:00:00Z");
    expect(isStaleVisit("2026-10-05", now, CHICAGO)).toBe(false);
    expect(isStaleVisit("2026-10-03", now, CHICAGO)).toBe(false);
    expect(isStaleVisit("2026-10-02", now, CHICAGO)).toBe(true);
  });
});

describe("SurveySubmission", () => {
  test("accepts the template's answers and defaults the rest", () => {
    const parsed = SurveySubmission.parse({ rating: 4 });
    expect(parsed).toMatchObject({
      rating: 4,
      bestPart: null,
      improve: null,
      comment: null,
      wantsContact: false,
    });
  });

  test("rejects a rating out of range, a fractional rating and an unknown option", () => {
    for (const bad of [
      { rating: 0 },
      { rating: 6 },
      { rating: 3.5 },
      { rating: 4, bestPart: "parking" },
    ]) {
      expect(SurveySubmission.safeParse(bad).success).toBe(false);
    }
  });

  test("an empty comment is no comment, and a long one is refused", () => {
    expect(SurveySubmission.parse({ rating: 3, comment: "   " }).comment).toBeNull();
    expect(SurveySubmission.safeParse({ rating: 3, comment: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});
