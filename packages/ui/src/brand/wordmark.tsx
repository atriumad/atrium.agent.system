import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export type WordmarkProps = ComponentProps<"span"> & {
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "ink" | "cream" | "lime" | "clay";
};

const SIZE = {
  sm: "text-base tracking-[0.02em]",
  md: "text-2xl tracking-[0.01em]",
  lg: "text-[44px] tracking-[-0.01em]",
  xl: "text-[96px] tracking-[-0.03em]",
};
const TONE = {
  ink: "text-charcoal-900",
  cream: "text-cream-200",
  lime: "text-lime-500",
  clay: "text-clay-500",
};

/** The typographic brand lockup. No logo artwork exists for this brand: the mark is the name. */
export function Wordmark({ size = "md", tone = "ink", className, ...rest }: WordmarkProps) {
  return (
    <span
      className={cx(
        "inline-flex items-baseline gap-[0.34em] leading-none font-normal uppercase",
        SIZE[size],
        TONE[tone],
        className,
      )}
      {...rest}
    >
      <span>Atrium</span>
      <span className="opacity-45" aria-hidden="true">
        AD
      </span>
      <span className="sr-only">AD</span>
    </span>
  );
}
