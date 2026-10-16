"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { type ElementType, type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { Button } from "../actions/button";
import { Checkbox } from "../forms/toggles";
import { cx } from "../lib/cx";
import { Table, TableWrap, TBody, Td, THead, Th, Tr } from "./table";

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Right-aligned with tabular figures. */
  numeric?: boolean;
  /** A string or number to sort by. Without it the column does not sort. */
  sortValue?: (row: Row) => string | number;
};

export type DataTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** The table's accessible name. */
  label: string;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (keys: string[]) => void;
  /** What to show when there are no rows. A table with nothing is an empty state, not an empty table. */
  empty?: ReactNode;
  loading?: boolean;
  /** Where a row goes. The first data cell becomes a link and the whole row is its click target. */
  rowHref?: (row: Row) => string | null;
  /** Called when the link of a row is used, before the browser follows it. */
  onRowOpen?: (row: Row) => void;
  /** The link component, for a router link. A plain anchor by default. */
  linkAs?: ElementType;
  /** Controlled sort. Without it the table keeps its own. */
  sort?: Sort | null;
  onSortChange?: (sort: Sort | null) => void;
  /** Rows per page. A pager shows only when there are more rows than this. */
  pageSize?: number;
  /** The current page, 1-based. Without it the table keeps its own. */
  page?: number;
  onPageChange?: (page: number) => void;
  className?: string;
};

const INTERACTIVE = 'a, button, input, textarea, select, label, [role="checkbox"], [role="button"]';

export type Sort = { key: string; dir: "asc" | "desc" };

/** Sortable, selectable, with loading and empty states. Sorting is a button in the header with aria-sort. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  label,
  selectable,
  selected,
  onSelectedChange,
  empty,
  loading,
  className,
  rowHref,
  onRowOpen,
  linkAs: LinkAs = "a",
  sort: sortProp,
  onSortChange,
  pageSize = 25,
  page: pageProp,
  onPageChange,
}: DataTableProps<Row>) {
  const [innerSort, setInnerSort] = useState<Sort | null>(null);
  const sort = sortProp !== undefined ? sortProp : innerSort;
  const setSort = (next: Sort | null) => {
    if (sortProp === undefined) setInnerSort(next);
    onSortChange?.(next);
  };
  const [innerPage, setInnerPage] = useState(1);
  const [inner, setInner] = useState<string[]>([]);
  const chosen = selected ?? inner;
  const setChosen = (keys: string[]) => {
    if (selected === undefined) setInner(keys);
    onSelectedChange?.(keys);
  };

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!sort || !col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true });
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const size = Math.max(1, Math.floor(pageSize) || 1);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(Math.max(1, pageProp ?? innerPage), pages);
  const goTo = (next: number) => {
    if (pageProp === undefined) setInnerPage(next);
    onPageChange?.(next);
  };
  const visible = sorted.slice((current - 1) * size, current * size);
  const keys = visible.map(rowKey);
  const all = keys.length > 0 && keys.every((k) => chosen.includes(k));
  const some = keys.some((k) => chosen.includes(k));

  /** The first cell is sticky on narrow screens, which shrinks the link's overlay to that cell. */
  const openRow = (row: Row) => (e: MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as Element;
    if (target.closest(INTERACTIVE) || window.getSelection()?.toString()) return;
    e.currentTarget.querySelector<HTMLElement>("[data-row-link]")?.click();
  };

  if (!loading && rows.length === 0 && empty) return <>{empty}</>;

  const table = (
    <Table aria-label={label} aria-busy={loading || undefined}>
      <THead>
        <tr>
          {selectable ? (
            <Th className="w-10">
              <Checkbox
                label={<span className="sr-only">Select all rows</span>}
                checked={all}
                indeterminate={some && !all}
                onCheckedChange={(v) =>
                  setChosen(
                    v
                      ? [...chosen, ...keys.filter((k) => !chosen.includes(k))]
                      : chosen.filter((k) => !keys.includes(k)),
                  )
                }
              />
            </Th>
          ) : null}
          {columns.map((c) => (
            <Th
              key={c.key}
              className={cx(
                c.numeric && "text-right",
                columns[0]?.key === c.key && "max-md:sticky max-md:left-0 max-md:bg-surface-card",
              )}
              aria-sort={
                sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
              }
            >
              {c.sortValue ? (
                <button
                  type="button"
                  className="label-caps inline-flex cursor-pointer items-center gap-1 text-inherit"
                  onClick={() =>
                    setSort({
                      key: c.key,
                      dir: sort?.key === c.key && sort.dir === "asc" ? "desc" : "asc",
                    })
                  }
                >
                  {c.header}
                  {sort?.key === c.key ? (
                    sort.dir === "asc" ? (
                      <ChevronUp size={12} strokeWidth={1.5} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
                    )
                  ) : null}
                </button>
              ) : (
                c.header
              )}
            </Th>
          ))}
        </tr>
      </THead>
      <TBody>
        {loading
          ? [0, 1, 2].map((i) => (
              <Tr key={i}>
                {(selectable ? [{ key: "sel" }, ...columns] : columns).map((c) => (
                  <Td key={c.key}>
                    <span
                      className="block h-3.5 w-3/4 animate-pulse rounded-xs bg-surface-sunken motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  </Td>
                ))}
              </Tr>
            ))
          : visible.map((row) => {
              const k = rowKey(row);
              const on = chosen.includes(k);
              return (
                <Tr
                  key={k}
                  aria-selected={selectable ? on : undefined}
                  {...(rowHref?.(row)
                    ? { onClick: openRow(row), className: "cursor-pointer" }
                    : {})}
                >
                  {selectable ? (
                    <Td className="relative z-10">
                      <Checkbox
                        label={<span className="sr-only">Select row</span>}
                        checked={on}
                        onCheckedChange={(v) =>
                          setChosen(v ? [...chosen, k] : chosen.filter((x) => x !== k))
                        }
                      />
                    </Td>
                  ) : null}
                  {columns.map((c, i) => {
                    const href = i === 0 && rowHref ? rowHref(row) : null;
                    return (
                      <Td
                        key={c.key}
                        numeric={c.numeric}
                        className={cx(
                          i === 0 &&
                            "max-md:sticky max-md:left-0 max-md:bg-surface-card max-md:group-hover:bg-surface-sunken max-md:group-aria-selected:bg-lime-100 dark:max-md:group-aria-selected:bg-charcoal-700",
                        )}
                      >
                        {href ? (
                          <LinkAs
                            href={href}
                            data-row-link=""
                            onClick={() => onRowOpen?.(row)}
                            className="font-medium text-fg-strong no-underline before:absolute before:inset-0 before:content-[''] hover:underline focus-visible:underline"
                          >
                            {c.cell(row)}
                          </LinkAs>
                        ) : (
                          c.cell(row)
                        )}
                      </Td>
                    );
                  })}
                </Tr>
              );
            })}
      </TBody>
    </Table>
  );

  return (
    <div className="flex flex-col gap-3">
      <TableWrap className={className}>{table}</TableWrap>
      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-end gap-3 text-sm">
          <Button
            variant="ghost"
            size="sm"
            disabled={current <= 1}
            onClick={() => goTo(current - 1)}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <span className="tabular-nums text-fg-muted">
            Page {current} of {pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={current >= pages}
            onClick={() => goTo(current + 1)}
            aria-label="Next page"
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
