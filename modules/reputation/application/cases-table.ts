import { listLocationLabels, type Tx } from "@atrium/core";
import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { compareCount, MIN_SAMPLE, RANGE_DAYS, type Range } from "../domain/insights";
import type { CaseStatus } from "../domain/recovery";
import { type CaseTab, caseCounts, dailyCounts, severitySplit } from "../domain/tables";
import { recoveryCases } from "../infra/schema";
import { contactFigures, loadInsightData } from "./insights";
import { type CaseSummary, selectCaseRows } from "./recovery";

const PAGE = 200;
const COMMENT_CHARS = 160;
const DAY_MS = 86_400_000;

export type CaseTableRow = CaseSummary & {
  /** The first 160 characters of the guest's comment, a hard cut. Third-party text. */
  comment: string | null;
  topics: string[] | null;
  sentiment: string | null;
  safety: boolean | null;
};

export type CasesTable = {
  cases: CaseTableRow[];
  counts: Record<CaseTab, number>;
  truncated: boolean;
};

/**
 * The cases in the window: opened in it (and not after `now`), or still open or contacted whenever
 * they were opened (the same rule as `caseInWindow`). RLS, through the passed Tx, picks the clients.
 */
export async function listCasesTable(
  tx: Tx,
  input: { range: Range; now: Date; status?: CaseStatus; locationId?: string | undefined },
): Promise<CasesTable> {
  const from = new Date(input.now.getTime() - RANGE_DAYS[input.range] * DAY_MS);
  // One where-clause for the rows and the counts. A place narrows both, in SQL, so the 200-row
  // cap and `truncated` are per place too. A place outside the caller's scope finds nothing (RLS).
  const inWindow = and(
    lte(recoveryCases.openedAt, input.now),
    or(gte(recoveryCases.openedAt, from), inArray(recoveryCases.status, ["open", "contacted"])),
    input.locationId ? eq(recoveryCases.locationId, input.locationId) : undefined,
  );

  // Counts come from every case in the window, not from the rows loaded below.
  const light = await tx
    .select({ status: recoveryCases.status, openedAt: recoveryCases.openedAt })
    .from(recoveryCases)
    .where(inWindow);
  const counts = caseCounts(light, from);

  // The status narrows the rows (and `truncated`) only; the counts above stay over the window.
  const rowFilter = input.status ? and(inWindow, eq(recoveryCases.status, input.status)) : inWindow;
  const found = await selectCaseRows(tx, rowFilter, PAGE + 1);
  const cases = found.slice(0, PAGE).map(({ summary, response: r }) => {
    // One definition of "read": the answer has a reading when `readAt` is set, which is when the
    // writer stores sentiment, topics and safety together. Otherwise all three are null.
    const read = r.readAt !== null;
    return {
      ...summary,
      comment: r.comment === null ? null : [...r.comment].slice(0, COMMENT_CHARS).join(""),
      topics: read ? r.topics : null,
      sentiment: read ? r.sentiment : null,
      safety: read ? r.safety : null,
    };
  });
  return { cases, counts, truncated: found.length > PAGE };
}

export type CasesBand = {
  range: Range;
  generatedAt: string;
  window: { from: string; to: string };
  open: number;
  overdue: { value: number; previous: number };
  contact: {
    medianHours: number | null;
    insideTarget: number | null;
    cases: number;
    change: number | null;
    small: boolean;
  };
  resolved: { value: number; change: number | null; small: boolean };
  openedPerDay: { date: string; count: number }[];
  bySeverity: { high: number; medium: number; low: number };
};

/**
 * The figures above the Cases table. `open` is the Active tab's count (open plus contacted cases,
 * "now", not windowed) and `overdue.value` its overdue subset (open, past due); both use the same
 * rows as `listCasesTable`'s counts. The rest follows the Overview's definitions over the window.
 */
export async function casesBand(
  tx: Tx,
  input: { range: Range; locationId?: string | undefined; now: Date },
): Promise<CasesBand> {
  const { range, now } = input;
  const days = RANGE_DAYS[range];
  const nowMs = now.getTime();
  const labels = (await listLocationLabels(tx)).filter(
    (l) => input.locationId === undefined || l.id === input.locationId,
  );
  const ids = labels.map((l) => l.id);
  const { zones, windowOf, cases: loaded } = await loadInsightData(tx, labels, days, now);
  // Nothing opened after now; the Overview's select is bounded by age, not by `now`.
  const cases = loaded.filter((c) => c.openedAt.getTime() <= nowMs);

  // Active cases whenever they were opened (the loaded set only keeps recent contacted ones).
  const active =
    ids.length === 0
      ? []
      : await tx
          .select({ status: recoveryCases.status, dueAt: recoveryCases.dueAt })
          .from(recoveryCases)
          .where(
            and(
              inArray(recoveryCases.locationId, ids),
              lte(recoveryCases.openedAt, now),
              inArray(recoveryCases.status, ["open", "contacted"]),
            ),
          );
  const overdueNow = active.filter((c) => c.status === "open" && c.dueAt.getTime() < nowMs).length;

  const { openedCur, openedPrev, medianCur, medianPrev, contactSmall, inside, judged } =
    contactFigures(cases, windowOf, nowMs);

  // Overdue as it stood one window ago: no status history, so read it from the timestamps.
  const then = nowMs - days * DAY_MS;
  const overduePrevious = cases.filter(
    (c) =>
      c.openedAt.getTime() <= then &&
      c.dueAt.getTime() < then &&
      (c.contactedAt === null || c.contactedAt.getTime() > then) &&
      (c.resolvedAt === null || c.resolvedAt.getTime() > then),
  ).length;

  const resolvedAt = (w: "cur" | "prev") =>
    cases.filter(
      (c) =>
        c.status === "resolved" &&
        c.resolvedAt !== null &&
        c.resolvedAt.getTime() <= nowMs &&
        windowOf(c.locationId, c.resolvedAt) === w,
    ).length;
  const resolved = compareCount(resolvedAt("cur"), resolvedAt("prev"));

  const perDay = dailyCounts(
    cases.map((c) => ({ locationId: c.locationId, at: c.openedAt })),
    zones,
    now,
    days,
  );

  return {
    range,
    generatedAt: now.toISOString(),
    window: { from: perDay[0]?.date ?? "", to: perDay[perDay.length - 1]?.date ?? "" },
    open: active.length,
    overdue: { value: overdueNow, previous: overduePrevious },
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
    resolved: { value: resolved.value ?? 0, change: resolved.change, small: resolved.small },
    openedPerDay: perDay,
    bySeverity: severitySplit(openedCur.map((c) => c.severity)),
  };
}
