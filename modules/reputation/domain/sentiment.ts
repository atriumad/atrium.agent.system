// modules/reputation/domain/sentiment.ts
import { Reading } from "@atrium/contracts";
import { type Severity, severityFor, shouldOpenCase } from "./recovery";

export { CONCERNS, Reading, SENTIMENTS, TOPICS } from "@atrium/contracts";

const ORDER: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

export function readingSeverity(reading: Reading): Severity | null {
  if (reading.safety || reading.concern === "high") return "high";
  if (reading.concern === "medium") return "medium";
  if (reading.concern === "low") return "low";
  return null;
}

/** A low concern only labels. Medium, high or safety needs a person. */
export function readingOpensCase(reading: Reading): boolean {
  return reading.safety || reading.concern === "medium" || reading.concern === "high";
}

/** The higher of the rating's severity and the reading's. A reading never lowers anything. */
export function escalatedSeverity(
  rating: number,
  wantsContact: boolean,
  reading: Reading | null,
): Severity | null {
  const fromRating = severityFor(rating, wantsContact);
  const fromReading = reading ? readingSeverity(reading) : null;
  if (!fromReading) return fromRating;
  if (!fromRating) return fromReading;
  return ORDER[fromReading] > ORDER[fromRating] ? fromReading : fromRating;
}

/**
 * The rating's rule still decides on its own. A serious reading opens a case even without
 * contact details: the team can still look into it, so it must not wait for a way to reach the
 * guest.
 */
export function shouldOpenWithReading(input: {
  rating: number;
  wantsContact: boolean;
  hasContact: boolean;
  reading: Reading | null;
}): boolean {
  if (shouldOpenCase(input)) return true;
  return input.reading ? readingOpensCase(input.reading) : false;
}

/** The reading stored on a response row, or null when it is unread or holds something invalid. */
export function storedReading(row: {
  sentiment: string | null;
  topics: string[] | null;
  concern: string | null;
  safety: boolean | null;
}): Reading | null {
  const parsed = Reading.safeParse({
    sentiment: row.sentiment,
    topics: row.topics ?? [],
    concern: row.concern,
    safety: row.safety,
  });
  return parsed.success ? parsed.data : null;
}
