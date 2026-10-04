"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";

export const chipStyles = cva(
  [
    "inline-flex items-center gap-1.5 rounded-full border font-medium uppercase leading-tight tracking-wide whitespace-nowrap",
    "transition-[background-color,color,border-color] duration-(--dur-base) ease-out",
  ],
  {
    variants: {
      variant: {
        outline: "border-line bg-transparent text-charcoal-800 dark:text-cream-200",
        ink: "border-charcoal-800 bg-charcoal-800 text-cream-200",
        lime: "border-lime-500 bg-lime-500 text-charcoal-900",
        // clay-700 on clay-200 is 5.3:1; the system's clay-600 gave 4.1:1.
        clay: "border-clay-200 bg-clay-200 text-clay-700",
        dark: "border-charcoal-500 bg-transparent text-cream-300",
      },
      size: { sm: "px-2.5 py-1 text-[11px]", md: "px-3.5 py-1.5 text-[13px]" },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export type ChipProps = ComponentProps<"span"> &
  VariantProps<typeof chipStyles> & {
    /** A count shown after the label, in tabular figures. */
    count?: number;
    /** Makes the chip removable. The close button is named by `removeLabel`. */
    onRemove?: () => void;
    removeLabel?: string;
  };

/** The only pill in the system: a tag or a label. For a filter that toggles, use ChipToggle. */
export function Chip({
  variant,
  size,
  count,
  onRemove,
  removeLabel = "Remove",
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span className={cx(chipStyles({ variant, size }), className)} {...rest}>
      {children}
      {count !== undefined ? <span className="tabular-nums opacity-70">{count}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="-mr-1 inline-flex cursor-pointer rounded-full p-px"
        >
          <X size={12} strokeWidth={1.5} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

const TOGGLE =
  "cursor-pointer data-pressed:border-charcoal-800 data-pressed:bg-charcoal-800 data-pressed:text-cream-200 hover:not-data-pressed:border-charcoal-800 dark:data-pressed:border-lime-500 dark:data-pressed:bg-lime-500 dark:data-pressed:text-charcoal-900";

export type ChipToggleProps = Omit<ComponentProps<typeof Toggle>, "children"> &
  VariantProps<typeof chipStyles> & { children: ReactNode; count?: number | undefined };

/** A chip that is a toggle button (aria-pressed): a filter. Filled charcoal when on. */
export function ChipToggle({
  variant,
  size,
  count,
  className,
  children,
  ...rest
}: ChipToggleProps) {
  return (
    <Toggle className={cx(chipStyles({ variant, size }), TOGGLE, className)} {...rest}>
      {children}
      {count !== undefined ? <span className="tabular-nums opacity-70">{count}</span> : null}
    </Toggle>
  );
}

export type ChipGroupProps = Omit<ComponentProps<typeof ToggleGroup>, "children"> & {
  options: { value: string; label: ReactNode; count?: number; disabled?: boolean }[];
  size?: "sm" | "md";
};

/** A row of ChipToggles that share one value. Single choice by default; pass `multiple` for several. */
export function ChipGroup({ options, size, className, ...rest }: ChipGroupProps) {
  return (
    <ToggleGroup className={cx("flex flex-wrap gap-2", className)} {...rest}>
      {options.map((o) => (
        <ChipToggle key={o.value} value={o.value} size={size} count={o.count} disabled={o.disabled}>
          {o.label}
        </ChipToggle>
      ))}
    </ToggleGroup>
  );
}
