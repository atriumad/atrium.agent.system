"use client";

import { useRef } from "react";
import type { RangeKey } from "../api";
import { Select } from "../forms/select";
import { cx } from "../lib/cx";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
];

const ALL = "__all";

export type PageControlsProps = {
  range: RangeKey;
  onRange: (r: RangeKey) => void;
  options: { value: string; label: string }[];
  value: string | null;
  onValue: (v: string | null) => void;
  allLabel: string;
  scopeLabel: string;
};

/** The range and the place or client a dashboard is about. */
export function PageControls({
  range,
  onRange,
  options,
  value,
  onValue,
  allLabel,
  scopeLabel,
}: PageControlsProps) {
  const group = useRef<HTMLDivElement>(null);
  // Arrow keys move and select, wrapping at the ends; Home and End go to the first and last.
  const onKey = (e: React.KeyboardEvent, at: number) => {
    const last = RANGES.length - 1;
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? at === last
          ? 0
          : at + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? at === 0
            ? last
            : at - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    const next = to === null ? undefined : RANGES[to];
    if (!next) return;
    e.preventDefault();
    onRange(next.key);
    group.current?.querySelectorAll<HTMLElement>("[role=radio]")[to ?? 0]?.focus();
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        ref={group}
        role="radiogroup"
        aria-label="Range"
        className="inline-flex rounded-card border border-frame bg-surface-card p-0.5"
      >
        {RANGES.map((r, idx) => {
          const on = r.key === range;
          return (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onKeyDown={(e) => onKey(e, idx)}
              onClick={() => onRange(r.key)}
              className={cx(
                "min-h-9 min-w-11 cursor-pointer focus-visible:outline-2 focus-visible:outline-focus rounded-[inherit] px-3 text-sm font-medium tabular-nums",
                on ? "bg-lime-100 text-fg-strong" : "text-fg-muted hover:text-fg-strong",
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <div className="w-full sm:w-auto sm:min-w-48">
        <Select
          aria-label={scopeLabel}
          options={[{ value: ALL, label: allLabel }, ...options]}
          value={value ?? ALL}
          onValueChange={(v) => onValue(!v || v === ALL ? null : v)}
        />
      </div>
    </div>
  );
}

/** When the figures were last worked out, in the viewer's own locale. */
export function UpdatedStamp({ at, note }: { at: string; note: string }) {
  const time = new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <p className="m-0 text-xs text-fg-muted">
      Updated {time} · {note}
    </p>
  );
}
