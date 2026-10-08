"use client";

import { type ReactNode, useEffect, useState } from "react";
import { api, type CaseSummary } from "../api";
import { type Surface } from "../cases-app";
import { Skeleton } from "../data/misc";
import { dueLabel } from "../format";
import { PageHeader } from "../layout/layout";
import { useMe } from "./me-context";

function Stat({ href, value, label }: { href: string; value: number | null; label: string }) {
  return (
    <a
      href={href}
      className="flex flex-col gap-1 rounded-md border border-line bg-surface-card p-5 no-underline transition-colors hover:border-charcoal-400"
    >
      <span className="text-4xl leading-none">{value === null ? "–" : value}</span>
      <span className="text-sm text-fg-muted">{label}</span>
    </a>
  );
}

const WEEK = 7 * 24 * 3_600_000;

/**
 * Where a person lands. Each number is the length of a list they can open, so it always matches
 * the page it links to. Phase 2 grows this with trends and what Host did.
 */
export function OverviewPage({ surface }: { surface: Surface }) {
  const me = useMe();
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [answers, setAnswers] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<number | null>(null);
  const [places, setPlaces] = useState<number | null>(null);

  useEffect(() => {
    api
      .cases()
      .then(setCases)
      .catch(() => setCases([]));
    if (surface === "platform" && me.canReadSurveys) {
      api
        .surveyResponses()
        .then((rows) =>
          setAnswers(
            rows.filter((r) => Date.now() - new Date(r.createdAt).getTime() < WEEK).length,
          ),
        )
        .catch(() => setAnswers(0));
    }
    if (surface === "manager" && me.canManageLocations) {
      api
        .onboardingRequests()
        .then((rows) => setAccounts(rows.filter((r) => r.status === "open").length))
        .catch(() => setAccounts(0));
      api
        .places()
        .then((rows) => setPlaces(rows.filter((p) => p.status === "pending").length))
        .catch(() => setPlaces(0));
    }
  }, [surface, me.canReadSurveys, me.canManageLocations]);

  const now = new Date();
  const open = cases?.filter((c) => c.status !== "resolved") ?? null;
  const late = cases
    ? cases.filter((c) => dueLabel(c.status, c.dueAt, now)?.tone === "overdue").length
    : null;
  const casesHref = surface === "manager" ? "/reputation/cases" : "/reputation/feedback";

  const cards: ReactNode[] =
    surface === "manager"
      ? [
          <Stat key="late" href={casesHref} value={late} label="Cases past the 24-hour target" />,
          <Stat key="open" href={casesHref} value={open ? open.length : null} label="Open cases" />,
          ...(me.canManageLocations
            ? [
                <Stat
                  key="acc"
                  href="/approvals/accounts"
                  value={accounts}
                  label="Accounts waiting"
                />,
                <Stat key="pl" href="/approvals/places" value={places} label="Places waiting" />,
              ]
            : []),
        ]
      : [
          <Stat key="open" href={casesHref} value={open ? open.length : null} label="Open cases" />,
          <Stat key="late" href={casesHref} value={late} label="Past the 24-hour target" />,
          ...(me.canReadSurveys
            ? [
                <Stat
                  key="ans"
                  href="/reputation/responses"
                  value={answers}
                  label="Answers this week"
                />,
              ]
            : []),
        ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={surface === "manager" ? "Portfolio" : "Your business"}
        title="Overview"
        description={
          surface === "manager"
            ? "What needs a person across your clients."
            : "What needs your attention today."
        }
      />
      {cases === null ? <Skeleton className="h-24 w-full" /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards}</div>
    </div>
  );
}
