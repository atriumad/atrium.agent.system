import { describe, expect, test } from "bun:test";
import { EVENT_SCHEMAS, EVENT_TYPES, findPersonalDataKey, parseEvent } from "./events";

const ids = {
  id: "0b6f4f58-1c0e-4b3a-9a53-0f2f5c1d2e3a",
  occurredAt: "2026-07-10T12:00:00.000Z",
  clientId: "7f0c2a4e-3b1d-4c55-9a3e-0d6f1b2c3a4d",
};

const valid = {
  "signals.ingested": {
    ...ids,
    type: "signals.ingested",
    version: 1,
    data: { source: "toast", from: "2026-07-09", to: "2026-07-10", rowCount: 12 },
  },
  "guest.identified": {
    ...ids,
    type: "guest.identified",
    version: 1,
    data: { guestId: "9d4f9c52-6a1e-4a87-8d6b-3c1c2f0a7b11" },
  },
  "guest.erased": {
    ...ids,
    type: "guest.erased",
    version: 1,
    data: { guestId: "9d4f9c52-6a1e-4a87-8d6b-3c1c2f0a7b11" },
  },
  "package.changed": {
    ...ids,
    type: "package.changed",
    version: 1,
    data: { previous: "essential", current: "pillar_2" },
  },
  "approval.requested": {
    ...ids,
    type: "approval.requested",
    version: 1,
    data: {
      approvalId: "5c2e8a10-7d3b-4f6e-8a21-9b0c1d2e3f44",
      itemType: "reputation.reply",
      itemRef: "review_881",
    },
  },
  "approval.decided": {
    ...ids,
    type: "approval.decided",
    version: 1,
    data: {
      approvalId: "5c2e8a10-7d3b-4f6e-8a21-9b0c1d2e3f44",
      itemType: "reputation.reply",
      itemRef: "review_881",
      decision: "approved",
    },
  },
  "visit.identified": {
    ...ids,
    type: "visit.identified",
    version: 1,
    data: { guestId: "9d4f9c52-6a1e-4a87-8d6b-3c1c2f0a7b11", date: "2026-07-10" },
  },
  "survey.sent": {
    ...ids,
    type: "survey.sent",
    version: 1,
    data: { invitationId: "6d3f9b21-8e4c-4a77-9b32-0a1b2c3d4e55", channel: "email" },
  },
  "survey.response.submitted": {
    ...ids,
    type: "survey.response.submitted",
    version: 1,
    data: { responseId: "7e4a0c32-9f5d-4b88-8c43-1b2c3d4e5f66", rating: 2, wantsContact: true },
  },
  "survey.response.read": {
    ...ids,
    type: "survey.response.read",
    version: 1,
    data: {
      responseId: "7e4a0c32-9f5d-4b88-8c43-1b2c3d4e5f66",
      sentiment: "negative",
      concern: "high",
      safety: true,
    },
  },
  "recovery.case.opened": {
    ...ids,
    type: "recovery.case.opened",
    version: 1,
    data: { caseId: "8f5b1d43-0a6e-4c99-9d54-2c3d4e5f6a77", severity: "high" },
  },
  "recovery.case.resolved": {
    ...ids,
    type: "recovery.case.resolved",
    version: 1,
    data: { caseId: "8f5b1d43-0a6e-4c99-9d54-2c3d4e5f6a77" },
  },
  "review.link.clicked": {
    ...ids,
    type: "review.link.clicked",
    version: 1,
    data: { responseId: "7e4a0c32-9f5d-4b88-8c43-1b2c3d4e5f66" },
  },
  "consent.changed": {
    ...ids,
    type: "consent.changed",
    version: 1,
    data: {
      guestId: "9d4f9c52-6a1e-4a87-8d6b-3c1c2f0a7b11",
      channel: "email",
      purpose: "marketing",
      granted: false,
    },
  },
} as const;

describe("event contracts", () => {
  test("every registered event has a valid example", () => {
    expect(Object.keys(valid).sort()).toEqual([...EVENT_TYPES].sort());
    expect(EVENT_SCHEMAS.length as number).toBe(EVENT_TYPES.length);
    for (const example of Object.values(valid)) {
      expect(parseEvent(example).type).toBe(example.type);
    }
  });

  test("every registered event rejects an invalid example", () => {
    for (const example of Object.values(valid)) {
      expect(() => parseEvent({ ...example, id: "not-a-uuid" })).toThrow();
      expect(() => parseEvent({ ...example, data: {} })).toThrow();
    }
  });

  test("locationId defaults to null", () => {
    expect(parseEvent(valid["guest.identified"]).locationId).toBeNull();
  });

  test("unknown type and unknown version are rejected", () => {
    expect(() => parseEvent({ ...valid["guest.identified"], type: "guest.deleted" })).toThrow(
      "unknown event",
    );
    expect(() => parseEvent({ ...valid["guest.identified"], version: 2 })).toThrow("unknown event");
  });

  test("extra data fields are rejected, so personal data cannot ride along", () => {
    const withEmail = {
      ...valid["guest.identified"],
      data: { guestId: valid["guest.identified"].data.guestId, email: "a@b.co" },
    };
    expect(() => parseEvent(withEmail)).toThrow();
  });
});

describe("personal data guard", () => {
  test("finds contact fields at any depth", () => {
    expect(findPersonalDataKey({ guestId: "x" })).toBeNull();
    expect(findPersonalDataKey({ a: { b: [{ Phone: "1" }] } })).toBe("Phone");
    expect(findPersonalDataKey({ email: "a@b.co" })).toBe("email");
  });
});
