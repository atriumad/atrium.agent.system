"use client";

import { Button } from "../actions/button";
import { Chip } from "../actions/chip";
import { SearchInput } from "../forms/input";
import { type Option, Select } from "../forms/select";

export type FilterDef = {
  key: string;
  label: string;
  options: Option[];
  value: string | null;
  onChange: (value: string | null) => void;
};

export type FilterBarProps = {
  search: {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
  };
  filters: FilterDef[];
  /** Rows that match now, and rows there are. */
  shown: number;
  total: number;
  onClear: () => void;
};

/** Search, filter dropdowns, the active filters as removable chips, and how many rows match. */
export function FilterBar({ search, filters, shown, total, onClear }: FilterBarProps) {
  const active = filters.filter((f) => f.value);
  const dirty = search.value !== "" || active.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="w-full sm:w-64"
          label={search.label ?? "Search"}
          placeholder={search.placeholder ?? "Search"}
          value={search.value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => search.onChange(e.target.value)}
        />
        {filters.map((f) => (
          // Select's trigger is w-full; the width is set on this wrapper so no two widths compete.
          <div key={f.key} className="w-full sm:w-auto sm:min-w-36">
            <Select
              aria-label={f.label}
              placeholder={f.label}
              options={f.options}
              value={f.value}
              onValueChange={f.onChange}
            />
          </div>
        ))}
        <p role="status" className="m-0 ml-auto text-sm tabular-nums text-fg-muted">
          {shown === total ? `${total}` : `${shown} of ${total}`}
        </p>
      </div>
      {dirty ? (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((f) => {
            const word = f.options.find((o) => o.value === f.value)?.label ?? f.value;
            return (
              <Chip
                key={f.key}
                variant="outline"
                size="sm"
                onRemove={() => f.onChange(null)}
                removeLabel={`Remove filter ${f.label}`}
              >
                {f.label}: {word}
              </Chip>
            );
          })}
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
