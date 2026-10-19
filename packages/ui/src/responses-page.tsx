"use client";

import { type ElementType, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./actions/button";
import {
  api,
  type RangeKey,
  type ResponseSort,
  type ResponsesBand,
  type ResponsesPage as ResponsesData,
  type ResponsesQuery,
  type ResponseTableRow,
  type Topic,
} from "./api";
import { DataTable, type Sort } from "./data/data-table";
import { FilterBar } from "./data/filter-bar";
import { Skeleton } from "./data/misc";
import { PageControls } from "./data/page-controls";
import { DataSectionPage } from "./data/section-page";
import { humaniseTopic } from "./data/split-bars";
import { serializeTableState, type TableSpec } from "./data/table-state";
import { useDebounced } from "./data/use-debounced";
import { useRangeState } from "./data/use-range-state";
import { useTableState } from "./data/use-table-state";
import { writeParams } from "./data/write-params";
import { EmptyState, ErrorState } from "./feedback/states";
import { Tabs } from "./navigation/tabs";
import { ResponseDrawer } from "./response-drawer";
import { ResponsesBandView } from "./responses-band";
import { responsesColumns } from "./responses-columns";
import { useMe } from "./shell/me-context";
import { NotAvailable } from "./shell/not-available";

// "place" is not a table filter key: the place in the address belongs to the range controls.
const SPEC: TableSpec = {
  filterKeys: ["tab", "rating", "sentiment", "topic"],
  defaultSort: { key: "date", dir: "desc" },
};
const PAGE_SIZE = 25;
const TOPICS: Topic[] = [
  "food",
  "service",
  "wait",
  "cleanliness",
  "price",
  "atmosphere",
  "staff",
  "other",
];
const SENTIMENTS = ["positive", "mixed", "negative"] as const;
const SORTS: ResponseSort[] = ["date", "rating", "place", "sentiment"];
const TABS = [
  { value: "all", label: "All" },
  { value: "low", label: "3 stars or fewer" },
  { value: "contact", label: "Wants contact" },
  { value: "case", label: "Has a case" },
  { value: "safety", label: "Safety" },
] as const;
const COUNT_OF = {
  all: "all",
  low: "lowRating",
  contact: "wantsContact",
  case: "hasCase",
  safety: "safety",
} as const;

/** The Responses section: a summary band, tabs, filters and a server-paged table, with a drawer for one answer. */
function ResponsesTablePage({ linkAs }: { linkAs?: ElementType }) {
  const me = useMe();
  const surface = me.kind === "client" ? "platform" : "manager";
  const showClient = me.kind !== "client";
  const { range, scopeId } = useRangeState({ scope: "place" });
  const table = useTableState(SPEC);
  const { state } = table;

  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [data, setData] = useState<ResponsesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [band, setBand] = useState<ResponsesBand | null>(null);
  const [bandState, setBandState] = useState<"loading" | "error" | "ok">("loading");
  const [bandTries, setBandTries] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState<ResponseTableRow | null>(null);

  // A new range or place starts at page 1, in the same history entry.
  const setRange = (r: RangeKey) => writeParams({ range: r, page: null });
  const setScopeId = (id: string | null) => writeParams({ place: id, page: null });

  const tab = TABS.find((t) => t.value === state.filters.tab)?.value ?? "all";
  const sortKey = SORTS.find((s) => s === state.sort?.key) ?? "date";
  const sortDir = SORTS.includes(state.sort?.key as ResponseSort)
    ? (state.sort?.dir ?? "desc")
    : "desc";
  const sentiment = SENTIMENTS.find((s) => s === state.filters.sentiment);
  const topic = TOPICS.find((t) => t === state.filters.topic);
  const rating = Number(state.filters.rating);

  // The box follows every keystroke; the request follows it 300ms later. Emptying it applies at once.
  const q = useDebounced(state.q.trim().slice(0, 200), 300, (v) => v === "");

  const key = JSON.stringify({
    range,
    ...(scopeId ? { place: scopeId } : {}),
    page: state.page,
    pageSize: PAGE_SIZE,
    sort: sortKey,
    dir: sortDir,
    ...(q ? { q } : {}),
    ...(tab === "low" ? { maxRating: 3 } : {}),
    ...(tab === "contact" ? { wantsContact: true } : {}),
    ...(tab === "case" ? { hasCase: true } : {}),
    ...(tab === "safety" ? { safety: true } : {}),
    ...(rating >= 1 && rating <= 5 && Number.isInteger(rating) ? { rating } : {}),
    ...(sentiment ? { sentiment } : {}),
    ...(topic ? { topic } : {}),
  });

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

  // The table: a new request for every change; an answer to an older request is dropped. The
  // previous rows stay on screen (marked busy) until the new ones arrive.
  useEffect(() => {
    let current = true;
    setLoading(true);
    setFailed(false);
    api
      .responsesPage(JSON.parse(key) as ResponsesQuery)
      .then((d) => {
        if (!current) return;
        // A link to a page past the end: move to the last page once, replacing the entry so Back
        // does not return to the bad one. If the last page is the one just asked, there is nothing
        // to move to: fall through to the empty state instead of waiting on a request that never comes.
        const asked = (JSON.parse(key) as ResponsesQuery).page ?? 1;
        const last = Math.max(1, Math.ceil(d.total / d.pageSize));
        if (d.rows.length === 0 && d.total > 0 && asked > 1 && last !== asked) {
          writeParams({ page: last > 1 ? String(last) : null }, "replace");
          return;
        }
        setData(d);
        setNow(new Date());
        setLoading(false);
      })
      .catch(() => {
        if (!current) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [key, tries]);

  // The band: its own request and its own error, so a failure here never hides the table.
  useEffect(() => {
    let current = true;
    setBandState("loading");
    api
      .responsesBand(range, scopeId ?? undefined)
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

  // Where the case page sends Back to: the table's own search plus the range and place.
  const backSearch = useMemo(() => {
    const params = new URLSearchParams(serializeTableState(state, SPEC));
    if (range !== "30d") params.set("range", range);
    if (scopeId) params.set("place", scopeId);
    const s = params.toString();
    return s ? `?${s}` : undefined;
  }, [state, range, scopeId]);

  const dirty = state.q !== "" || scopeId !== null || Object.keys(state.filters).length > 0;
  const clearAll = () =>
    writeParams({
      q: null,
      page: null,
      place: null,
      sort: null,
      tab: null,
      rating: null,
      sentiment: null,
      topic: null,
    });
  const setFilter = (name: string) => (value: string | null) => table.setFilter(name, value);
  const sort: Sort = { key: sortKey, dir: sortDir };
  const columns = responsesColumns({
    surface,
    showClient,
    now,
    backSearch,
    ...(linkAs ? { linkAs } : {}),
  });
  const unread = data?.unread ?? 0;

  const note = (
    <>
      sorted by {sortKey}
      {unread > 0 ? ` · ${unread} ${unread === 1 ? "row has" : "rows have"} no reading yet` : ""}
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
    <EmptyState title="No responses yet">
      Answers appear here as soon as a guest finishes the survey.
    </EmptyState>
  );

  const retry = useCallback(() => setTries((t) => t + 1), []);

  return (
    <DataSectionPage
      title="Responses"
      description="What guests answered after their visit."
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
        <ResponsesBandView
          band={band}
          state={bandState}
          onRetry={() => setBandTries((t) => t + 1)}
        />
      }
      tabs={
        <Tabs
          label="Filter responses"
          value={tab}
          onValueChange={(v) => table.setFilter("tab", v === "all" ? null : String(v))}
          items={TABS.map((t) => ({
            value: t.value,
            label: t.label,
            ...(data ? { count: data.counts[COUNT_OF[t.value]] } : {}),
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
            key: "rating",
            label: "Rating",
            options: [5, 4, 3, 2, 1].map((n) => ({
              value: String(n),
              label: n === 1 ? "1 star" : `${n} stars`,
            })),
            value: state.filters.rating ?? null,
            onChange: setFilter("rating"),
          },
          {
            key: "sentiment",
            label: "Sentiment",
            options: SENTIMENTS.map((s) => ({
              value: s,
              label: s.charAt(0).toUpperCase() + s.slice(1),
            })),
            value: state.filters.sentiment ?? null,
            onChange: setFilter("sentiment"),
          },
          {
            key: "topic",
            label: "Topic (read answers)",
            options: TOPICS.map((t) => ({ value: t, label: humaniseTopic(t) })),
            value: state.filters.topic ?? null,
            onChange: setFilter("topic"),
          },
        ]}
        shown={data?.total ?? 0}
        total={data?.total ?? 0}
        onClear={clearAll}
      />
      {failed ? (
        <ErrorState title="Could not load responses" onRetry={retry} retryLabel="Retry">
          Check your connection and try again.
        </ErrorState>
      ) : data === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div aria-busy={loading || undefined} className={loading ? "opacity-70" : undefined}>
          <DataTable
            dense
            label="Responses"
            minWidth="52rem"
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.id}
            // A row opens the drawer, not a page. DataTable makes a row clickable only through a
            // link in its first cell, so the link is a button (RowButton) and the href is unused.
            rowHref={() => "#"}
            linkAs={RowButton}
            onRowOpen={setOpen}
            sort={sort}
            onSortChange={table.setSort}
            totalRows={data.total}
            page={data.page}
            pageSize={data.pageSize}
            onPageChange={table.setPage}
            footerNote={note}
            empty={empty}
          />
        </div>
      )}
      <ResponseDrawer
        row={open}
        onClose={() => setOpen(null)}
        surface={surface}
        showClient={showClient}
        canAskForHelp={me.canRequestSurveys}
        backSearch={backSearch}
        now={now}
        {...(linkAs ? { linkAs } : {})}
      />
    </DataSectionPage>
  );
}

/** The first cell of a row. It opens the drawer instead of going anywhere, and takes focus first so Escape returns to it. */
function RowButton({
  href: _href,
  children,
  onClick,
  ...rest
}: React.ComponentProps<"button"> & { href?: string }) {
  return (
    <button
      type="button"
      {...rest}
      onClick={(e) => {
        e.currentTarget.focus();
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}

export function ResponsesPage({ linkAs }: { linkAs?: ElementType } = {}) {
  const me = useMe();
  return me.canReadSurveys ? (
    <ResponsesTablePage {...(linkAs ? { linkAs } : {})} />
  ) : (
    <NotAvailable />
  );
}
