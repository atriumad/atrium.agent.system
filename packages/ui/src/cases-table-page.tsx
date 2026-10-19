"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./actions/button";
import { api, type CasesBand, type CasesTable, type CaseTableRow, type RangeKey } from "./api";
import { caseHref, redirectLegacyCase } from "./case-links";
import type { Surface } from "./cases-app";
import { CasesBandView } from "./cases-band";
import { casesColumns } from "./cases-columns";
import { DataTable, type Sort } from "./data/data-table";
import { FilterBar } from "./data/filter-bar";
import { Skeleton } from "./data/misc";
import { PageControls } from "./data/page-controls";
import { DataSectionPage } from "./data/section-page";
import { humaniseTopic } from "./data/split-bars";
import {
  applyTableState,
  type RowSpec,
  serializeTableState,
  type TableSpec,
} from "./data/table-state";
import { useRangeState } from "./data/use-range-state";
import { useTableState } from "./data/use-table-state";
import { writeParams } from "./data/write-params";
import { StatusBadge } from "./feedback/badge";
import { EmptyState, ErrorState } from "./feedback/states";
import { inTab, TABS, type Tab } from "./format";
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

const TOPICS = ["food", "service", "wait", "cleanliness", "price", "atmosphere", "staff", "other"];
const SORT_WORDS: Record<string, string> = {
  severity: "severity",
  rating: "rating",
  place: "place",
  comment: "what the guest said",
  due: "due time",
  opened: "opened date",
  status: "status",
};

function asTab(value: string | undefined): Tab {
  return TABS.find((t) => t === value) ?? "active";
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
  const range$ = useRangeState({ scope: "place" });
  const { range, scopeId } = range$;
  const table = useTableState(SPEC);
  const { state } = table;
  // A new range or place starts at page 1, in the same history entry.
  const setRange = (r: RangeKey) => writeParams({ range: r, page: null });
  const setScopeId = (id: string | null) => writeParams({ place: id, page: null });

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
        .casesTable(range, scopeId ?? undefined)
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
  }, [range, scopeId, tableTries]);

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
      // The server has already narrowed the rows to the chosen place.
      (data?.cases ?? []).filter((r) => inTab(r.status, tab)),
    [data, tab],
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

  const columns = casesColumns({ showClient, now });

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
        <CasesBandView
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
          // The same state as the Place control in the page header: both edit the place in the address.
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
          minWidth="60rem"
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
