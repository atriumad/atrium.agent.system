"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../actions/button";
import {
  type LoyaltyActivityPage as ActivityData,
  api,
  type LoyaltyActivityQuery,
  type LoyaltyKind,
  type LoyaltySummary,
  type RangeKey,
} from "../api";
import { DataTable } from "../data/data-table";
import { Skeleton } from "../data/misc";
import { PageControls } from "../data/page-controls";
import { DataSectionPage } from "../data/section-page";
import type { TableSpec } from "../data/table-state";
import { useRangeState } from "../data/use-range-state";
import { useTableState } from "../data/use-table-state";
import { writeParams } from "../data/write-params";
import { EmptyState, ErrorState } from "../feedback/states";
import { Tabs } from "../navigation/tabs";
import { useMe } from "../shell/me-context";
import { NotAvailable } from "../shell/not-available";
import { ModulePage } from "../shell/teaser";
import { LoyaltyBandView } from "./activity-band";
import { loyaltyColumns } from "./activity-columns";
import { loyaltyFailure } from "./program-page";

// "place" is not a table filter key: the place in the address belongs to the range controls.
const SPEC: TableSpec = { filterKeys: ["kind"], defaultSort: { key: "at", dir: "desc" } };
const PAGE_SIZE = 25;
const TABS: { value: "all" | LoyaltyKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "stamp", label: "Stamps" },
  { value: "reward_earned", label: "Rewards earned" },
  { value: "reward_redeemed", label: "Redeemed" },
  { value: "void", label: "Voids" },
];

/** The loyalty activity: a summary band, kind tabs and a server-paged table. Read-only by construction. */
function ActivityTablePage() {
  const { range, scopeId } = useRangeState({ scope: "place" });
  const table = useTableState(SPEC);
  const { state } = table;

  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [band, setBand] = useState<LoyaltySummary | null>(null);
  const [bandState, setBandState] = useState<"loading" | "error" | "ok">("loading");
  const [bandTries, setBandTries] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [blocked, setBlocked] = useState<"locked" | "forbidden" | null>(null);

  // A new range or place starts at page 1, in the same history entry.
  const setRange = (r: RangeKey) => writeParams({ range: r, page: null });
  const setScopeId = (id: string | null) => writeParams({ place: id, page: null });

  const kind = TABS.find((t) => t.value === state.filters.kind)?.value ?? "all";

  const key = JSON.stringify({
    range,
    ...(scopeId ? { place: scopeId } : {}),
    ...(kind !== "all" ? { kind } : {}),
    page: state.page,
    pageSize: PAGE_SIZE,
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
      .loyaltyActivity(JSON.parse(key) as LoyaltyActivityQuery)
      .then((d) => {
        if (!current) return;
        // A link to a page past the end: move to the last page once, replacing the entry so Back
        // does not return to the bad one. If the last page is the one just asked, fall through to
        // the empty state instead of waiting on a request that never comes.
        const asked = (JSON.parse(key) as LoyaltyActivityQuery).page;
        const last = Math.max(1, Math.ceil(d.total / d.pageSize));
        if (d.rows.length === 0 && d.total > 0 && asked > 1 && last !== asked) {
          writeParams({ page: last > 1 ? String(last) : null }, "replace");
          return;
        }
        setData(d);
        setNow(new Date());
        setLoading(false);
      })
      .catch((e) => {
        if (!current) return;
        const f = loyaltyFailure(e);
        if (f !== "error") setBlocked(f);
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
      .loyaltyBand(range, scopeId ?? undefined)
      .then((b) => {
        if (!current) return;
        setBand(b);
        setBandState("ok");
      })
      .catch((e) => {
        if (!current) return;
        const f = loyaltyFailure(e);
        if (f !== "error") setBlocked(f);
        setBandState("error");
      });
    return () => {
      current = false;
    };
  }, [range, scopeId, bandTries]);

  const retry = useCallback(() => setTries((t) => t + 1), []);

  if (blocked === "locked") return <ModulePage feature="retention" />;
  if (blocked === "forbidden") return <NotAvailable />;

  const dirty = scopeId !== null || kind !== "all";
  const clearAll = () => writeParams({ page: null, place: null, kind: null });
  const columns = loyaltyColumns({ now });

  const empty = dirty ? (
    <EmptyState
      title="Your filters found nothing"
      action={
        <Button variant="outline" onClick={clearAll}>
          Clear filters
        </Button>
      }
    >
      Try fewer filters or a wider range.
    </EmptyState>
  ) : (
    <EmptyState title="No activity yet">
      Stamps appear here as soon as the staff add them.
    </EmptyState>
  );

  return (
    <DataSectionPage
      title="Loyalty activity"
      description="Stamps, rewards and voids on your cards."
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
        <LoyaltyBandView band={band} state={bandState} onRetry={() => setBandTries((t) => t + 1)} />
      }
      tabs={
        <Tabs
          label="Filter activity"
          value={kind}
          onValueChange={(v) => table.setFilter("kind", v === "all" ? null : String(v))}
          items={TABS.map((t) => ({ value: t.value, label: t.label }))}
        />
      }
    >
      {failed ? (
        <ErrorState title="Could not load activity" onRetry={retry} retryLabel="Retry">
          Check your connection and try again.
        </ErrorState>
      ) : data === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div aria-busy={loading || undefined} className={loading ? "opacity-70" : undefined}>
          <DataTable
            dense
            label="Loyalty activity"
            minWidth="46rem"
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.id}
            totalRows={data.total}
            page={data.page}
            pageSize={data.pageSize}
            onPageChange={table.setPage}
            footerNote="newest first"
            empty={empty}
          />
        </div>
      )}
    </DataSectionPage>
  );
}

export function LoyaltyActivityPage() {
  const me = useMe();
  return me.canReadLoyalty ? <ActivityTablePage /> : <NotAvailable />;
}
