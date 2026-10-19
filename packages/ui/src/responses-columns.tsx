"use client";

import { Check } from "lucide-react";
import type { ResponseTableRow } from "./api";
import { caseHref } from "./case-links";
import type { Surface } from "./cases-app";
import { SentimentPill, Stars, TopicChips, When } from "./data/cells";
import type { Column } from "./data/data-table";

const dash = <span className="text-fg-muted">—</span>;

/** The columns of the Responses table. Only date, rating, place and sentiment sort, on the server. */
export function responsesColumns({
  surface,
  showClient,
  now,
  backSearch,
}: {
  surface: Surface;
  showClient: boolean;
  now: Date;
  backSearch: string | undefined;
}): Column<ResponseTableRow>[] {
  return [
    {
      key: "date",
      width: "7rem",
      header: "Date",
      nowrap: true,
      cell: (r) => <When date={r.createdAt} now={now} />,
      sortValue: (r) => r.createdAt,
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
      header: "Comment",
      truncate: true,
      titleOf: (r) => r.comment ?? "",
      cell: (r) => r.comment ?? <span className="text-fg-muted">No comment</span>,
    },
    {
      key: "sentiment",
      width: "8rem",
      header: "Sentiment",
      nowrap: true,
      cell: (r) => <SentimentPill sentiment={r.sentiment} />,
      sortValue: (r) => r.sentiment ?? "",
    },
    {
      key: "topics",
      colClassName: "w-[10%] 2xl:w-[13%]",
      header: "Topics",
      nowrap: true,
      cell: (r) => <TopicChips topics={r.topics} />,
    },
    {
      key: "contact",
      width: "5.25rem",
      header: "Contact",
      nowrap: true,
      cell: (r) => (r.wantsContact ? "Yes" : dash),
    },
    {
      key: "review",
      width: "5rem",
      header: "Review",
      nowrap: true,
      cell: (r) =>
        r.reviewClicked ? (
          <span role="img" aria-label="Went to the review link" className="inline-flex">
            <Check size={14} strokeWidth={1.5} aria-hidden="true" />
          </span>
        ) : (
          dash
        ),
    },
    {
      key: "case",
      width: "6.5rem",
      header: "Case",
      nowrap: true,
      cell: (r) =>
        r.caseId ? (
          <a
            href={caseHref(surface, r.caseId, backSearch)}
            className="relative z-10 font-medium text-fg-strong underline-offset-2 hover:underline"
          >
            View case
          </a>
        ) : (
          dash
        ),
    },
  ];
}
