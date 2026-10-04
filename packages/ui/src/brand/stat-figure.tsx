import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";

export type StatFigureProps = Omit<ComponentProps<"div">, "children"> & {
  value: ReactNode;
  /** The wide-caps caption that says what the number is. */
  label: string;
  tone?: "ink" | "lime" | "clay" | "cream";
  size?: "sm" | "md" | "lg";
};

const SIZE = { sm: "text-[40px]", md: "text-[64px]", lg: "text-[96px]" };
// lime-600 is for a charcoal field only; on cream it is 1.4:1.
const TONE = {
  ink: "text-charcoal-900",
  lime: "text-lime-600",
  clay: "text-clay-500",
  cream: "text-cream-200",
};

/** A big serif figure with a caps caption: the proof device. Figures are always set in the serif. */
export function StatFigure({
  value,
  label,
  tone = "ink",
  size = "md",
  className,
  ...rest
}: StatFigureProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)} {...rest}>
      <span
        className={cx(
          "font-serif leading-[0.9] font-normal tracking-tight tabular-nums",
          SIZE[size],
          TONE[tone],
        )}
      >
        {value}
      </span>
      <span className={cx("label-caps", tone === "cream" ? "text-cream-400" : "text-fg-muted")}>
        {label}
      </span>
    </div>
  );
}
