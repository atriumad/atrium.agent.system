"use client";

import { OTPField as BaseOTPField } from "@base-ui/react/otp-field";
import type { ComponentProps } from "react";
import { cx } from "../lib/cx";
import { controlBase } from "./styles";

export type OtpFieldProps = Omit<ComponentProps<typeof BaseOTPField.Root>, "children"> & {
  length?: number;
  label: string;
};

/** A one-time code: one squared cell per digit, for sign-in and for confirming a contact. */
export function OtpField({ length = 6, label, className, ...rest }: OtpFieldProps) {
  return (
    <BaseOTPField.Root
      length={length}
      aria-label={label}
      className={cx("flex gap-2", className)}
      {...(rest as object)}
    >
      {Array.from({ length }, (_, i) => (
        <BaseOTPField.Input
          key={i}
          aria-label={`${label}, digit ${i + 1}`}
          className={cx(controlBase, "size-12 px-0 py-0 text-center text-xl tabular-nums")}
        />
      ))}
    </BaseOTPField.Root>
  );
}
