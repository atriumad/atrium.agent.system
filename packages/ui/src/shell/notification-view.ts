import type { AppNotification } from "../api";

export type NotificationType = "case" | "place" | "help" | "other";

export function notificationType(kind: string): NotificationType {
  switch (kind) {
    case "reputation.case_alert":
    case "reputation.case_resolved":
      return "case";
    case "core.location_requested":
    case "core.location_decided":
      return "place";
    case "reputation.help_message":
      return "help";
    default:
      return "other";
  }
}

/** What the person is expected to do. An older row with no target can only send them to the list. */
export function notificationAction(kind: string, target: AppNotification["target"]): string | null {
  const exact = (word: string) => (target ? word : "View list");
  switch (kind) {
    case "reputation.case_alert":
    case "reputation.case_resolved":
      return exact("Open case");
    case "core.location_requested":
      return exact("Review place");
    case "core.location_decided":
      return exact("View place");
    case "reputation.help_message":
      return exact("Reply");
    default:
      return null;
  }
}

/** The first line of the body that has text: the context a row shows under its subject. */
export function firstLine(body: string): string {
  return (
    body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

export type NotificationGroup = "today" | "yesterday" | "this_week" | "earlier";

export const GROUP_LABEL: Record<NotificationGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  earlier: "Earlier",
};

/** Calendar days in the viewer's time zone. A timestamp in the future counts as today. */
export function dayGroup(iso: string, now: Date): NotificationGroup {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "this_week";
  return "earlier";
}

const ORDER: NotificationGroup[] = ["today", "yesterday", "this_week", "earlier"];

/** The groups in time order, each keeping the order it came in, and none empty. */
export function groupByDay(
  items: AppNotification[],
  now: Date,
): { group: NotificationGroup; items: AppNotification[] }[] {
  return ORDER.map((group) => ({
    group,
    items: items.filter((n) => dayGroup(n.createdAt, now) === group),
  })).filter((g) => g.items.length > 0);
}
