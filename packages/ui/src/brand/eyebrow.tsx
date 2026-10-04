import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export type EyebrowProps = ComponentProps<"span"> & {
  /** The 28px leading rule. On by default. */
  rule?: boolean;
  tone?: "muted" | "ink" | "on-dark" | "lime";
};

const TONE = {
  muted: "text-fg-muted",
  ink: "text-charcoal-800",
  "on-dark": "text-cream-400",
  lime: "text-lime-500", // only on a charcoal field: lime-500 is 11.6:1 there, 1.4:1 on cream
};

/** The wide-caps label above a headline. */
export function Eyebrow({ rule = true, tone = "muted", className, ...rest }: EyebrowProps) {
  return (
    <span
      className={cx(
        "label-caps inline-flex items-center gap-3",
        TONE[tone],
        rule && "before:h-px before:w-7 before:bg-current before:opacity-50 before:content-['']",
        className,
      )}
      {...rest}
    />
  );
}
