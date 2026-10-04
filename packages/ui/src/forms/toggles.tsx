"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { CheckboxGroup as BaseCheckboxGroup } from "@base-ui/react/checkbox-group";
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/cx";

const label =
  "inline-flex cursor-pointer items-center gap-3 text-sm has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50";

export type CheckboxProps = Omit<ComponentProps<typeof BaseCheckbox.Root>, "children"> & {
  label: ReactNode;
};

/** A squared 18px box that fills lime with a charcoal tick (a drawn tick, not an icon). */
export function Checkbox({ label: text, className, ...rest }: CheckboxProps) {
  return (
    <label className={label}>
      <BaseCheckbox.Root
        className={cx(
          "grid size-[18px] shrink-0 cursor-pointer place-content-center rounded-xs border border-field bg-cream-100 transition-colors duration-(--dur-fast) ease-out",
          "data-checked:border-charcoal-800 data-checked:bg-lime-500 data-indeterminate:border-charcoal-800 data-indeterminate:bg-lime-500 data-disabled:cursor-not-allowed dark:bg-transparent dark:data-checked:bg-lime-500",
          className,
        )}
        {...rest}
      >
        <BaseCheckbox.Indicator className="block h-[5px] w-[9px] -translate-y-px -rotate-45 border-b-2 border-l-2 border-charcoal-900 data-indeterminate:h-0 data-indeterminate:w-2 data-indeterminate:rotate-0 data-indeterminate:border-l-0" />
      </BaseCheckbox.Root>
      {text}
    </label>
  );
}

export function CheckboxGroup({ className, ...rest }: ComponentProps<typeof BaseCheckboxGroup>) {
  return (
    <BaseCheckboxGroup className={cx("flex flex-col items-start gap-3", className)} {...rest} />
  );
}

export type RadioProps = Omit<ComponentProps<typeof BaseRadio.Root>, "children"> & {
  label: ReactNode;
};

/** A radio is round because its shape carries its meaning. */
export function Radio({ label: text, className, ...rest }: RadioProps) {
  return (
    <label className={label}>
      <BaseRadio.Root
        className={cx(
          "grid size-[18px] shrink-0 cursor-pointer place-content-center rounded-full border border-field bg-cream-100 transition-colors duration-(--dur-fast) ease-out",
          "data-checked:border-charcoal-800 data-checked:bg-lime-500 data-disabled:cursor-not-allowed dark:bg-transparent",
          className,
        )}
        {...rest}
      >
        <BaseRadio.Indicator className="block size-2 rounded-full bg-charcoal-900" />
      </BaseRadio.Root>
      {text}
    </label>
  );
}

export function RadioGroup({ className, ...rest }: ComponentProps<typeof BaseRadioGroup>) {
  return <BaseRadioGroup className={cx("flex flex-col items-start gap-3", className)} {...rest} />;
}

export type SwitchProps = Omit<ComponentProps<typeof BaseSwitch.Root>, "children"> & {
  label: ReactNode;
};

/** A switch takes effect at once: for settings, never for a form with a Save button. */
export function Switch({ label: text, className, ...rest }: SwitchProps) {
  return (
    <label className={label}>
      <BaseSwitch.Root
        className={cx(
          "relative h-[22px] w-[38px] shrink-0 cursor-pointer rounded-xs border border-field bg-cream-300 transition-colors duration-(--dur-base) ease-out",
          "data-checked:border-charcoal-800 data-checked:bg-lime-500 data-disabled:cursor-not-allowed dark:bg-charcoal-700",
          className,
        )}
        {...rest}
      >
        <BaseSwitch.Thumb className="block size-4 translate-x-0.5 rounded-[1px] bg-charcoal-800 transition-transform duration-(--dur-base) ease-out data-checked:translate-x-[18px]" />
      </BaseSwitch.Root>
      {text}
    </label>
  );
}
