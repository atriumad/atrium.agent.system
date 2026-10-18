"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, buttonStyles } from "../actions/button";
import { type AgencyOverview as AgencyData, api, type QueueItem, type RangeKey } from "../api";
import { Sparkline } from "../data/charts";
import { Delta } from "../data/delta";
import { type KpiState, KpiTile } from "../data/kpi-tile";
import { Skeleton } from "../data/misc";
import { PageControls, UpdatedStamp } from "../data/page-controls";
import { Table, TableWrap, TBody, Td, THead, Th, Tr } from "../data/table";
import { useRangeState } from "../data/use-range-state";
import { Badge, StatusBadge } from "../feedback/badge";
import { duration } from "../format";
import { PageHeader } from "../layout/layout";

type Option = { value: string; label: string };
type Client = AgencyData["clients"][number];

const DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };
const TARGET_HOURS = 24;

const pct = (v: number) => Math.round(v * 100);
const state = (small: boolean, n: number): KpiState => (small ? { tooFew: n } : "ok");

/** 6.2 hours is `6h 12m`. */
function hoursAndMinutes(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const hoursChange = (h: number) =>
  h === 0 ? "no change" : `${Math.abs(Math.round(h * 10) / 10)}h ${h < 0 ? "faster" : "slower"}`;

const KIND: Record<QueueItem["kind"], { word: string; action: string }> = {
  case: { word: "Case", action: "Open case" },
  approval: { word: "Approval", action: "Review" },
  account: { word: "Account", action: "Review" },
  place: { word: "Place to activate", action: "Set up" },
};

const MORE: {
  key: keyof AgencyData["queueCounts"];
  kind: QueueItem["kind"];
  one: string;
  many: string;
  href: string;
}[] = [
  { key: "cases", kind: "case", one: "case", many: "cases", href: "/reputation/cases" },
  {
    key: "approvals",
    kind: "approval",
    one: "approval",
    many: "approvals",
    href: "/approvals/places",
  },
  {
    key: "accounts",
    kind: "account",
    one: "account",
    many: "accounts",
    href: "/approvals/accounts",
  },
  { key: "places", kind: "place", one: "place", many: "places", href: "/approvals/places" },
];

function when(item: QueueItem, now: Date) {
  if (!item.dueAt) return <span className="text-fg-muted">Waiting</span>;
  const left = new Date(item.dueAt).getTime() - now.getTime();
  return item.overdue || left < 0 ? (
    <StatusBadge status="danger">Overdue by {duration(left)}</StatusBadge>
  ) : (
    <span>Due in {duration(left)}</span>
  );
}

function Queue({ data }: { data: AgencyData }) {
  const now = new Date();
  const shown = (kind: QueueItem["kind"]) => data.queue.filter((q) => q.kind === kind).length;
  const more = MORE.map((m) => ({ ...m, left: data.queueCounts[m.key] - shown(m.kind) })).filter(
    (m) => m.left > 0,
  );
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-card border border-frame bg-lime-100 p-5 dark:bg-charcoal-700">
      <div>
        <h2 className="m-0 font-serif text-xl font-normal text-fg-strong">Needs a person now</h2>
        <p className="m-0 mt-1 text-sm text-fg-muted">Overdue first, then by due time.</p>
      </div>
      {data.queue.length === 0 ? (
        <p className="m-0 text-fg-strong">Nothing needs a person right now</p>
      ) : (
        <TableWrap>
          <Table aria-label="Needs a person now">
            <THead>
              <tr>
                <Th>What</Th>
                <Th>Client · place</Th>
                <Th>Detail</Th>
                <Th>When</Th>
                <Th>
                  <span className="sr-only">Action</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {data.queue.map((q) => (
                <Tr key={`${q.kind}-${q.id}`}>
                  <Td>
                    <Badge variant="quiet">
                      {KIND[q.kind].word}
                      {q.severity ? ` · ${q.severity}` : ""}
                    </Badge>
                  </Td>
                  <Td>
                    <b className="font-medium text-fg-strong">{q.client}</b>
                    {q.place ? <span className="text-fg-muted"> · {q.place}</span> : null}
                  </Td>
                  <Td className="min-w-56">{q.detail}</Td>
                  <Td className="whitespace-nowrap">{when(q, now)}</Td>
                  <Td className="text-right">
                    <a href={q.href} className={buttonStyles({ variant: "outline", size: "sm" })}>
                      {KIND[q.kind].action}
                      <span className="sr-only">
                        , {q.client}
                        {q.place ? `, ${q.place}` : ""}
                      </span>
                    </a>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
      {more.length > 0 ? (
        <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {more.map((m) => (
            <a key={m.key} href={m.href} className="text-fg-strong underline">
              {m.left} more {m.left === 1 ? m.one : m.many}
            </a>
          ))}
        </p>
      ) : null}
    </section>
  );
}

function status(c: Client): { status: "danger" | "warning" | "positive"; word: string } {
  if (c.overdue > 0) return { status: "danger", word: "Needs a person" };
  if (c.pendingPlaces > 0) return { status: "warning", word: "Setting up" };
  return { status: "positive", word: "Healthy" };
}

function Clients({ data }: { data: AgencyData }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="m-0 font-serif text-xl font-normal text-fg-strong">Your clients</h2>
      {data.clients.length === 0 ? (
        <p className="m-0 text-sm text-fg-muted">No clients yet</p>
      ) : (
        <TableWrap>
          <Table aria-label="Your clients">
            <THead>
              <tr>
                <Th>Client</Th>
                <Th className="text-right">Rating</Th>
                <Th>30-day trend</Th>
                <Th className="text-right">Change</Th>
                <Th className="text-right">Responses</Th>
                <Th className="text-right">Answer rate</Th>
                <Th className="text-right">Overdue</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {data.clients.map((c) => {
                const s = status(c);
                return (
                  <Tr key={c.clientId}>
                    <Td className="whitespace-nowrap">
                      <b className="font-medium text-fg-strong">{c.name}</b>
                      <span className="text-fg-muted">
                        {" "}
                        · {c.places} {c.places === 1 ? "place" : "places"}
                      </span>
                    </Td>
                    <Td numeric>{c.rating === null ? "—" : c.rating.toFixed(1)}</Td>
                    <Td>
                      {c.rating === null || c.spark.length === 0 ? (
                        <span className="text-xs text-fg-muted">Too few answers</span>
                      ) : (
                        <Sparkline
                          values={c.spark}
                          width={80}
                          height={20}
                          label={`${c.name} rating, last ${DAYS[data.range]} days`}
                        />
                      )}
                    </Td>
                    <Td numeric>
                      {c.change === null ? "—" : <Delta value={c.change} unit="pts" />}
                    </Td>
                    <Td numeric>{c.responses}</Td>
                    <Td numeric>{c.answerRate === null ? "—" : `${pct(c.answerRate)}%`}</Td>
                    <Td numeric>{c.overdue}</Td>
                    <Td>
                      <StatusBadge status={s.status} dot>
                        {s.word}
                      </StatusBadge>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </section>
  );
}

/** What in the portfolio needs a person now: the queue first, then four figures and the clients. */
export function AgencyOverview() {
  const { range, scopeId, setRange, setScopeId } = useRangeState({ scope: "client" });
  const [data, setData] = useState<AgencyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    api
      .places()
      .then((rows) => {
        const seen = new Map<string, string>();
        for (const p of rows) if (!seen.has(p.clientId)) seen.set(p.clientId, p.clientName);
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
      .insightsAgency(range, scopeId ?? undefined)
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
  const answers = `/reputation/responses?range=${range}${scopeId ? `&client=${encodeURIComponent(scopeId)}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader compact title="Overview" description="What needs a person across your clients." />
      <PageControls
        range={range}
        onRange={setRange}
        options={options}
        value={scopeId}
        onValue={setScopeId}
        allLabel="All clients"
        scopeLabel="Client"
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
          <Queue data={data} />

          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              label="Median time to contact"
              value={
                data.contact.medianHours === null ? "—" : hoursAndMinutes(data.contact.medianHours)
              }
              state={
                data.contact.medianHours === null && !data.contact.small
                  ? "none"
                  : state(data.contact.small, data.contact.cases)
              }
              note={[
                `Target ${TARGET_HOURS}h`,
                data.contact.insideTarget !== null
                  ? `${pct(data.contact.insideTarget)}% inside target`
                  : null,
                data.contact.change !== null ? hoursChange(data.contact.change) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              href="/reputation/cases"
            />
            <KpiTile
              label="Overdue cases"
              value={data.overdue.value}
              state="ok"
              goodWhen="down"
              note={`Was ${data.overdue.previous} in the previous ${DAYS[range]} days`}
              href="/reputation/cases?status=overdue"
            />
            <KpiTile
              label="Portfolio rating"
              value={data.portfolio.value === null ? "—" : data.portfolio.value.toFixed(1)}
              state={
                data.portfolio.value === null && !data.portfolio.small
                  ? "none"
                  : state(data.portfolio.small, data.portfolio.n)
              }
              {...(data.portfolio.change !== null
                ? { delta: data.portfolio.change, deltaUnit: "pts" as const }
                : {})}
              {...(data.portfolio.spark.length > 0 ? { spark: data.portfolio.spark } : {})}
              sparkLabel="Portfolio rating trend"
              note={`Weighted by responses (${data.portfolio.n})`}
              href={answers}
            />
            <KpiTile
              label="Request → answer rate"
              value={data.answerRate.value === null ? "—" : `${pct(data.answerRate.value)}%`}
              state={
                data.answerRate.value === null && !data.answerRate.small
                  ? "none"
                  : state(data.answerRate.small, data.answerRate.sent)
              }
              {...(data.answerRate.change !== null
                ? { delta: data.answerRate.change, deltaUnit: "pts" as const }
                : {})}
              note={`Sent ${data.answerRate.sent} · answered ${data.answerRate.answered}`}
              href={answers}
            />
          </div>

          <Clients data={data} />

          <UpdatedStamp
            at={data.generatedAt}
            note={`compared with the previous ${DAYS[range]} days`}
          />
        </>
      )}
    </div>
  );
}
