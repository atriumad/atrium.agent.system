// modules/reputation/domain/tables.ts
/**
 * Pure helpers for the Cases and Responses tables. No database.
 * No NaN leaves these functions: a zero denominator gives null.
 */
import { type Compared, compareRate } from "./insights";

/** Escapes `\`, `%` and `_` so user text matches literally inside a LIKE pattern. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Counts of ratings 1 to 5, in that order. Other values are ignored. */
export function ratingDistribution(ratings: number[]): [number, number, number, number, number] {
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of ratings) {
    if (Number.isInteger(r) && r >= 1 && r <= 5) out[r - 1] = (out[r - 1] as number) + 1;
  }
  return out;
}

export function severitySplit(severities: string[]): { high: number; medium: number; low: number } {
  const out = { high: 0, medium: 0, low: 0 };
  for (const s of severities) {
    if (s === "high" || s === "medium" || s === "low") out[s]++;
  }
  return out;
}

export type CaseTab = "active" | "open" | "contacted" | "resolved" | "all";

type CaseLike = { status: string; openedAt: Date };

/** Opened at or after `from`, or still open or contacted. */
export function caseInWindow(c: CaseLike, from: Date): boolean {
  return c.openedAt.getTime() >= from.getTime() || c.status === "open" || c.status === "contacted";
}

export function caseCounts(cases: CaseLike[], from: Date): Record<CaseTab, number> {
  const out: Record<CaseTab, number> = { active: 0, open: 0, contacted: 0, resolved: 0, all: 0 };
  for (const c of cases) {
    if (!caseInWindow(c, from)) continue;
    out.all++;
    if (c.status === "open") {
      out.open++;
      out.active++;
    } else if (c.status === "contacted") {
      out.contacted++;
      out.active++;
    } else if (c.status === "resolved") out.resolved++;
  }
  return out;
}

function negativeRate(sentiments: (string | null)[]): { num: number; den: number } {
  let num = 0;
  let den = 0;
  for (const s of sentiments) {
    if (s === null) continue;
    den++;
    if (s === "negative") num++;
  }
  return { num, den };
}

/** Share of negative answers among those with a reading; change in percentage points. */
export function negativeCompare(current: (string | null)[], previous: (string | null)[]): Compared {
  return compareRate(negativeRate(current), negativeRate(previous));
}

export const RESPONSE_SORTS = ["date", "rating", "place", "sentiment"] as const;
export type ResponseSort = (typeof RESPONSE_SORTS)[number];
export type SortDir = "asc" | "desc";
