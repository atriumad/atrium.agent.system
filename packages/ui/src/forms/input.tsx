"use client";

import { Field as BaseField } from "@base-ui/react/field";
import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";
import { Field, type FieldProps } from "./field";
import { controlBase } from "./styles";

export type InputProps = Omit<ComponentProps<typeof BaseField.Control>, "size"> & {
  size?: "sm" | "md" | undefined;
};

/** A squared text input. Put it inside a Field, or use TextField. */
export function Input({ size = "md", className, ...rest }: InputProps) {
  return (
    <BaseField.Control
      className={cx(controlBase, size === "sm" && "px-[11px] py-2 text-sm", className)}
      {...rest}
    />
  );
}

export type TextFieldProps = Omit<FieldProps, "children"> & {
  inputProps?: InputProps;
  size?: "sm" | "md" | undefined;
} & Pick<
    InputProps,
    | "type"
    | "placeholder"
    | "autoComplete"
    | "inputMode"
    | "defaultValue"
    | "value"
    | "onChange"
    | "name"
    | "required"
  >;

/** Label, input and hint or error in one. */
export function TextField({
  label,
  optional,
  optionalLabel,
  hint,
  error,
  size,
  className,
  inputProps,
  type,
  placeholder,
  autoComplete,
  inputMode,
  defaultValue,
  value,
  onChange,
  name,
  required,
  ...rest
}: TextFieldProps) {
  const control = {
    type,
    placeholder,
    autoComplete,
    inputMode,
    defaultValue,
    value,
    onChange,
    required,
    ...inputProps,
  };
  return (
    <Field
      label={label}
      optional={optional}
      optionalLabel={optionalLabel}
      hint={hint}
      error={error}
      className={className}
      name={name}
      {...rest}
    >
      <Input size={size} {...(control as InputProps)} />
    </Field>
  );
}

export type SearchInputProps = Omit<InputProps, "type" | "size"> & { label?: string };

/** A search field with a leading icon. The label is the accessible name. */
export function SearchInput({ label = "Search", className, ...rest }: SearchInputProps) {
  return (
    <div className={cx("relative", className)}>
      <Search
        size={16}
        strokeWidth={1.5}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        aria-label={label}
        className={cx(controlBase, "py-2 pl-9 text-sm")}
        {...(rest as ComponentProps<"input">)}
      />
    </div>
  );
}

export type TextareaProps = Omit<ComponentProps<"textarea">, "size">;

/** A multi-line field. Put it inside a Field, or use TextareaField. */
export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  return (
    <BaseField.Control
      render={<textarea rows={rows} />}
      className={cx(controlBase, "min-h-24 resize-y leading-normal", className)}
      {...(rest as object)}
    />
  );
}

export function TextareaField({
  label,
  optional,
  optionalLabel,
  hint,
  error,
  className,
  ...rest
}: Pick<FieldProps, "label" | "optional" | "optionalLabel" | "hint" | "error"> & TextareaProps) {
  return (
    <Field
      label={label}
      optional={optional}
      optionalLabel={optionalLabel}
      hint={hint}
      error={error}
      className={className}
    >
      <Textarea {...rest} />
    </Field>
  );
}

export type { ReactNode };
