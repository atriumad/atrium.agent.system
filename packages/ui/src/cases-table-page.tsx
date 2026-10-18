"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./actions/button";
import { api, type CasesBand, type CasesTable, type CaseTableRow, type RangeKey } from "./api";
import { caseHref, redirectLegacyCase } from "./case-detail-page";
import type { Surface } from "./cases-app";
import { SeverityPill, Stars, TopicChips, When } from "./data/cells";
import { DailyBars } from "./data/daily-bars";
import { type Column, DataTable, type Sort } from "./data/data-table";
import { FilterBar } from "./data/filter-bar";
import { KpiTile } from "./data/kpi-tile";
import { Skeleton } from "./data/misc";
import { PageControls } from "./data/page-controls";
import { DataSectionPage, SectionBand } from "./data/section-page";
import { humaniseTopic } from "./data/split-bars";
import {
  applyTableState,
  type RowSpec,
  serializeTableState,
  type TableSpec,
} from "./data/table-state";
import { useRangeState } from "./data/use-range-state";
import { useTableState } from "./data/use-table-state";
import { StatusBadge } from "./feedback/badge";
import { EmptyState, ErrorState } from "./feedback/states";
import { dueLabel, duration, inTab, STATUS_LABEL, TABS, type Tab } from "./format";
import { Tabs } from "./navigation/tabs";
import { useMe } from "./shell/me-context";

// "place" is not a table filter key: the place in the address belongs to the range controls
// (useRangeState), which also drive the band. Both read and write the same parameter.
const SPEC: TableSpec = {
  filterKeys: ["tab", "severity", "topic", "contact"],
  defaultSort: { key: "due", dir: "asc" },
};

const COPY: Record<Surface, { title: string; blurb: string }> = {
  manager: {
    title: "Recovery cases",
    blurb: "Guests who had a bad visit. Reach out within 24 hours.",
  },
  platform: {
    title: "Guest feedback to follow up",
    blurb: "Your team is on these. You are told when one opens and when it closes.",
  },
};

const DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };
const TOPICS = ["food", "service", "wait", "cleanliness", "price", "atmosphere", "staff", "other"];
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const SORT_WORDS: Record<string, string> = {
  severity: "severity",
  rating: "rating",
  place: "place",
  comment: "what the guest said",
  due: "due time",
  opened: "opened date",
  status: "status",
};
const pct = (v: number) => Math.round(v * 100);
const hoursText = (h: number) => duration(h * 3_600_000);

function asTab(value: string | undefined): Tab {
  return TABS.find((t) => t === value) ?? "active";
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-card border border-frame bg-surface-card p-4">
      <h2 className="label-caps m-0 text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

function Band({
  band,
  state,
  onRetry,
  range,
}: {
  band: CasesBand | null;
  state: "loading" | "error" | "ok";
  onRetry: () => void;
  range: RangeKey;
}) {
  const days = DAYS[range];
  let tiles: React.ReactNode = null;
  let aside: React.ReactNode = null;
  if (band) {
    const c = band.contact;
    const parts = [
      "Target 24h",
      c.insideTarget !== null ? `${pct(c.insideTarget)}% inside target` : null,
      c.change !== null && Math.round(Math.abs(c.change) * 10) > 0
        ? `${Math.round(Math.abs(c.change) * 10) / 10}h ${c.change < 0 ? "faster" : "slower"} than before`
        : null,
    ].filter(Boolean);
    const severities = (["high", "medium", "low"] as const)
      .map((s) => ({ s, n: band.bySeverity[s] }))
      .sort((a, b) => b.n - a.n);
    const top = Math.max(...severities.map((r) => r.n), 1);
    tiles = (
      <>
        <KpiTile
          label="Active"
          value={band.open}
          state="ok"
          note={`${band.overdue.value} overdue`}
          tone="lime"
        />
        <KpiTile
          label="Overdue"
          value={band.overdue.value}
          state="ok"
          goodWhen="down"
          note={`Was ${band.overdue.previous} in the previous ${days} days`}
        />
        <KpiTile
          label="Median time to contact"
          value={c.medianHours === null ? "—" : hoursText(c.medianHours)}
          figureFont="sans"
          state={
            c.medianHours === null
              ? c.cases === 0
                ? "none"
                : "none"
              : c.small
                ? { tooFew: c.cases }
                : "ok"
          }
          note={parts.join(" · ")}
        />
        <KpiTile
          label="Resolved"
          value={band.resolved.value}
          state={band.resolved.small ? { tooFew: band.resolved.value } : "ok"}
          {...(band.resolved.change !== null ? { delta: band.resolved.change } : {})}
        />
      </>
    );
    aside = (
      <>
        <Block title="Opened per day">
          <DailyBars days={band.openedPerDay} label="Cases opened per day" />
        </Block>
        <Block title="By severity">
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {severities.map(({ s, n }) => (
              <li key={s} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-fg-strong">
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  <span className="tabular-nums text-fg-muted">{n}</span>
                </span>
                <span className="h-2 w-full rounded-sm border border-frame">
                  <span
                    className="block h-full bg-charcoal-800 dark:bg-cream-300"
                    style={{ width: `${(n / top) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Block>
      </>
    );
  }
  return (
    <SectionBand
      state={state}
      onRetry={onRetry}
      title="Cases summary"
      tiles={tiles}
      aside={aside}
    />
  );
}

/** The Cases section: a summary band on top, then tabs, filters and a dense table. */
export function CasesTablePage({
  surface,
  replace,
}: {
  surface: Surface;
  /** Where an old `?case=` address goes. The browser's location by default. */
  replace?: (url: string) => void;
}) {
  const me = useMe();
  const { range, scopeId, setRange, setScopeId } = useRangeState({ scope: "place" });
  const table = useTableState(SPEC);
  const { state } = table;

  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [data, setData] = useState<CasesTable | null>(null);
  const [tableFailed, setTableFailed] = useState(false);
  const [tableTries, setTableTries] = useState(0);
  const [band, setBand] = useState<CasesBand | null>(null);
  const [bandState, setBandState] = useState<"loading" | "error" | "ok">("loading");
  const [bandTries, setBandTries] = useState(0);
  const [now, setNow] = useState(() => new Date());

  // An address from before a case had its own page goes to the case route, keeping the rest.
  useEffect(() => {
    const target = redirectLegacyCase(surface, window.location.search);
    if (!target) return;
    if (replace) replace(target);
    else window.location.replace(target);
  }, [surface, replace]);

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

  // The table: reloaded when the range changes or Retry is pressed, and every 30 seconds.
  useEffect(() => {
    let current = true;
    const load = () =>
      api
        .casesTable(range)
        .then((d) => {
          if (!current) return;
          setData(d);
          setTableFailed(false);
          setNow(new Date());
        })
        .catch(() => {
          if (current) setTableFailed(true);
        });
    setData(null);
    setTableFailed(false);
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [range, tableTries]);

  // The band: its own request and its own error, so a failure here never hides the table.
  useEffect(() => {
    let current = true;
    setBandState("loading");
    api
      .casesBand(range, scopeId ?? undefined)
      .then((b) => {
        if (!current) return;
        setBand(b);
        setBandState("ok");
      })
      .catch(() => {
        if (current) setBandState("error");
      });
    return () => {
      current = false;
    };
  }, [range, scopeId, bandTries]);

  const tab = asTab(state.filters.tab);
  const topic = state.filters.topic;

  const rowSpec = useMemo<RowSpec<CaseTableRow>>(
    () => ({
      searchText: (r) => r.comment ?? "",
      filterValue: {
        severity: (r) => r.severity,
        contact: (r) => (r.wantsContact ? "yes" : "no"),
        topic: (r) => (topic && r.topics?.includes(topic) ? topic : ""),
      },
    }),
    [topic],
  );

  const inTabRows = useMemo(
    () =>
      (data?.cases ?? []).filter(
        (r) => inTab(r.status, tab) && (!scopeId || r.locationId === scopeId),
      ),
    [data, tab, scopeId],
  );
  const rows = useMemo(
    () => applyTableState(inTabRows, state, rowSpec),
    [inTabRows, state, rowSpec],
  );
  const unread = inTabRows.filter((r) => r.topics === null).length;

  // The address the case page sends Back to: the table's own search plus the range and place.
  const backSearch = useMemo(() => {
    const params = new URLSearchParams(serializeTableState(state, SPEC));
    if (range !== "30d") params.set("range", range);
    if (scopeId) params.set("place", scopeId);
    const s = params.toString();
    return s ? `?${s}` : undefined;
  }, [state, range, scopeId]);

  const showClient = me.kind !== "client";
  const dirty =
    state.q !== "" || scopeId !== null || Object.keys(state.filters).some((k) => k !== "tab");
  const clearAll = () => {
    table.clearFilters();
    if (scopeId) setScopeId(null);
  };
  const setFilter = (key: string) => (value: string | null) => table.setFilter(key, value);

  const columns: Column<CaseTableRow>[] = [
    {
      key: "severity",
      header: "Severity",
      nowrap: true,
      cell: (r) => <SeverityPill severity={r.severity} />,
      sortValue: (r) => SEVERITY_RANK[r.severity],
    },
    {
      key: "rating",
      header: "Rating",
      nowrap: true,
      cell: (r) => <Stars rating={r.rating} />,
      sortValue: (r) => r.rating,
    },
    {
      key: "place",
      header: "Place",
      nowrap: true,
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
      header: "Topics",
      nowrap: true,
      cell: (r) => <TopicChips topics={r.topics} />,
    },
    {
      key: "due",
      header: "Due",
      nowrap: true,
      cell: (r) => {
        const due = dueLabel(r.status, r.dueAt, now);
        if (!due) return <span className="text-fg-muted">—</span>;
        return due.tone === "overdue" ? (
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge status="danger">Overdue</StatusBadge>
            <span className="text-xs text-fg-muted">{due.text.replace("Overdue ", "")}</span>
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
      header: "Opened",
      nowrap: true,
      cell: (r) => <When date={r.openedAt} now={now} />,
      sortValue: (r) => new Date(r.openedAt).getTime(),
    },
    {
      key: "status",
      header: "Status",
      nowrap: true,
      cell: (r) => (
        <StatusBadge
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

  const sortWord = SORT_WORDS[state.sort?.key ?? "due"] ?? "due time";
  const note = (
    <>
      sorted by {sortWord}
      {data?.truncated ? " · Showing the latest 200 cases" : ""}
      {unread > 0 ? ` · ${unread} not read, so no topics` : ""}
    </>
  );

  const empty = dirty ? (
    <EmptyState
      title="Your filters found nothing"
      action={
        <Button variant="outline" onClick={clearAll}>
          Clear filters
        </Button>
      }
    >
      Try fewer filters or a different word.
    </EmptyState>
  ) : (
    <EmptyState title={tab === "active" ? "Nothing needs follow-up right now." : "No cases here."}>
      New cases appear here the moment a guest leaves a low rating.
    </EmptyState>
  );

  const retryTable = useCallback(() => setTableTries((t) => t + 1), []);
  const sort: Sort | null = state.sort;

  return (
    <DataSectionPage
      title={COPY[surface].title}
      description={COPY[surface].blurb}
      controls={
        <PageControls
          range={range}
          onRange={setRange}
          options={options}
          value={scopeId}
          onValue={setScopeId}
          allLabel="All places"
          scopeLabel="Place"
        />
      }
      band={
        <Band
          band={band}
          state={bandState}
          onRetry={() => setBandTries((t) => t + 1)}
          range={range}
        />
      }
      tabs={
        <Tabs
          label="Filter by status"
          value={tab}
          onValueChange={(v) => table.setFilter("tab", v === "active" ? null : String(v))}
          items={TABS.map((t) => ({
            value: t,
            label: t.charAt(0).toUpperCase() + t.slice(1),
            ...(data ? { count: data.counts[t] } : {}),
          }))}
        />
      }
    >
      <FilterBar
        search={{
          value: state.q,
          onChange: table.setSearch,
          label: "Search what the guest said",
          placeholder: "Search comments",
        }}
        filters={[
          {
            key: "severity",
            label: "Severity",
            options: [
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ],
            value: state.filters.severity ?? null,
            onChange: setFilter("severity"),
          },
          {
            key: "place",
            label: "Place",
            options,
            value: scopeId,
            onChange: setScopeId,
          },
          {
            key: "topic",
            label: "Topic (read answers)",
            options: TOPICS.map((t) => ({ value: t, label: humaniseTopic(t) })),
            value: topic ?? null,
            onChange: setFilter("topic"),
          },
          {
            key: "contact",
            label: "Wants contact",
            options: [
              { value: "yes", label: "Wants contact" },
              { value: "no", label: "Does not want contact" },
            ],
            value: state.filters.contact ?? null,
            onChange: setFilter("contact"),
          },
        ]}
        shown={rows.length}
        total={inTabRows.length}
        onClear={clearAll}
      />
      {tableFailed && data === null ? (
        <ErrorState title="Could not load cases" onRetry={retryTable} retryLabel="Try again">
          Check your connection and try again.
        </ErrorState>
      ) : data === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <DataTable
          dense
          label="Cases"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => caseHref(surface, r.id, backSearch)}
          sort={sort}
          onSortChange={table.setSort}
          page={state.page}
          onPageChange={table.setPage}
          footerNote={note}
          empty={empty}
        />
      )}
    </DataSectionPage>
  );
}
