import { afterEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import {
  applyTableState,
  parseTableState,
  serializeTableState,
  type TableSpec,
} from "../src/data/table-state";
import { useTableState } from "../src/data/use-table-state";

const SPEC: TableSpec = {
  filterKeys: ["severity", "status"],
  defaultSort: { key: "due", dir: "asc" },
};

afterEach(() => window.history.replaceState(null, "", "/"));

describe("parseTableState and serializeTableState", () => {
  test("an empty address is the default state", () => {
    expect(parseTableState("", SPEC)).toEqual({
      q: "",
      filters: {},
      sort: { key: "due", dir: "asc" },
      page: 1,
    });
  });

  test("round trips search, filters, sort and page", () => {
    const state = {
      q: "soup",
      filters: { severity: "high", status: "open" },
      sort: { key: "rating", dir: "desc" as const },
      page: 3,
    };
    const url = serializeTableState(state, SPEC);
    expect(url).toBe("?q=soup&severity=high&status=open&sort=rating%3Adesc&page=3");
    expect(parseTableState(url, SPEC)).toEqual(state);
  });

  test("the default sort and page 1 are not written", () => {
    expect(
      serializeTableState({ q: "", filters: {}, sort: { key: "due", dir: "asc" }, page: 1 }, SPEC),
    ).toBe("");
  });

  test("keys the page does not offer, a bad sort and a bad page are ignored", () => {
    const state = parseTableState("?color=red&sort=due:sideways&page=-4&severity=low", SPEC);
    expect(state.filters).toEqual({ severity: "low" });
    expect(state.sort).toEqual({ key: "due", dir: "asc" });
    expect(state.page).toBe(1);
    expect(parseTableState("?page=2.5", SPEC).page).toBe(1);
  });
});

describe("applyTableState", () => {
  type Row = { id: string; text: string; severity: string };
  const rows: Row[] = [
    { id: "1", text: "Cold soup (again)", severity: "high" },
    { id: "2", text: "Long wait [45 min]", severity: "low" },
    { id: "3", text: "Great evening", severity: "low" },
  ];
  const spec = {
    searchText: (r: Row) => r.text,
    filterValue: { severity: (r: Row) => r.severity },
  };
  const state = (over: Partial<ReturnType<typeof parseTableState>>) => ({
    ...parseTableState("", SPEC),
    ...over,
  });

  test("search is case-insensitive and filters combine", () => {
    expect(applyTableState(rows, state({ q: "SOUP" }), spec).map((r) => r.id)).toEqual(["1"]);
    expect(
      applyTableState(rows, state({ filters: { severity: "low" } }), spec).map((r) => r.id),
    ).toEqual(["2", "3"]);
    expect(
      applyTableState(rows, state({ q: "wait", filters: { severity: "low" } }), spec).map(
        (r) => r.id,
      ),
    ).toEqual(["2"]);
  });

  test("search text with regex characters matches literally and never throws", () => {
    expect(applyTableState(rows, state({ q: "(again)" }), spec).map((r) => r.id)).toEqual(["1"]);
    expect(applyTableState(rows, state({ q: "[45" }), spec).map((r) => r.id)).toEqual(["2"]);
    expect(applyTableState(rows, state({ q: "\\" }), spec)).toEqual([]);
  });

  test("a filter value that is not an option finds nothing, it does not crash", () => {
    expect(applyTableState(rows, state({ filters: { severity: "banana" } }), spec)).toEqual([]);
  });
});

describe("useTableState", () => {
  test("reads the address on mount", () => {
    window.history.replaceState(null, "", "/?severity=high&page=2");
    const { result } = renderHook(() => useTableState(SPEC));
    expect(result.current.state.filters).toEqual({ severity: "high" });
    expect(result.current.state.page).toBe(2);
  });

  test("a filter change writes the address and goes back to page 1", () => {
    window.history.replaceState(null, "", "/?page=3");
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => result.current.setFilter("status", "open"));
    expect(window.location.search).toBe("?status=open");
    expect(result.current.state.page).toBe(1);
    act(() => result.current.setFilter("status", null));
    expect(window.location.search).toBe("");
  });

  test("a change keeps the parameters the table does not own", () => {
    window.history.replaceState(null, "", "/?range=7d&place=p1&status=open");
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => result.current.setFilter("severity", "high"));
    const q = new URLSearchParams(window.location.search);
    expect(q.get("range")).toBe("7d");
    expect(q.get("place")).toBe("p1");
    expect(q.get("severity")).toBe("high");
    act(() => result.current.clearFilters());
    const after = new URLSearchParams(window.location.search);
    expect(after.get("range")).toBe("7d");
    expect(after.get("place")).toBe("p1");
    expect(after.get("severity")).toBeNull();
    expect(after.get("status")).toBeNull();
  });

  test("clear removes search and filters but keeps the sort", () => {
    window.history.replaceState(null, "", "/?q=a&severity=high&sort=rating:desc");
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => result.current.clearFilters());
    expect(window.location.search).toBe("?sort=rating%3Adesc");
    expect(result.current.state.q).toBe("");
  });

  test("setSort and setPage write the address", () => {
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => result.current.setSort({ key: "rating", dir: "desc" }));
    act(() => result.current.setPage(2));
    expect(window.location.search).toBe("?sort=rating%3Adesc&page=2");
  });

  test("the back button restores the earlier state", () => {
    const { result } = renderHook(() => useTableState(SPEC));
    act(() => {
      window.history.pushState(null, "", "/?q=soup");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.state.q).toBe("soup");
  });
});
