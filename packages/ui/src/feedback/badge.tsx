import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, Minus, XCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export const badgeStyles = cva(
  "inline-flex items-center gap-1.5 rounded-xs px-[7px] py-[3px] text-2xs leading-tight font-medium tracking-wide whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        ink: "bg-charcoal-800 text-cream-200",
        lime: "bg-lime-500 text-charcoal-900",
        clay: "bg-clay-600 text-cream-100",
        quiet: "bg-cream-300 text-charcoal-500 dark:bg-charcoal-700 dark:text-cream-300",
      },
    },
    defaultVariants: { variant: "ink" },
  },
);

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeStyles>;

/** A squared micro-label for a count or a category. Not interactive. */
export function Badge({ variant, className, ...rest }: BadgeProps) {
  return <span className={cx(badgeStyles({ variant }), className)} {...rest} />;
}

export type Status = "positive" | "warning" | "danger" | "info" | "neutral";

const STATUS: Record<Status, string> = {
  positive: "bg-status-positive-bg text-status-positive-fg",
  warning: "bg-status-warning-bg text-status-warning-fg",
  danger: "bg-status-danger-bg text-status-danger-fg",
  info: "bg-status-info-bg text-status-info-fg",
  neutral: "bg-status-neutral-bg text-status-neutral-fg",
};
export const STATUS_ICON = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Minus,
};

export type StatusBadgeProps = ComponentProps<"span"> & { status: Status; dot?: boolean };

/**
 * A status told apart by a pill fill and a mark, and always with a word: color never speaks alone.
 * Use the icon for a state that changes what to do ("Overdue"), the dot for a steady health in a dense table.
 */
export function StatusBadge({ status, dot, className, children, ...rest }: StatusBadgeProps) {
  const Glyph = STATUS_ICON[status];
  return (
    <span
      className={cx(
        badgeStyles({ variant: null }),
        "rounded-full px-2.5",
        STATUS[status],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span className="size-[7px] shrink-0 rounded-full bg-current" aria-hidden="true" />
      ) : (
        <Glyph size={12} strokeWidth={1.5} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
