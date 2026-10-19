/**
 * Pure math for the loyalty band: a window of N days against the N days before it, and the
 * change between them. No database, no NaN: a zero or missing denominator gives null.
 */
export type SummaryRange = "7d" | "30d" | "90d";
export const SUMMARY_DAYS: Record<SummaryRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
/** A change needs at least this many in the window and in the one before it. */
export const MIN_COUNT = 10;

const DAY_MS = 86_400_000;

/** Half-open windows `(from, to]`: the last N days up to `now`, and the N days before them. */
export function summaryWindows(now: Date, days: number) {
  const end = now.getTime();
  const mid = end - days * DAY_MS;
  const start = mid - days * DAY_MS;
  return {
    current: { from: new Date(mid), to: new Date(end) },
    previous: { from: new Date(start), to: new Date(mid) },
  };
}

export type Tile = { value: number; change: number | null; small: boolean };

/** `change` is a percent. Null while either window holds fewer than `MIN_COUNT`. */
export function compareCounts(current: number, previous: number): Tile {
  const small = current < MIN_COUNT || previous < MIN_COUNT;
  const change = small || previous <= 0 ? null : ((current - previous) / previous) * 100;
  return { value: current, change, small };
}
