"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
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
  className?: string;
};

type Sort = { key: string; dir: "asc" | "desc" };

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
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<Sort | null>(null);
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

  const keys = sorted.map(rowKey);
  const all = keys.length > 0 && keys.every((k) => chosen.includes(k));
  const some = keys.some((k) => chosen.includes(k));

  if (!loading && rows.length === 0 && empty) return <>{empty}</>;

  return (
    <TableWrap className={className}>
      <Table aria-label={label} aria-busy={loading || undefined}>
        <THead>
          <tr>
            {selectable ? (
              <Th className="w-10">
                <Checkbox
                  label={<span className="sr-only">Select all rows</span>}
                  checked={all}
                  indeterminate={some && !all}
                  onCheckedChange={(v) => setChosen(v ? keys : [])}
                />
              </Th>
            ) : null}
            {columns.map((c) => (
              <Th
                key={c.key}
                className={cx(c.numeric && "text-right")}
                aria-sort={
                  sort?.key === c.key
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
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
            : sorted.map((row) => {
                const k = rowKey(row);
                const on = chosen.includes(k);
                return (
                  <Tr key={k} aria-selected={selectable ? on : undefined}>
                    {selectable ? (
                      <Td>
                        <Checkbox
                          label={<span className="sr-only">Select row</span>}
                          checked={on}
                          onCheckedChange={(v) =>
                            setChosen(v ? [...chosen, k] : chosen.filter((x) => x !== k))
                          }
                        />
                      </Td>
                    ) : null}
                    {columns.map((c) => (
                      <Td key={c.key} numeric={c.numeric}>
                        {c.cell(row)}
                      </Td>
                    ))}
                  </Tr>
                );
              })}
        </TBody>
      </Table>
    </TableWrap>
  );
}
