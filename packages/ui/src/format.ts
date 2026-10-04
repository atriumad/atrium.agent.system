/** Pure display rules for recovery cases. No React, so they are tested on their own. */

export type DueTone = "ok" | "soon" | "overdue";

const SOON_MS = 4 * 3_600_000;

export function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The first-response target of a case, or null once nobody needs to watch it. */
export function dueLabel(
  status: string,
  dueAt: string,
  now: Date,
): { text: string; tone: DueTone } | null {
  if (status !== "open") return null; // contacted already met the target; resolved is closed
  const left = new Date(dueAt).getTime() - now.getTime();
  if (left < 0) return { text: `Overdue by ${duration(left)}`, tone: "overdue" };
  return { text: `Due in ${duration(left)}`, tone: left <= SOON_MS ? "soon" : "ok" };
}

export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  return ms < 60_000 ? "just now" : `${duration(ms)} ago`;
}

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  contacted: "Contacted",
  resolved: "Resolved",
};

export const SEVERITY_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const TABS = ["active", "open", "contacted", "resolved", "all"] as const;
export type Tab = (typeof TABS)[number];

/** "Active" is everything a person still has to do something about. */
export function inTab(status: string, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "active") return status !== "resolved";
  return status === tab;
}

const WORDS: Record<string, string> = {
  food: "the food",
  service: "the service",
  atmosphere: "the atmosphere",
  value: "the value",
  speed: "the speed",
  drinks: "the drinks",
  cleanliness: "the cleanliness",
  nothing: "nothing",
};

export function answerLabel(value: string | null): string | null {
  return value ? (WORDS[value] ?? value) : null;
}
