import type { Tx } from "@atrium/core";
import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { RANGE_DAYS, type Range } from "../domain/insights";
import type { CaseStatus } from "../domain/recovery";
import { type CaseTab, caseCounts } from "../domain/tables";
import { recoveryCases } from "../infra/schema";
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
  input: { range: Range; now: Date; status?: CaseStatus },
): Promise<CasesTable> {
  const from = new Date(input.now.getTime() - RANGE_DAYS[input.range] * DAY_MS);
  const inWindow = and(
    lte(recoveryCases.openedAt, input.now),
    or(gte(recoveryCases.openedAt, from), inArray(recoveryCases.status, ["open", "contacted"])),
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
