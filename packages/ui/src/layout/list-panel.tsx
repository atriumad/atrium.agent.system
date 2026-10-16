import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

/**
 * A list is one bordered panel with hairline dividers between rows, not a stack of cards.
 * Row height follows `--row-py`, which the app frame sets: compact for the agency, roomy for a client.
 */
export function ListPanel({ className, ...rest }: ComponentProps<"ul">) {
  return (
    <ul
      className={cx(
        "m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-card p-0",
        className,
      )}
      {...rest}
    />
  );
}

/** The padding of one row in a `ListPanel`. */
export const ROW_PAD = "px-5 py-(--row-py,1rem)";
