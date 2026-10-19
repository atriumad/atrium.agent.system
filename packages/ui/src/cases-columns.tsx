"use client";

import type { CaseTableRow } from "./api";
import { PlaceCell, placeTitle, SeverityPill, Stars, TopicChips, When } from "./data/cells";
import {
  DUE_COL,
  OPENED_COL,
  PLACE_COL,
  RATING_COL,
  SEVERITY_COL,
  STATUS_COL,
  TOPICS_COL,
} from "./data/column-widths";
import type { Column } from "./data/data-table";
import { humaniseTopic } from "./data/split-bars";
import { StatusBadge } from "./feedback/badge";
import { dueLabel, STATUS_LABEL } from "./format";

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** The columns of the Cases table. */
export function casesColumns({
  showClient,
  now,
}: {
  showClient: boolean;
  now: Date;
}): Column<CaseTableRow>[] {
  return [
    {
      key: "severity",
      colClassName: SEVERITY_COL,
      header: "Severity",
      nowrap: true,
      // The row link is this cell, so its name says more than the severity word.
      cell: (r) => (
        <>
          <SeverityPill severity={r.severity} />
          <span className="sr-only">
            , case at {r.locationName}, opened{" "}
            {new Date(r.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </>
      ),
      sortValue: (r) => SEVERITY_RANK[r.severity],
    },
    {
      key: "rating",
      colClassName: RATING_COL,
      header: "Rating",
      nowrap: true,
      cell: (r) => <Stars rating={r.rating} />,
      sortValue: (r) => r.rating,
    },
    {
      key: "place",
      colClassName: PLACE_COL,
      header: "Place",
      truncate: true,
      titleOf: (r) => (showClient ? placeTitle(r.locationName, r.clientName) : r.locationName),
      cell: (r) =>
        showClient ? <PlaceCell place={r.locationName} client={r.clientName} /> : r.locationName,
      sortValue: (r) => r.locationName,
    },
    {
      key: "comment",
      header: "What the guest said",
      truncate: true,
      titleOf: (r) => r.comment ?? "",
      cell: (r) => r.comment ?? <span className="text-fg-muted">—</span>,
    },
    {
      key: "topics",
      colClassName: TOPICS_COL,
      hideBelow: "2xl",
      header: "Topics",
      truncate: true,
      titleOf: (r) => (r.topics ?? []).map(humaniseTopic).join(", "),
      cell: (r) => <TopicChips topics={r.topics} />,
    },
    {
      key: "due",
      colClassName: DUE_COL,
      header: "Due",
      truncate: true,
      titleOf: (r) => dueLabel(r.status, r.dueAt, now)?.text ?? "",
      cell: (r) => {
        const due = dueLabel(r.status, r.dueAt, now);
        if (!due) return <span className="text-fg-muted">—</span>;
        return due.tone === "overdue" ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <StatusBadge status="danger" className="max-w-full shrink-0">
              Overdue
            </StatusBadge>
            <span className="min-w-0 truncate text-xs text-fg-muted max-xl:hidden">
              {due.text.replace("Overdue ", "")}
            </span>
          </span>
        ) : (
          due.text
        );
      },
      sortValue: (r) =>
        r.status === "open" ? new Date(r.dueAt).getTime() : Number.MAX_SAFE_INTEGER,
    },
    {
      key: "opened",
      colClassName: OPENED_COL,
      hideBelow: "xl",
      header: "Opened",
      nowrap: true,
      cell: (r) => <When date={r.openedAt} now={now} />,
      sortValue: (r) => new Date(r.openedAt).getTime(),
    },
    {
      key: "status",
      colClassName: STATUS_COL,
      header: "Status",
      nowrap: true,
      cell: (r) => (
        <StatusBadge
          className="max-w-full"
          status={
            r.status === "resolved" ? "positive" : r.status === "open" ? "warning" : "neutral"
          }
        >
          {STATUS_LABEL[r.status] ?? r.status}
        </StatusBadge>
      ),
      sortValue: (r) => r.status,
    },
  ];
}
