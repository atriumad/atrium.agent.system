import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export type DeltaProps = ComponentProps<"span"> & {
  /** The change, in percent. Positive is up. */
  value: number;
  /** Which direction is good. Fewer open cases is `down`. */
  goodWhen?: "up" | "down" | undefined;
  /** What the number is in. `pts` for a change in percentage points. */
  unit?: "%" | "pts" | undefined;
  labels?: { up: string; down: string; flat: string };
};

/** `pts` to one decimal, `%` to a whole number from 10 up; a trailing `.0` is dropped. */
export function formatDelta(value: number, unit: "%" | "pts"): number {
  const abs = Math.abs(value);
  return unit === "pts" || abs < 10 ? Math.round(abs * 10) / 10 : Math.round(abs);
}

/** The arrow shows direction; the color shows whether it is good (charcoal) or not (clay). Words carry it for a screen reader. */
export function Delta({
  value,
  goodWhen = "up",
  unit = "%",
  labels = { up: "up", down: "down", flat: "no change" },
  className,
  ...rest
}: DeltaProps) {
  const shown = formatDelta(value, unit);
  const dir = shown === 0 ? "flat" : value > 0 ? "up" : "down";
  const good = dir === "flat" ? null : dir === goodWhen;
  const Glyph = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 text-xs font-medium tracking-normal",
        good === false
          ? "text-clay-600 dark:text-clay-300"
          : good === null
            ? "text-fg-muted"
            : "text-fg-strong",
        className,
      )}
      {...rest}
    >
      <Glyph size={14} strokeWidth={1.5} aria-hidden="true" />
      {dir === "flat" ? (
        labels.flat
      ) : (
        <>
          {shown}
          {unit === "pts" ? " pts" : "%"}
          <span className="sr-only"> {labels[dir]}</span>
        </>
      )}
    </span>
  );
}
