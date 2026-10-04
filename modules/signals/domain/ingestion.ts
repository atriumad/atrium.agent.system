import { type SignalRow, signalNaturalKey } from "@atrium/contracts";

/**
 * Rules for accepting a batch of signal rows. Pure: the caller supplies the facts it looked up
 * (which client owns each location, what day it is) and gets back every problem at once.
 * A batch is all or nothing, so a connector's retry sees the same result every time.
 */
export type ProblemCode =
  | "source_not_permitted"
  | "location_not_permitted"
  | "date_out_of_range"
  | "duplicate_key";

export type Problem = { index: number; code: ProblemCode; message: string };

export type Principal = {
  /** The token's id, for the audit trail. */
  tokenId: string;
  name: string;
  sources: readonly string[];
  clientIds: readonly string[];
};

export const EARLIEST_DATE = "2020-01-01";

/** The latest accepted date is tomorrow (UTC), which covers every location's local day. */
export function latestDate(today: string): string {
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export type BatchCheck = {
  problems: Problem[];
  /** Rows grouped by the client that owns their location. Only meaningful without problems. */
  byClient: Map<string, SignalRow[]>;
};

export function checkBatch(
  rows: readonly SignalRow[],
  context: {
    principal: Pick<Principal, "sources" | "clientIds">;
    /** location id -> client id, for the locations the caller could find. */
    locationClient: ReadonlyMap<string, string>;
    /** `YYYY-MM-DD`, UTC. */
    today: string;
  },
): BatchCheck {
  const problems: Problem[] = [];
  const byClient = new Map<string, SignalRow[]>();
  const seen = new Map<string, number>();
  const latest = latestDate(context.today);
  const allowedClients = new Set(context.principal.clientIds);
  const allowedSources = new Set(context.principal.sources);

  rows.forEach((row, index) => {
    if (!allowedSources.has(row.source)) {
      problems.push({
        index,
        code: "source_not_permitted",
        message: `this token cannot write source ${row.source}`,
      });
    }

    // A location that does not exist and one that belongs to someone else look the same, so a
    // connector learns nothing about clients it does not serve.
    const clientId = context.locationClient.get(row.locationId);
    if (!clientId || !allowedClients.has(clientId)) {
      problems.push({ index, code: "location_not_permitted", message: "location not permitted" });
    }

    if (row.date < EARLIEST_DATE || row.date > latest) {
      problems.push({
        index,
        code: "date_out_of_range",
        message: `date must be between ${EARLIEST_DATE} and ${latest}`,
      });
    }

    const key = signalNaturalKey(row);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, index);
    else {
      problems.push({
        index,
        code: "duplicate_key",
        message: `same signal as row ${first}: one value per day, location, source, platform, element and type`,
      });
    }

    if (clientId && allowedClients.has(clientId)) {
      const group = byClient.get(clientId);
      if (group) group.push(row);
      else byClient.set(clientId, [row]);
    }
  });

  return { problems, byClient };
}

/** First and last date of some rows, and how many there are. For the `signals.ingested` event. */
export function summarize(rows: readonly SignalRow[]) {
  let from = rows[0]?.date ?? "";
  let to = from;
  for (const row of rows) {
    if (row.date < from) from = row.date;
    if (row.date > to) to = row.date;
  }
  return { from, to, rowCount: rows.length };
}

/** The distinct months (first day) touched by some rows. Each needs a partition. */
export function monthsOf(rows: readonly SignalRow[]): string[] {
  return [...new Set(rows.map((row) => `${row.date.slice(0, 7)}-01`))].sort();
}
