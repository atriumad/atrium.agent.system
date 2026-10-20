"use client";

import type { LoyaltyActivityRow } from "../api";
import { When } from "../data/cells";
import type { Column } from "../data/data-table";

const KIND_LABEL: Record<string, string> = {
  stamp: "Stamp",
  reward_earned: "Reward earned",
  reward_redeemed: "Reward redeemed",
  void: "Void",
};

const dash = <span className="text-fg-muted">—</span>;

/** The columns of the loyalty activity table. None sorts: the server orders by date, newest first. */
export function loyaltyColumns({ now }: { now: Date }): Column<LoyaltyActivityRow>[] {
  return [
    {
      key: "when",
      width: "8rem",
      header: "When",
      nowrap: true,
      cell: (r) => <When date={r.at} now={now} />,
    },
    {
      key: "place",
      width: "18%",
      header: "Place",
      truncate: true,
      titleOf: (r) => r.locationName,
      cell: (r) => r.locationName,
    },
    {
      key: "card",
      width: "7.5rem",
      header: "Card",
      nowrap: true,
      cell: (r) => <span className="tabular-nums">{r.cardShortCode}</span>,
    },
    {
      key: "what",
      width: "9.5rem",
      header: "What",
      nowrap: true,
      cell: (r) => KIND_LABEL[r.kind] ?? r.kind,
    },
    {
      key: "by",
      width: "12%",
      header: "By",
      truncate: true,
      titleOf: (r) => r.actorName ?? "System",
      cell: (r) => r.actorName ?? "System",
    },
    {
      key: "note",
      header: "Note",
      truncate: true,
      titleOf: (r) => (r.kind === "void" ? (r.note ?? "") : ""),
      cell: (r) => (r.kind === "void" && r.note ? r.note : dash),
    },
  ];
}
