/**
 * When a review request goes out. Docs: agents / Host (Ask: "times the review request to the
 * happy moment after the visit"). Local time of the location decides, not the server's.
 */
export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 9;
/** A visit older than this is no longer a happy moment: nothing is sent. */
export const STALE_AFTER_DAYS = 2;

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

function localParts(instant: Date, timeZone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Minutes the zone is ahead of UTC at this instant. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/** The instant at which a zone's wall clock reads `hour:00` on the given local date. */
function instantAtLocalHour(
  date: { year: number; month: number; day: number },
  hour: number,
  timeZone: string,
): Date {
  let guess = new Date(Date.UTC(date.year, date.month - 1, date.day, hour));
  for (let i = 0; i < 2; i++) {
    guess = new Date(
      Date.UTC(date.year, date.month - 1, date.day, hour) - offsetMinutes(guess, timeZone) * 60000,
    );
  }
  return guess;
}

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/**
 * `now` plus the delay, moved to 09:00 local if it lands in quiet hours (21:00 to 09:00).
 */
export function nextSendTime(now: Date, delayMinutes: number, timeZone: string): Date {
  const candidate = new Date(now.getTime() + delayMinutes * 60000);
  const local = localParts(candidate, timeZone);
  if (!isQuietHour(local.hour)) return candidate;

  // After 21:00 the next 09:00 is tomorrow; before 09:00 it is today.
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (local.hour >= QUIET_FROM_HOUR) target.setUTCDate(target.getUTCDate() + 1);
  return instantAtLocalHour(
    { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate() },
    QUIET_UNTIL_HOUR,
    timeZone,
  );
}

/** True when the visit's local day is more than two days behind the location's local today. */
export function isStaleVisit(visitDate: string, now: Date, timeZone: string): boolean {
  const today = localParts(now, timeZone);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const visitUtc = new Date(`${visitDate}T00:00:00Z`).getTime();
  return (todayUtc - visitUtc) / 86_400_000 > STALE_AFTER_DAYS;
}
