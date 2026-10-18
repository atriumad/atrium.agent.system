// modules/reputation/domain/insights.ts
/**
 * Pure aggregation for the Overview: windows of local calendar days, small-sample rule, medians.
 * No database, no imports. No NaN leaves these functions: a zero denominator gives null.
 */
export type Range = "7d" | "30d" | "90d";
export const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };
/** A delta needs at least this many answers in the window and in the previous window. */
export const MIN_SAMPLE = 10;

export function parseRange(value: string | undefined): Range | null {
  if (value === undefined) return "30d";
  return value === "7d" || value === "30d" || value === "90d" ? value : null;
}

function format(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** YYYY-MM-DD of the instant in the zone. An invalid zone falls back to UTC. */
export function localDate(at: Date, timeZone: string): string {
  try {
    return format(at, timeZone);
  } catch {
    return format(at, "UTC");
  }
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

/** `days` local dates ending on today's, and the `days` before them. Both ascending. */
export function windowDates(
  now: Date,
  timeZone: string,
  days: number,
): { current: string[]; previous: string[] } {
  const today = localDate(now, timeZone);
  const current: string[] = [];
  const previous: string[] = [];
  for (let i = days - 1; i >= 0; i--) current.push(shiftDate(today, -i));
  for (let i = days - 1; i >= 0; i--) previous.push(shiftDate(today, -days - i));
  return { current, previous };
}

export type AnswerRow = {
  locationId: string;
  createdAt: Date;
  rating: number;
  sentiment: string | null;
  topics: string[] | null;
  readAt: Date | null;
  reviewClickedAt: Date | null;
  invitationId: string | null;
};
export type PlaceZone = { id: string; timeZone: string };
export type Compared = {
  value: number | null;
  change: number | null;
  n: number;
  nPrevious: number;
  small: boolean;
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Difference of means (same unit as the values). */
export function compareMean(current: number[], previous: number[]): Compared {
  const n = current.length;
  const nPrevious = previous.length;
  const value = mean(current);
  const before = mean(previous);
  const small = n < MIN_SAMPLE;
  const change =
    value === null || before === null || small || nPrevious < MIN_SAMPLE ? null : value - before;
  return { value, change, n, nPrevious, small };
}

/** Percent change of a count. */
export function compareCount(current: number, previous: number): Compared {
  const small = current < MIN_SAMPLE;
  const change = small || previous < MIN_SAMPLE ? null : ((current - previous) / previous) * 100;
  return { value: current, change, n: current, nPrevious: previous, small };
}

/** Rate num/den; change in percentage points. */
export function compareRate(
  cur: { num: number; den: number },
  prev: { num: number; den: number },
): Compared {
  const value = cur.den > 0 ? cur.num / cur.den : null;
  const before = prev.den > 0 ? prev.num / prev.den : null;
  const small = cur.den < MIN_SAMPLE;
  const change =
    value === null || before === null || small || prev.den < MIN_SAMPLE
      ? null
      : (value - before) * 100;
  return { value, change, n: cur.den, nPrevious: prev.den, small };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] as number;
  return sorted.length % 2 === 1 ? hi : ((sorted[mid - 1] as number) + hi) / 2;
}

/** One entry per local date of the current window; a day without answers has average null. */
export function dailySeries(
  rows: AnswerRow[],
  zones: PlaceZone[],
  now: Date,
  days: number,
): { date: string; average: number | null; count: number }[] {
  const zoneOf = new Map(zones.map((z) => [z.id, z.timeZone]));
  const today = zones.reduce(
    (latest, z) => {
      const d = localDate(now, z.timeZone);
      return d > latest ? d : latest;
    },
    zones.length === 0 ? localDate(now, "UTC") : "",
  );
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(shiftDate(today, -i));
  const buckets = new Map<string, number[]>(dates.map((d) => [d, []]));
  const ownWindow = new Map<string, Set<string>>();
  for (const r of rows) {
    const zone = zoneOf.get(r.locationId) ?? "UTC";
    let own = ownWindow.get(zone);
    if (!own) {
      own = new Set(windowDates(now, zone, days).current);
      ownWindow.set(zone, own);
    }
    const date = localDate(r.createdAt, zone);
    if (own.has(date)) buckets.get(date)?.push(r.rating);
  }
  return dates.map((date) => {
    const ratings = buckets.get(date) ?? [];
    return { date, average: mean(ratings), count: ratings.length };
  });
}

export function splitByTopic(
  rows: AnswerRow[],
  limit: number,
): { topic: string; total: number; positive: number; neutral: number; negative: number }[] {
  const byTopic = new Map<
    string,
    { topic: string; total: number; positive: number; neutral: number; negative: number }
  >();
  for (const r of rows) {
    if (!r.sentiment || !r.topics) continue;
    for (const topic of r.topics) {
      let entry = byTopic.get(topic);
      if (!entry) {
        entry = { topic, total: 0, positive: 0, neutral: 0, negative: 0 };
        byTopic.set(topic, entry);
      }
      entry.total++;
      if (r.sentiment === "positive") entry.positive++;
      else if (r.sentiment === "negative") entry.negative++;
      else entry.neutral++;
    }
  }
  return [...byTopic.values()]
    .sort((a, b) => b.total - a.total || (a.topic < b.topic ? -1 : a.topic > b.topic ? 1 : 0))
    .slice(0, limit);
}

export function weightedMean(parts: { sum: number; n: number }[]): number | null {
  const n = parts.reduce((a, p) => a + p.n, 0);
  if (n === 0) return null;
  return parts.reduce((a, p) => a + p.sum, 0) / n;
}
