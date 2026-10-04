"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { buttonStyles } from "./button";

export type IconButtonProps = Omit<BaseButton.Props, "children" | "aria-label"> &
  Omit<VariantProps<typeof buttonStyles>, "iconOnly" | "fullWidth"> & {
    /** The accessible name. An icon alone is not a label. */
    label: string;
    icon: ReactNode;
  };

/** A square button that holds only an icon. 44px on touch surfaces: use size="lg" there. */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <BaseButton
      aria-label={label}
      className={cx(buttonStyles({ variant, size, iconOnly: true }), className)}
      {...rest}
    >
      {icon}
    </BaseButton>
  );
}
