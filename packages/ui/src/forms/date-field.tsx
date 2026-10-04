"use client";

import { type ChangeEvent, useState } from "react";
import { cx } from "../lib/cx";
import { Field, type FieldProps } from "./field";
import { Input, type InputProps } from "./input";

export type DateFieldProps = Pick<
  FieldProps,
  "label" | "optional" | "hint" | "error" | "className"
> & {
  value?: string | undefined;
  defaultValue?: string | undefined;
  onChange?: ((value: string) => void) | undefined;
  min?: string | undefined;
  max?: string | undefined;
  name?: string | undefined;
};

/** A date as yyyy-mm-dd, using the browser's own picker: it is keyboard and screen reader complete. */
export function DateField({
  value,
  defaultValue,
  onChange,
  min,
  max,
  name,
  ...field
}: DateFieldProps) {
  const control: InputProps = {
    type: "date",
    min,
    max,
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value),
  };
  if (value !== undefined) control.value = value;
  if (defaultValue !== undefined) control.defaultValue = defaultValue;
  return (
    <Field {...(name ? { name } : {})} {...field}>
      <Input {...control} />
    </Field>
  );
}

export type DateRange = { from: string; to: string };

export type DateRangeFieldProps = {
  value?: DateRange;
  defaultValue?: DateRange;
  onChange?: (range: DateRange) => void;
  fromLabel?: string;
  toLabel?: string;
  /** Presets shown as chips-in-buttons, each a function of today. */
  presets?: { label: string; range: (today: Date) => DateRange }[];
  invalidMessage?: string;
  className?: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (today: Date, n: number) => iso(new Date(today.getTime() - n * 86_400_000));

export const DEFAULT_RANGE_PRESETS = [
  { label: "Last 7 days", range: (t: Date) => ({ from: daysAgo(t, 6), to: iso(t) }) },
  { label: "Last 30 days", range: (t: Date) => ({ from: daysAgo(t, 29), to: iso(t) }) },
  { label: "Last 90 days", range: (t: Date) => ({ from: daysAgo(t, 89), to: iso(t) }) },
];

/** Two dates and optional presets. A range that ends before it starts is refused with a message. */
export function DateRangeField({
  value,
  defaultValue,
  onChange,
  fromLabel = "From",
  toLabel = "To",
  presets = DEFAULT_RANGE_PRESETS,
  invalidMessage = "The end date is before the start date.",
  className,
}: DateRangeFieldProps) {
  const [inner, setInner] = useState<DateRange>(defaultValue ?? { from: "", to: "" });
  const range = value ?? inner;
  const set = (next: DateRange) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };
  const bad = Boolean(range.from && range.to && range.to < range.from);
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          label={fromLabel}
          value={range.from}
          max={range.to || undefined}
          onChange={(from) => set({ ...range, from })}
        />
        <DateField
          label={toLabel}
          value={range.to}
          min={range.from || undefined}
          error={bad ? invalidMessage : undefined}
          onChange={(to) => set({ ...range, to })}
        />
      </div>
      {presets.length ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => set(p.range(new Date()))}
              className="cursor-pointer rounded-full border border-line px-3.5 py-1.5 text-[13px] font-medium tracking-wide uppercase hover:border-charcoal-800"
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
