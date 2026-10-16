import { describe, expect, test } from "bun:test";
import type { AppNotification } from "../src/api";
import {
  dayGroup,
  firstLine,
  GROUP_LABEL,
  groupByDay,
  notificationAction,
  notificationType,
} from "../src/shell/notification-view";

// Local-time constructors keep these tests independent of the machine's time zone.
const now = new Date(2026, 9, 16, 15, 0);
const at = (d: Date) => d.toISOString();
const item = (id: string, when: Date): AppNotification => ({
  id,
  kind: "reputation.case_alert",
  subject: id,
  body: "x",
  createdAt: at(when),
  readAt: null,
  target: null,
});

describe("dayGroup", () => {
  test("groups by calendar day, not by 24-hour blocks", () => {
    expect(dayGroup(at(new Date(2026, 9, 16, 0, 5)), now)).toBe("today");
    expect(dayGroup(at(new Date(2026, 9, 15, 23, 59)), now)).toBe("yesterday");
    expect(dayGroup(at(new Date(2026, 9, 13, 12, 0)), now)).toBe("this_week");
    expect(dayGroup(at(new Date(2026, 9, 8, 12, 0)), now)).toBe("earlier");
  });

  test("a timestamp in the future counts as today", () => {
    expect(dayGroup(at(new Date(2026, 9, 17, 9, 0)), now)).toBe("today");
  });
});

describe("groupByDay", () => {
  test("keeps the order, orders the groups and omits empty ones", () => {
    const groups = groupByDay(
      [
        item("a", new Date(2026, 9, 16, 9, 0)),
        item("b", new Date(2026, 9, 16, 8, 0)),
        item("c", new Date(2026, 9, 9, 8, 0)),
      ],
      now,
    );
    expect(groups.map((g) => g.group)).toEqual(["today", "earlier"]);
    expect(groups[0]?.items.map((n) => n.id)).toEqual(["a", "b"]);
    expect(GROUP_LABEL.this_week).toBe("This week");
  });
});

describe("notificationType and notificationAction", () => {
  test("each kind has a type", () => {
    expect(notificationType("reputation.case_alert")).toBe("case");
    expect(notificationType("reputation.case_resolved")).toBe("case");
    expect(notificationType("core.location_requested")).toBe("place");
    expect(notificationType("core.location_decided")).toBe("place");
    expect(notificationType("reputation.help_message")).toBe("help");
    expect(notificationType("something.else")).toBe("other");
  });

  test("the action says what to do, and an old row with no target says to view the list", () => {
    const target = { type: "case", id: "c1" } as const;
    expect(notificationAction("reputation.case_alert", target)).toBe("Open case");
    expect(notificationAction("reputation.case_alert", null)).toBe("View list");
    expect(notificationAction("core.location_requested", { type: "location", id: "p" })).toBe(
      "Review place",
    );
    expect(notificationAction("core.location_decided", { type: "location", id: "p" })).toBe(
      "View place",
    );
    expect(notificationAction("reputation.help_message", { type: "help_request", id: "r" })).toBe(
      "Reply",
    );
    expect(notificationAction("something.else", null)).toBeNull();
  });
});

describe("firstLine", () => {
  test("takes the first line that has text", () => {
    expect(firstLine("\n  \nA survey opened a case.\nRating: 1 of 5.")).toBe(
      "A survey opened a case.",
    );
  });

  test("an empty body is an empty line, not a crash", () => {
    expect(firstLine("")).toBe("");
    expect(firstLine("   \n  ")).toBe("");
  });
});
