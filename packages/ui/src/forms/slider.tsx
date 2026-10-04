"use client";

import { Slider as BaseSlider } from "@base-ui/react/slider";
import type { ComponentProps } from "react";
import { cx } from "../lib/cx";

export type SliderProps = ComponentProps<typeof BaseSlider.Root> & {
  label?: string;
  showValue?: boolean;
};

/** A 4px charcoal track with a squared thumb. The label names it; the value is read out beside it. */
export function Slider({ label, showValue = true, className, ...rest }: SliderProps) {
  return (
    <BaseSlider.Root className={cx("flex w-full flex-col gap-2", className)} {...rest}>
      {label || showValue ? (
        <div className="flex items-baseline justify-between">
          {label ? (
            <BaseSlider.Label className="label-caps text-fg-muted">{label}</BaseSlider.Label>
          ) : (
            <span />
          )}
          {showValue ? <BaseSlider.Value className="text-sm tabular-nums" /> : null}
        </div>
      ) : null}
      <BaseSlider.Control className="flex h-5 w-full touch-none items-center select-none">
        <BaseSlider.Track className="h-1 w-full rounded-xs bg-cream-300 dark:bg-charcoal-700">
          <BaseSlider.Indicator className="rounded-xs bg-charcoal-800 dark:bg-lime-500" />
          <BaseSlider.Thumb className="size-[18px] rounded-xs border border-charcoal-800 bg-lime-500 outline-none data-disabled:opacity-40" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
