import type { Sort } from "./data-table";

export type TableSpec = {
  /** The filter keys the page offers. Anything else in the address is ignored. */
  filterKeys: string[];
  /** The sort a page opens with. It is not written to the address. */
  defaultSort?: Sort;
};

export type TableState = {
  q: string;
  filters: Record<string, string>;
  sort: Sort | null;
  page: number;
};

export function parseTableState(search: string, spec: TableSpec): TableState {
  const params = new URLSearchParams(search);
  const filters: Record<string, string> = {};
  for (const key of spec.filterKeys) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  let sort: Sort | null = spec.defaultSort ?? null;
  const raw = params.get("sort");
  if (raw) {
    const [key, dir] = raw.split(":");
    if (key && (dir === "asc" || dir === "desc")) sort = { key, dir };
  }
  const page = Number(params.get("page"));
  return {
    q: params.get("q") ?? "",
    filters,
    sort,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The query string for a state: empty, or starting with "?". The default sort and page 1 are left out. */
export function serializeTableState(state: TableState, spec: TableSpec): string {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  for (const key of spec.filterKeys) {
    const value = state.filters[key];
    if (value) params.set(key, value);
  }
  const fallback = spec.defaultSort;
  const isDefault =
    state.sort && fallback && state.sort.key === fallback.key && state.sort.dir === fallback.dir;
  if (state.sort && !isDefault) params.set("sort", `${state.sort.key}:${state.sort.dir}`);
  if (state.page > 1) params.set("page", String(state.page));
  const out = params.toString();
  return out ? `?${out}` : "";
}

export type RowSpec<Row> = {
  /** The text a search matches against. */
  searchText: (row: Row) => string;
  /** The value of each filter for a row. A filter with no entry here is ignored. */
  filterValue: Record<string, (row: Row) => string>;
};

/** Search and filters, in the browser. Search is a plain substring match, never a pattern. */
export function applyTableState<Row>(rows: Row[], state: TableState, spec: RowSpec<Row>): Row[] {
  const q = state.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !spec.searchText(row).toLowerCase().includes(q)) return false;
    for (const [key, wanted] of Object.entries(state.filters)) {
      const read = spec.filterValue[key];
      if (read && read(row) !== wanted) return false;
    }
    return true;
  });
}
