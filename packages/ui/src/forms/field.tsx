"use client";

import { Field as BaseField } from "@base-ui/react/field";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export type FieldProps = Omit<BaseField.Root.Props, "children"> & {
  label: ReactNode;
  /** Marks the field "(optional)". Most fields are required, so leave those unmarked. */
  optional?: boolean | undefined;
  optionalLabel?: string | undefined;
  hint?: ReactNode;
  /** An error message. It replaces the hint, is announced and is tied to the control. */
  error?: ReactNode;
  children: ReactNode;
};

/** A label above, the control, then a hint or an error underneath. Wires the ids for assistive technology. */
export function Field({
  label,
  optional,
  optionalLabel = "(optional)",
  hint,
  error,
  children,
  className,
  invalid,
  ...rest
}: FieldProps) {
  return (
    <BaseField.Root
      invalid={invalid ?? Boolean(error)}
      className={cx("flex min-w-0 flex-col gap-2", className)}
      {...rest}
    >
      <BaseField.Label className="label-caps text-fg-muted">
        {label}
        {optional ? (
          <span className="ml-1 font-normal tracking-normal normal-case"> {optionalLabel}</span>
        ) : null}
      </BaseField.Label>
      {children}
      {error ? (
        <BaseField.Error
          match
          className="flex items-start gap-1.5 text-xs text-clay-600 dark:text-clay-300"
          role="alert"
        >
          <AlertCircle size={14} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </BaseField.Error>
      ) : hint ? (
        <BaseField.Description className="text-xs text-fg-muted">{hint}</BaseField.Description>
      ) : null}
    </BaseField.Root>
  );
}
