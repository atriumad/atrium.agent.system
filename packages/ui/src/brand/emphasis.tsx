import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

/** The italic-serif phrase set inside a display headline. */
export function Emphasis({ className, ...rest }: ComponentProps<"em">) {
  return (
    <em
      className={cx(
        "mr-[0.04em] pr-[0.18em] font-serif font-normal tracking-normal italic",
        className,
      )}
      {...rest}
    />
  );
}
