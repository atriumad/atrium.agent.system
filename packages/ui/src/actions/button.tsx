"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export const buttonStyles = cva(
  [
    "inline-flex items-center justify-center rounded-sm border font-medium leading-none tracking-[0.01em] whitespace-nowrap no-underline select-none",
    "cursor-pointer transition-[background-color,color,transform] duration-(--dur-base) ease-out",
    "active:translate-y-(--press-shift)",
    "data-disabled:cursor-not-allowed data-disabled:opacity-40 data-disabled:active:translate-y-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-charcoal-800 bg-charcoal-800 text-cream-200 hover:bg-charcoal-900 dark:border-lime-500 dark:bg-lime-500 dark:text-charcoal-900 dark:hover:bg-lime-600",
        lime: "border-lime-500 bg-lime-500 text-charcoal-900 hover:border-lime-600 hover:bg-lime-600",
        // The clay fill is clay-600, not the system's clay-500: cream on clay-500 is 3.8:1, on clay-600 5.2:1.
        clay: "border-clay-600 bg-clay-600 text-cream-100 hover:border-clay-700 hover:bg-clay-700",
        outline:
          "border-charcoal-800 bg-transparent text-charcoal-800 hover:bg-charcoal-800 hover:text-cream-200 dark:border-cream-300 dark:text-cream-200 dark:hover:bg-cream-200 dark:hover:text-charcoal-900",
        ghost:
          "border-transparent bg-transparent text-charcoal-800 hover:bg-cream-300 dark:text-cream-200 dark:hover:bg-charcoal-700",
      },
      size: {
        sm: "gap-1.5 px-3.5 py-[7px] text-[13px]",
        md: "gap-2 px-[22px] py-[11px] text-[15px]",
        lg: "gap-2.5 px-[30px] py-[15px] text-[17px]",
      },
      iconOnly: { true: "", false: "" },
      fullWidth: { true: "flex w-full", false: "" },
    },
    compoundVariants: [
      { iconOnly: true, size: "sm", class: "p-[7px]" },
      { iconOnly: true, size: "md", class: "p-[11px]" },
      { iconOnly: true, size: "lg", class: "p-[15px]" },
    ],
    defaultVariants: { variant: "primary", size: "md", iconOnly: false, fullWidth: false },
  },
);

export type ButtonProps = Omit<BaseButton.Props, "children"> &
  Omit<VariantProps<typeof buttonStyles>, "iconOnly"> & {
    children?: ReactNode;
    /** An icon before the label. */
    icon?: ReactNode;
    /** An icon after the label. */
    iconRight?: ReactNode;
    /** Shows a spinner, sets aria-busy and disables the button. It keeps its width. */
    loading?: boolean;
  };

/**
 * The only button in the system: squared, flat fills, a 1px stroke, the press nudges down.
 * One primary action per view; one lime per view. Never round it into a pill: chips are the pill.
 * For a link that looks like a button, pass `render={<a href="..." />}` and `nativeButton={false}`.
 */
export function Button({
  variant,
  size,
  fullWidth,
  icon,
  iconRight,
  loading,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <BaseButton
      disabled={disabled || loading}
      focusableWhenDisabled={loading}
      aria-busy={loading || undefined}
      className={cx(buttonStyles({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? (
        <Loader2
          size={16}
          strokeWidth={1.5}
          className="animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        icon
      )}
      {children}
      {iconRight}
    </BaseButton>
  );
}
