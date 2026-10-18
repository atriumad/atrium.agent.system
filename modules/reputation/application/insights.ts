import { listLocationLabels, type Tx } from "@atrium/core";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import {
  type AnswerRow,
  compareCount,
  compareMean,
  compareRate,
  dailySeries,
  localDate,
  RANGE_DAYS,
  type Range,
  splitByTopic,
  windowDates,
} from "../domain/insights";
import { recoveryCases, reviewRequests, surveyResponses } from "../infra/schema";

export type Tile = {
  value: number | null;
  change: number | null;
  n: number;
  small: boolean;
  spark: number[];
};

export type OwnerInsights = {
  range: Range;
  generatedAt: string;
  window: { from: string; to: string };
  rating: Tile;
  responses: Tile & { answerRate: number | null; sent: number };
  reviewClicks: {
    clicks: number;
    answers: number;
    rate: number | null;
    change: number | null;
    small: boolean;
  };
  waiting: { open: number; overdue: number };
  series: { date: string; average: number | null; count: number }[];
  topics: { topic: string; total: number; positive: number; neutral: number; negative: number }[];
  read: number;
  places: {
    locationId: string;
    name: string;
    rating: number | null;
    change: number | null;
    responses: number;
    openCases: number;
    overdueCases: number;
  }[];
  host: { requestsSent: number; casesOpened: number; answersRead: number };
};

const TOPIC_LIMIT = 5;
const DAY_MS = 86_400_000;

/**
 * The owner's Overview numbers, read through the caller's transaction: row-level security decides
 * which places and rows are visible, so nothing here filters by client.
 */
export async function ownerInsights(
  tx: Tx,
  input: { range: Range; locationId?: string | undefined; now: Date },
): Promise<OwnerInsights> {
  const { range, now } = input;
  const days = RANGE_DAYS[range];
  const labels = (await listLocationLabels(tx)).filter(
    (l) => input.locationId === undefined || l.id === input.locationId,
  );
  const ids = labels.map((l) => l.id);
  const zones = labels.map((l) => ({ id: l.id, timeZone: l.timeZone }));
  const zoneOf = new Map(zones.map((z) => [z.id, z.timeZone]));
  const windows = new Map<string, { current: Set<string>; previous: Set<string> }>();
  for (const z of zones) {
    const w = windowDates(now, z.timeZone, days);
    windows.set(z.id, { current: new Set(w.current), previous: new Set(w.previous) });
  }
  const windowOf = (locationId: string, at: Date | null): "cur" | "prev" | null => {
    if (!at) return null;
    const w = windows.get(locationId);
    if (!w) return null;
    const date = localDate(at, zoneOf.get(locationId) ?? "UTC");
    return w.current.has(date) ? "cur" : w.previous.has(date) ? "prev" : null;
  };

  let answers: (AnswerRow & { id: string })[] = [];
  let cases: { locationId: string; status: string; openedAt: Date; dueAt: Date }[] = [];
  let sentRequests: { locationId: string; sentAt: Date | null; invitationId: string | null }[] = [];
  if (ids.length > 0) {
    const cutoff = new Date(now.getTime() - (2 * days + 2) * DAY_MS);
    answers = await tx
      .select({
        id: surveyResponses.id,
        locationId: surveyResponses.locationId,
        createdAt: surveyResponses.createdAt,
        rating: surveyResponses.rating,
        sentiment: surveyResponses.sentiment,
        topics: surveyResponses.topics,
        readAt: surveyResponses.readAt,
        reviewClickedAt: surveyResponses.reviewClickedAt,
        invitationId: surveyResponses.invitationId,
      })
      .from(surveyResponses)
      .where(
        and(
          inArray(surveyResponses.locationId, ids),
          or(gte(surveyResponses.createdAt, cutoff), gte(surveyResponses.readAt, cutoff)),
        ),
      );
    cases = await tx
      .select({
        locationId: recoveryCases.locationId,
        status: recoveryCases.status,
        openedAt: recoveryCases.openedAt,
        dueAt: recoveryCases.dueAt,
      })
      .from(recoveryCases)
      .where(
        and(
          inArray(recoveryCases.locationId, ids),
          or(gte(recoveryCases.openedAt, cutoff), eq(recoveryCases.status, "open")),
        ),
      );
    sentRequests = await tx
      .select({
        locationId: reviewRequests.locationId,
        sentAt: reviewRequests.sentAt,
        invitationId: reviewRequests.invitationId,
      })
      .from(reviewRequests)
      .where(
        and(
          inArray(reviewRequests.locationId, ids),
          eq(reviewRequests.status, "sent"),
          gte(reviewRequests.sentAt, cutoff),
        ),
      );
  }

  const cur = answers.filter((a) => windowOf(a.locationId, a.createdAt) === "cur");
  const prev = answers.filter((a) => windowOf(a.locationId, a.createdAt) === "prev");
  const series = dailySeries(answers, zones, now, days);

  const rating = compareMean(
    cur.map((a) => a.rating),
    prev.map((a) => a.rating),
  );
  const responses = compareCount(cur.length, prev.length);

  const sentCur = sentRequests.filter((r) => windowOf(r.locationId, r.sentAt) === "cur");
  const answeredInvitations = new Set(
    answers.map((a) => a.invitationId).filter((v): v is string => v !== null),
  );
  const answered = sentCur.filter(
    (r) => r.invitationId !== null && answeredInvitations.has(r.invitationId),
  ).length;

  const clickCount = cur.filter((a) => a.reviewClickedAt).length;
  const clicks = compareRate(
    { num: clickCount, den: cur.length },
    { num: prev.filter((a) => a.reviewClickedAt).length, den: prev.length },
  );

  const openCases = cases.filter((c) => c.status === "open");
  const overdue = (c: { dueAt: Date }) => c.dueAt.getTime() < now.getTime();

  const places = labels
    .map((l) => {
      const mine = compareMean(
        cur.filter((a) => a.locationId === l.id).map((a) => a.rating),
        prev.filter((a) => a.locationId === l.id).map((a) => a.rating),
      );
      const open = openCases.filter((c) => c.locationId === l.id);
      return {
        locationId: l.id,
        name: l.locationName,
        rating: mine.small ? null : mine.value,
        change: mine.change,
        responses: mine.n,
        openCases: open.length,
        overdueCases: open.filter(overdue).length,
      };
    })
    .sort(
      (a, b) =>
        b.overdueCases - a.overdueCases ||
        (a.rating ?? Number.POSITIVE_INFINITY) - (b.rating ?? Number.POSITIVE_INFINITY) ||
        a.name.localeCompare(b.name),
    );

  const spark = (values: (number | null)[]) => values.filter((v): v is number => v !== null);
  return {
    range,
    generatedAt: now.toISOString(),
    window: { from: series[0]?.date ?? "", to: series[series.length - 1]?.date ?? "" },
    // value is kept when small (the UI shows "Too few answers" from `small`); places[].rating is nulled when small.
    rating: {
      value: rating.value,
      change: rating.change,
      n: rating.n,
      small: rating.small,
      spark: spark(series.map((s) => s.average)),
    },
    responses: {
      value: responses.value,
      change: responses.change,
      n: responses.n,
      small: responses.small,
      spark: series.map((s) => s.count),
      answerRate: sentCur.length > 0 ? answered / sentCur.length : null,
      sent: sentCur.length,
    },
    reviewClicks: {
      clicks: clickCount,
      answers: cur.length,
      rate: clicks.value,
      change: clicks.change,
      small: clicks.small,
    },
    waiting: { open: openCases.length, overdue: openCases.filter(overdue).length },
    series,
    topics: splitByTopic(cur, TOPIC_LIMIT),
    read: cur.filter((a) => a.sentiment !== null).length,
    places,
    host: {
      requestsSent: sentCur.length,
      casesOpened: cases.filter((c) => windowOf(c.locationId, c.openedAt) === "cur").length,
      answersRead: answers.filter((a) => windowOf(a.locationId, a.readAt) === "cur").length,
    },
  };
}
