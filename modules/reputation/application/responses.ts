import {
  describeLocations,
  listLocationLabels,
  locationVisible,
  type Scope,
  type Tx,
} from "@atrium/core";
import { type AnyColumn, and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { RANGE_DAYS, type Range, windowDates } from "../domain/insights";
import { escapeLike, type ResponseSort, type SortDir } from "../domain/tables";
import { recoveryCases, surveyResponses } from "../infra/schema";
import { assertCan, type SurveyResponseRow } from "./admin";

export type ResponseQuery = {
  range: Range;
  locationId?: string;
  q?: string;
  maxRating?: number;
  rating?: number;
  sentiment?: "positive" | "neutral" | "negative";
  topic?: string;
  wantsContact?: boolean;
  hasCase?: boolean;
  safety?: boolean;
  sort: ResponseSort;
  dir: SortDir;
  page: number;
  pageSize: number;
  now: Date;
};

export type ResponseTableRow = SurveyResponseRow & {
  sentiment: string | null;
  topics: string[] | null;
  concern: string | null;
  safety: boolean | null;
};

export type ResponsesPage = {
  rows: ResponseTableRow[];
  total: number;
  page: number;
  pageSize: number;
  unread: number;
  counts: { all: number; lowRating: number; wantsContact: number; hasCase: number; safety: number };
};

const LOW_RATING = 3;

const hasCaseSql = sql`exists (select 1 from ${recoveryCases} where ${recoveryCases.responseId} = ${surveyResponses.id})`;

/**
 * The last N local calendar days of each place (the same days as the Overview's windows), exact in
 * SQL: one lower bound per time zone, the start of that zone's oldest day. Places are grouped by
 * zone so the condition stays short.
 */
function windowCondition(places: { id: string; timeZone: string }[], days: number, now: Date) {
  const byZone = new Map<string, string[]>();
  for (const p of places) byZone.set(p.timeZone, [...(byZone.get(p.timeZone) ?? []), p.id]);
  const parts: SQL[] = [];
  for (const [zone, ids] of byZone) {
    const first = windowDates(now, zone, days).current[0] as string;
    parts.push(
      sql`(${inArray(surveyResponses.locationId, ids)} and ${surveyResponses.createdAt} >= (${first}::date)::timestamp at time zone ${zone})`,
    );
  }
  return sql.join(parts, sql` or `);
}

/** One page of answers, filtered and sorted on the server. RLS (the passed Tx) picks the clients. */
export async function listResponsesPage(
  tx: Tx,
  scope: Scope,
  query: ResponseQuery,
): Promise<ResponsesPage> {
  assertCan(scope, "read");
  const { page, pageSize } = query;
  const empty: ResponsesPage = {
    rows: [],
    total: 0,
    page,
    pageSize,
    unread: 0,
    counts: { all: 0, lowRating: 0, wantsContact: 0, hasCase: 0, safety: 0 },
  };
  // Every place the scope sees; a place id from the query outside of it just matches nothing.
  const all = (await listLocationLabels(tx)).filter((l) => locationVisible(scope, l.id));
  const places = query.locationId ? all.filter((l) => l.id === query.locationId) : all;
  if (places.length === 0) return empty;

  const base = sql`(${windowCondition(places, RANGE_DAYS[query.range], query.now)})`;

  const filters: (SQL | undefined)[] = [base];
  if (query.maxRating) filters.push(sql`${surveyResponses.rating} <= ${query.maxRating}`);
  if (query.rating) filters.push(eq(surveyResponses.rating, query.rating));
  if (query.sentiment) {
    filters.push(sql`${surveyResponses.readAt} is not null`);
    filters.push(eq(surveyResponses.sentiment, query.sentiment));
  }
  if (query.topic) {
    filters.push(sql`${surveyResponses.readAt} is not null`);
    filters.push(sql`${query.topic} = any(${surveyResponses.topics})`);
  }
  if (query.wantsContact) filters.push(eq(surveyResponses.wantsContact, true));
  if (query.hasCase) filters.push(hasCaseSql);
  if (query.safety) filters.push(eq(surveyResponses.safety, true));
  const text = query.q?.trim();
  if (text) {
    // Parameterised, and the user's text is escaped so % _ and \ match themselves.
    const pattern = `%${escapeLike(text)}%`;
    const like = (col: AnyColumn) => sql`${col} ilike ${pattern} escape '\\'`;
    filters.push(
      sql`(${like(surveyResponses.comment)} or ${like(surveyResponses.bestPart)} or ${like(surveyResponses.improve)})`,
    );
  }
  const where = and(...filters);

  const [totals] = await tx
    .select({
      total: sql<number>`count(*)::int`,
      unread: sql<number>`(count(*) filter (where ${surveyResponses.sentiment} is null))::int`,
    })
    .from(surveyResponses)
    .where(where);

  const [counts] = await tx
    .select({
      all: sql<number>`count(*)::int`,
      lowRating: sql<number>`(count(*) filter (where ${surveyResponses.rating} <= ${LOW_RATING}))::int`,
      wantsContact: sql<number>`(count(*) filter (where ${surveyResponses.wantsContact}))::int`,
      hasCase: sql<number>`(count(*) filter (where ${hasCaseSql}))::int`,
      safety: sql<number>`(count(*) filter (where ${surveyResponses.safety} is true))::int`,
    })
    .from(surveyResponses)
    .where(base);

  const total = totals?.total ?? 0;
  const result: ResponsesPage = {
    ...empty,
    total,
    unread: totals?.unread ?? 0,
    counts: counts ?? empty.counts,
  };
  if ((page - 1) * pageSize >= total) return result;

  // Allow-listed sort: the column comes from a fixed map, never from the request text.
  const direction = query.dir === "asc" ? asc : desc;
  const placeRank = sql`coalesce(array_position(${sql.raw("ARRAY[")}${sql.join(
    [...places]
      .sort((a, b) => a.locationName.localeCompare(b.locationName))
      .map((p) => sql`${p.id}::uuid`),
    sql`, `,
  )}${sql.raw("]")}, ${surveyResponses.locationId}), 0)`;
  const sentimentRank = sql`case ${surveyResponses.sentiment} when 'negative' then 1 when 'neutral' then 2 when 'positive' then 3 else 4 end`;
  const primary =
    query.sort === "rating"
      ? [direction(surveyResponses.rating)]
      : query.sort === "place"
        ? [direction(placeRank)]
        : query.sort === "sentiment"
          ? [direction(sentimentRank)]
          : [];
  const order = [...primary, direction(surveyResponses.createdAt), desc(surveyResponses.id)];

  const found = await tx
    .select({ r: surveyResponses, caseId: recoveryCases.id })
    .from(surveyResponses)
    .leftJoin(recoveryCases, eq(recoveryCases.responseId, surveyResponses.id))
    .where(where)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const labels = await describeLocations(
    tx,
    found.map(({ r }) => r.locationId),
  );
  result.rows = found.map(({ r, caseId }) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: labels.get(r.locationId)?.clientName ?? "",
    locationId: r.locationId,
    locationName: labels.get(r.locationId)?.locationName ?? "",
    rating: r.rating,
    bestPart: r.bestPart,
    improve: r.improve,
    comment: r.comment,
    wantsContact: r.wantsContact,
    severity: r.severity,
    source: r.invitationId ? "invitation" : "qr",
    reviewClicked: r.reviewClickedAt !== null,
    caseId,
    createdAt: r.createdAt,
    sentiment: r.sentiment,
    topics: r.topics,
    concern: r.concern,
    safety: r.safety,
  }));
  return result;
}
