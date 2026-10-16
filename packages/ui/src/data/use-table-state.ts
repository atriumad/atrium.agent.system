"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Sort } from "./data-table";
import {
  parseTableState,
  serializeTableState,
  type TableSpec,
  type TableState,
} from "./table-state";

/**
 * Search, filters, sort and page of a data page, kept in the address so a link can be shared and
 * the back button works. Pass a stable `spec` (a module constant). Typing in the search box
 * replaces the history entry; every other change adds one.
 */
export function useTableState(spec: TableSpec) {
  const [state, setState] = useState<TableState>(() => parseTableState("", spec));
  const current = useRef(state);
  current.current = state;

  useEffect(() => {
    const read = () => setState(parseTableState(window.location.search, spec));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [spec]);

  const commit = useCallback(
    (next: TableState, mode: "push" | "replace") => {
      current.current = next;
      setState(next);
      const url = `${window.location.pathname}${serializeTableState(next, spec)}${window.location.hash}`;
      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [spec],
  );

  return {
    state,
    setSearch: (q: string) => commit({ ...current.current, q, page: 1 }, "replace"),
    setFilter: (key: string, value: string | null) => {
      const filters = { ...current.current.filters };
      if (value) filters[key] = value;
      else delete filters[key];
      commit({ ...current.current, filters, page: 1 }, "push");
    },
    clearFilters: () => commit({ ...current.current, q: "", filters: {}, page: 1 }, "push"),
    setSort: (sort: Sort | null) => commit({ ...current.current, sort, page: 1 }, "push"),
    setPage: (page: number) => commit({ ...current.current, page }, "push"),
  };
}
