import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export type HighlightProps = ComponentProps<"span"> & { color?: "lime" | "clay" };

const FILL = { lime: "from-lime-500 to-lime-500", clay: "from-clay-200 to-clay-200" };

/** A flat marker block behind one word. One emphasis device per line, never two. */
export function Highlight({ color = "lime", className, ...rest }: HighlightProps) {
  return (
    <span
      className={cx(
        "box-decoration-clone bg-linear-to-b bg-size-[100%_0.5em] bg-position-[left_bottom_0.14em] bg-no-repeat px-[0.1em]",
        FILL[color],
        className,
      )}
      {...rest}
    />
  );
}
