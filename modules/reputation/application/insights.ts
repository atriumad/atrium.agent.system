import { listLocationLabels, type Tx } from "@atrium/core";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import {
  type AnswerRow,
  compareCount,
  compareMean,
  compareRate,
  dailySeries,
  localDate,
  MIN_SAMPLE,
  median,
  RANGE_DAYS,
  type Range,
  splitByTopic,
  weightedMean,
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

type InsightCase = {
  id: string;
  locationId: string;
  responseId: string;
  severity: string;
  status: string;
  openedAt: Date;
  dueAt: Date;
  contactedAt: Date | null;
  resolvedAt: Date | null;
};

/**
 * The bounded selects both Overviews read (answers, cases, sent requests of the given places) and
 * the window classifier in each place's own time zone. Row-level security decides what is visible.
 */
async function loadInsightData(
  tx: Tx,
  labels: { id: string; timeZone: string }[],
  days: number,
  now: Date,
) {
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
  let cases: InsightCase[] = [];
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
        id: recoveryCases.id,
        locationId: recoveryCases.locationId,
        responseId: recoveryCases.responseId,
        severity: recoveryCases.severity,
        status: recoveryCases.status,
        openedAt: recoveryCases.openedAt,
        dueAt: recoveryCases.dueAt,
        contactedAt: recoveryCases.contactedAt,
        resolvedAt: recoveryCases.resolvedAt,
      })
      .from(recoveryCases)
      .where(
        and(
          inArray(recoveryCases.locationId, ids),
          or(
            gte(recoveryCases.openedAt, cutoff),
            eq(recoveryCases.status, "open"),
            gte(recoveryCases.contactedAt, cutoff),
            gte(recoveryCases.resolvedAt, cutoff),
          ),
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
  return { zones, windowOf, answers, cases, sentRequests };
}

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
  const { zones, windowOf, answers, cases, sentRequests } = await loadInsightData(
    tx,
    labels,
    days,
    now,
  );

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

export type AgencyInsights = {
  range: Range;
  generatedAt: string;
  window: { from: string; to: string };
  contact: {
    medianHours: number | null;
    insideTarget: number | null;
    cases: number;
    change: number | null;
    small: boolean;
  };
  overdue: { value: number; previous: number };
  portfolio: Tile;
  answerRate: {
    value: number | null;
    change: number | null;
    sent: number;
    answered: number;
    small: boolean;
  };
  clients: {
    clientId: string;
    name: string;
    places: number;
    rating: number | null;
    change: number | null;
    spark: number[];
    responses: number;
    answerRate: number | null;
    overdue: number;
    pendingPlaces: number;
  }[];
  cases: {
    id: string;
    clientId: string;
    clientName: string;
    locationName: string;
    severity: string;
    summary: string;
    dueAt: string;
    overdue: boolean;
  }[];
};

const CASE_LIMIT = 50;
const SUMMARY_LENGTH = 120;
const HOUR_MS = 3_600_000;

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * The agency's Overview numbers through an agency-level transaction. Row-level security decides
 * which places are visible; only the optional `clientId` narrows the place list, and the rest follows.
 */
export async function agencyInsights(
  tx: Tx,
  input: { range: Range; clientId?: string | undefined; now: Date },
): Promise<AgencyInsights> {
  const { range, now } = input;
  const days = RANGE_DAYS[range];
  const labels = (await listLocationLabels(tx)).filter(
    (l) => input.clientId === undefined || l.clientId === input.clientId,
  );
  const labelOf = new Map(labels.map((l) => [l.id, l]));
  const { zones, windowOf, answers, cases, sentRequests } = await loadInsightData(
    tx,
    labels,
    days,
    now,
  );
  const clientOf = (locationId: string) => labelOf.get(locationId)?.clientId ?? "";
  const nowMs = now.getTime();

  const cur = answers.filter((a) => windowOf(a.locationId, a.createdAt) === "cur");
  const prev = answers.filter((a) => windowOf(a.locationId, a.createdAt) === "prev");
  const series = dailySeries(answers, zones, now, days);

  // Portfolio: the mean over every answer (weighted by answers), never a mean of client means.
  const part = (rows: { rating: number }[]) => ({
    sum: sum(rows.map((r) => r.rating)),
    n: rows.length,
  });
  const clientIds = [...new Set(labels.map((l) => l.clientId))];
  const curParts = clientIds.map((id) => part(cur.filter((a) => clientOf(a.locationId) === id)));
  const prevParts = clientIds.map((id) => part(prev.filter((a) => clientOf(a.locationId) === id)));
  const portfolioValue = weightedMean(curParts);
  const portfolioPrev = weightedMean(prevParts);
  const portfolioN = cur.length;
  const portfolioSmall = portfolioN < MIN_SAMPLE;
  const portfolio: Tile = {
    value: portfolioValue,
    change:
      portfolioValue === null ||
      portfolioPrev === null ||
      portfolioSmall ||
      prev.length < MIN_SAMPLE
        ? null
        : portfolioValue - portfolioPrev,
    n: portfolioN,
    small: portfolioSmall,
    spark: series.map((s) => s.average).filter((v): v is number => v !== null),
  };

  // Time to contact: cases opened in the window.
  const opened = (w: "cur" | "prev") =>
    cases.filter((c) => windowOf(c.locationId, c.openedAt) === w);
  const hoursOf = (rows: typeof cases) =>
    rows
      .filter((c) => c.contactedAt !== null)
      .map((c) => ((c.contactedAt as Date).getTime() - c.openedAt.getTime()) / HOUR_MS);
  const openedCur = opened("cur");
  const openedPrev = opened("prev");
  const medianCur = median(hoursOf(openedCur));
  const medianPrev = median(hoursOf(openedPrev));
  const contactSmall = openedCur.length < MIN_SAMPLE;
  const inside = openedCur.filter(
    (c) => c.contactedAt !== null && c.contactedAt.getTime() <= c.dueAt.getTime(),
  ).length;
  const outside = openedCur.filter((c) =>
    c.contactedAt !== null
      ? c.contactedAt.getTime() > c.dueAt.getTime()
      : c.dueAt.getTime() < nowMs,
  ).length;
  const judged = inside + outside;

  // Overdue now, and as it stood one window ago. There is no status history, so "was open at the
  // cutoff" is read from the timestamps: not yet contacted and not yet resolved at that instant.
  const openCases = cases.filter((c) => c.status === "open");
  const isOverdue = (c: { dueAt: Date }) => c.dueAt.getTime() < nowMs;
  const then = nowMs - days * DAY_MS;
  const overduePrevious = cases.filter(
    (c) =>
      c.openedAt.getTime() <= then &&
      c.dueAt.getTime() < then &&
      (c.contactedAt === null || c.contactedAt.getTime() > then) &&
      (c.resolvedAt === null || c.resolvedAt.getTime() > then),
  ).length;

  // Answer rate: answers that used the invitation of a request sent in the window.
  const answeredInvitations = new Set(
    answers.map((a) => a.invitationId).filter((v): v is string => v !== null),
  );
  const answeredOf = (rows: typeof sentRequests) =>
    rows.filter((r) => r.invitationId !== null && answeredInvitations.has(r.invitationId)).length;
  const sentCur = sentRequests.filter((r) => windowOf(r.locationId, r.sentAt) === "cur");
  const sentPrev = sentRequests.filter((r) => windowOf(r.locationId, r.sentAt) === "prev");
  const rate = compareRate(
    { num: answeredOf(sentCur), den: sentCur.length },
    { num: answeredOf(sentPrev), den: sentPrev.length },
  );

  const clients = clientIds
    .map((id) => {
      const mineLabels = labels.filter((l) => l.clientId === id);
      const inClient = (locationId: string) => clientOf(locationId) === id;
      const curRows = cur.filter((a) => inClient(a.locationId));
      const mean = compareMean(
        curRows.map((a) => a.rating),
        prev.filter((a) => inClient(a.locationId)).map((a) => a.rating),
      );
      const own = dailySeries(
        answers.filter((a) => inClient(a.locationId)),
        zones.filter((z) => inClient(z.id)),
        now,
        days,
      );
      const sent = sentCur.filter((r) => inClient(r.locationId));
      return {
        clientId: id,
        name: mineLabels[0]?.clientName ?? "",
        places: mineLabels.length,
        rating: mean.small ? null : mean.value,
        change: mean.change,
        spark: mean.small ? [] : own.map((s) => s.average).filter((v): v is number => v !== null),
        responses: mean.n,
        answerRate: sent.length > 0 ? answeredOf(sent) / sent.length : null,
        overdue: openCases.filter((c) => inClient(c.locationId) && isOverdue(c)).length,
        pendingPlaces: mineLabels.filter((l) => l.status === "pending").length,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));

  // Cases that need a person: open and overdue, or due within the next 24 hours.
  const needing = openCases
    .filter((c) => isOverdue(c) || c.dueAt.getTime() <= nowMs + 24 * HOUR_MS)
    .sort(
      (a, b) =>
        Number(isOverdue(b)) - Number(isOverdue(a)) || a.dueAt.getTime() - b.dueAt.getTime(),
    )
    .slice(0, CASE_LIMIT);
  const answerOf = new Map<string, { comment: string | null; rating: number }>();
  if (needing.length > 0) {
    const rows = await tx
      .select({
        id: surveyResponses.id,
        comment: surveyResponses.comment,
        rating: surveyResponses.rating,
      })
      .from(surveyResponses)
      .where(
        inArray(
          surveyResponses.id,
          needing.map((c) => c.responseId),
        ),
      );
    for (const r of rows) answerOf.set(r.id, r);
  }

  return {
    range,
    generatedAt: now.toISOString(),
    window: { from: series[0]?.date ?? "", to: series[series.length - 1]?.date ?? "" },
    contact: {
      medianHours: medianCur,
      insideTarget: judged > 0 ? inside / judged : null,
      cases: openedCur.length,
      change:
        medianCur === null || medianPrev === null || contactSmall || openedPrev.length < MIN_SAMPLE
          ? null
          : medianCur - medianPrev,
      small: contactSmall,
    },
    overdue: { value: openCases.filter(isOverdue).length, previous: overduePrevious },
    portfolio,
    answerRate: {
      value: rate.value,
      change: rate.change,
      sent: sentCur.length,
      answered: answeredOf(sentCur),
      small: rate.small,
    },
    clients,
    cases: needing.map((c) => {
      const label = labelOf.get(c.locationId);
      const a = answerOf.get(c.responseId);
      const comment = a?.comment?.trim();
      return {
        id: c.id,
        clientId: label?.clientId ?? "",
        clientName: label?.clientName ?? "",
        locationName: label?.locationName ?? "",
        severity: c.severity,
        summary: comment
          ? comment.slice(0, SUMMARY_LENGTH)
          : a
            ? `${a.rating}-star answer`
            : "Answer unavailable",
        dueAt: c.dueAt.toISOString(),
        overdue: isOverdue(c),
      };
    }),
  };
}
