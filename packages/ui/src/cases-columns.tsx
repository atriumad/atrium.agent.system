"use client";

import type { CaseTableRow } from "./api";
import { SeverityPill, Stars, TopicChips, When } from "./data/cells";
import type { Column } from "./data/data-table";
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
      width: "6.5rem",
      header: "Severity",
      nowrap: true,
      cell: (r) => <SeverityPill severity={r.severity} />,
      sortValue: (r) => SEVERITY_RANK[r.severity],
    },
    {
      key: "rating",
      width: "6rem",
      header: "Rating",
      nowrap: true,
      cell: (r) => <Stars rating={r.rating} />,
      sortValue: (r) => r.rating,
    },
    {
      key: "place",
      colClassName: "w-[14%] 2xl:w-[22%]",
      header: "Place",
      truncate: true,
      cell: (r) => (showClient ? `${r.clientName} · ${r.locationName}` : r.locationName),
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
      colClassName: "w-[10%] 2xl:w-[13%]",
      header: "Topics",
      nowrap: true,
      cell: (r) => <TopicChips topics={r.topics} />,
    },
    {
      key: "due",
      colClassName: "w-[11rem] 2xl:w-[13rem]",
      header: "Due",
      truncate: true,
      titleOf: (r) => dueLabel(r.status, r.dueAt, now)?.text ?? "",
      cell: (r) => {
        const due = dueLabel(r.status, r.dueAt, now);
        if (!due) return <span className="text-fg-muted">—</span>;
        return due.tone === "overdue" ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <StatusBadge status="danger" className="shrink-0">
              Overdue
            </StatusBadge>
            <span className="min-w-0 truncate text-xs text-fg-muted">
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
      width: "7rem",
      header: "Opened",
      nowrap: true,
      cell: (r) => <When date={r.openedAt} now={now} />,
      sortValue: (r) => new Date(r.openedAt).getTime(),
    },
    {
      key: "status",
      colClassName: "w-[9rem] 2xl:w-[10rem]",
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
