"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../actions/button";
import { api, type OwnerInsights, type RangeKey } from "../api";
import { DataTable } from "../data/data-table";
import { Delta } from "../data/delta";
import { type KpiState, KpiTile } from "../data/kpi-tile";
import { Skeleton } from "../data/misc";
import { PageControls, UpdatedStamp } from "../data/page-controls";
import { SplitBars } from "../data/split-bars";
import { TrendChart } from "../data/trend-chart";
import { useRangeState } from "../data/use-range-state";
import { PageHeader } from "../layout/layout";

type Option = { value: string; label: string };

const DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

const pct = (v: number) => Math.round(v * 100);
const state = (small: boolean, n: number): KpiState => (small ? { tooFew: n } : "ok");

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-card border border-frame bg-surface-card p-5">
      <h2 className="m-0 font-serif text-xl font-normal text-fg-strong">{title}</h2>
      {children}
    </section>
  );
}

/** How the business is doing and what needs its owner: four figures with their change, a trend, topics, places, and what Host did. */
export function OwnerOverview() {
  const { range, scopeId, setRange, setScopeId } = useRangeState({ scope: "place" });
  const [data, setData] = useState<OwnerInsights | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    api
      .places()
      .then((rows) => {
        const seen = new Map<string, string>();
        for (const p of rows) if (!seen.has(p.id)) seen.set(p.id, p.name);
        setOptions([...seen].map(([value, label]) => ({ value, label })));
      })
      .catch(() => setOptions([]));
  }, []);

  // `tries` re-runs the load when the person presses Retry.
  useEffect(() => {
    let current = true;
    setFailed(false);
    setData(null);
    api
      .insightsOwner(range, scopeId ?? undefined)
      .then((d) => {
        if (current) setData(d);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [range, scopeId, tries]);

  const retry = useCallback(() => setTries((t) => t + 1), []);

  const query = `range=${range}${scopeId ? `&place=${encodeURIComponent(scopeId)}` : ""}`;
  const answers = `/reputation/responses?${query}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        compact
        title="Overview"
        description="How your business is doing and what needs you."
      />
      <PageControls
        range={range}
        onRange={setRange}
        options={options}
        value={scopeId}
        onValue={setScopeId}
        allLabel="All places"
        scopeLabel="Place"
      />
      {failed ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-card border border-frame bg-surface-card p-5"
        >
          <p className="m-0 text-fg-strong">Could not load the overview</p>
          <Button onClick={retry}>Retry</Button>
        </div>
      ) : data === null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              label="Average rating"
              value={data.rating.value === null ? "—" : data.rating.value.toFixed(1)}
              state={
                data.rating.value === null && !data.rating.small
                  ? "none"
                  : state(data.rating.small, data.rating.n)
              }
              {...(data.rating.change !== null
                ? { delta: data.rating.change, deltaUnit: "pts" as const }
                : {})}
              spark={data.rating.spark}
              href={answers}
            />
            <KpiTile
              label="Responses"
              value={data.responses.value === null ? "—" : data.responses.value}
              state={state(data.responses.small, data.responses.n)}
              {...(data.responses.change !== null ? { delta: data.responses.change } : {})}
              spark={data.responses.spark}
              {...(data.responses.answerRate !== null
                ? {
                    note: `${pct(data.responses.answerRate)}% of ${data.responses.sent} requests answered`,
                  }
                : {})}
              href={answers}
            />
            <KpiTile
              label="Review link clicks"
              value={data.reviewClicks.clicks}
              state={state(data.reviewClicks.small, data.reviewClicks.answers)}
              {...(data.reviewClicks.change !== null
                ? { delta: data.reviewClicks.change, deltaUnit: "pts" as const }
                : {})}
              {...(data.reviewClicks.rate !== null
                ? { note: `${pct(data.reviewClicks.rate)}% of answers clicked the review link` }
                : {})}
              href={answers}
            />
            <KpiTile
              label="Waiting on you"
              value={data.waiting.open}
              state="ok"
              note={`${data.waiting.overdue} past the 24-hour target`}
              tone="lime"
              href={
                data.waiting.overdue > 0 ? "/reputation/cases?status=overdue" : "/reputation/cases"
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Block title="Rating over time">
              <TrendChart
                points={data.rating.small ? [] : data.series}
                label="Average rating per day"
              />
            </Block>
            <Block title="What guests mention">
              {data.read === 0 && data.topics.length === 0 ? (
                <p className="m-0 text-sm text-fg-muted">No reading yet for these answers</p>
              ) : (
                <SplitBars
                  rows={data.topics}
                  hint={`Read from ${data.read} answers. Open a topic to see them.`}
                  empty="No topics came up in this period"
                  href={(topic) => `${answers}&topic=${encodeURIComponent(topic)}`}
                />
              )}
            </Block>
          </div>

          <div className="flex flex-col gap-4">
            <Block title="Your places">
              <DataTable
                label="Your places"
                rows={data.places}
                rowKey={(p) => p.locationId}
                empty={<p className="m-0 text-sm text-fg-muted">No places yet</p>}
                rowHref={(p) =>
                  `/reputation/responses?range=${range}&place=${encodeURIComponent(p.locationId)}`
                }
                columns={[
                  { key: "name", header: "Place", nowrap: true, cell: (p) => p.name },
                  {
                    key: "rating",
                    header: "Rating",
                    numeric: true,
                    nowrap: true,
                    cell: (p) =>
                      p.rating === null ? (
                        "—"
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          {p.rating.toFixed(1)}
                          {p.change !== null ? <Delta value={p.change} unit="pts" /> : null}
                        </span>
                      ),
                  },
                  {
                    key: "responses",
                    header: "Answers",
                    numeric: true,
                    nowrap: true,
                    cell: (p) => p.responses,
                  },
                  {
                    key: "cases",
                    header: "Cases",
                    numeric: true,
                    nowrap: true,
                    cell: (p) =>
                      p.overdueCases > 0
                        ? `${p.openCases} (${p.overdueCases} overdue)`
                        : p.openCases,
                  },
                ]}
              />
            </Block>
            <Block title="What Host did">
              <dl className="m-0 flex flex-col gap-2">
                {[
                  ["Requests sent", data.host.requestsSent],
                  ["Cases opened", data.host.casesOpened],
                  ["Answers read", data.host.answersRead],
                ].map(([label, n]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0"
                  >
                    <dt className="text-fg-muted">{label}</dt>
                    <dd className="m-0 font-serif text-2xl text-fg-strong tabular-nums">{n}</dd>
                  </div>
                ))}
              </dl>
            </Block>
          </div>

          <UpdatedStamp
            at={data.generatedAt}
            note={`compared with the previous ${DAYS[range]} days`}
          />
        </>
      )}
    </div>
  );
}
