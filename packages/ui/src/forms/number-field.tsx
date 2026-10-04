"use client";

import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { Minus, Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { cx } from "../lib/cx";
import { controlBase } from "./styles";

export type NumberFieldProps = ComponentProps<typeof BaseNumberField.Root> & {
  label: string;
  hint?: string;
};

/** A number input with squared step buttons. The label is the wide-caps label. */
export function NumberField({ label, hint, className, ...rest }: NumberFieldProps) {
  const step =
    "grid w-10 cursor-pointer place-content-center border-field text-fg-body hover:bg-cream-300 data-disabled:cursor-not-allowed data-disabled:opacity-40 dark:hover:bg-charcoal-700";
  return (
    <BaseNumberField.Root className={cx("flex flex-col gap-2", className)} {...rest}>
      <label className="label-caps text-fg-muted">{label}</label>
      <BaseNumberField.Group className="flex">
        <BaseNumberField.Decrement
          className={cx(step, "rounded-l-sm border border-r-0")}
          aria-label={`Decrease ${label}`}
        >
          <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
        </BaseNumberField.Decrement>
        <BaseNumberField.Input
          className={cx(controlBase, "rounded-none text-center tabular-nums")}
          aria-label={label}
        />
        <BaseNumberField.Increment
          className={cx(step, "rounded-r-sm border border-l-0")}
          aria-label={`Increase ${label}`}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        </BaseNumberField.Increment>
      </BaseNumberField.Group>
      {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
    </BaseNumberField.Root>
  );
}
