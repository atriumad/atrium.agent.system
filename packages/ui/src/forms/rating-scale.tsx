"use client";

import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { cx } from "../lib/cx";

/** Index 0 is the rating 1. The production survey uses the same five faces. */
export const RATING_EMOJI = ["😠", "🙁", "😐", "🙂", "😍"] as const;
export const RATING_LABEL = ["Angry", "Unhappy", "Neutral", "Happy", "Loved it"] as const;

export type RatingScaleProps = {
  /** 1 to 5, or null when nothing is chosen. */
  value: number | null;
  onValueChange: (value: number | null) => void;
  "aria-label"?: string;
  className?: string;
};

/** Five emoji faces as one radio group: arrow keys move and choose, the chosen label is read out. */
export function RatingScale({
  value,
  onValueChange,
  "aria-label": ariaLabel = "Rating",
  className,
}: RatingScaleProps) {
  return (
    <div className={className}>
      <BaseRadioGroup
        aria-label={ariaLabel}
        value={value === null ? "" : String(value)}
        onValueChange={(v) => onValueChange(v ? Number(v) : null)}
        className="flex gap-2"
      >
        {RATING_EMOJI.map((emoji, i) => (
          <BaseRadio.Root
            key={emoji}
            value={String(i + 1)}
            aria-label={RATING_LABEL[i]}
            className={cx(
              "grid size-14 min-h-11 min-w-11 flex-1 cursor-pointer place-content-center rounded-sm border border-field bg-cream-100 text-3xl leading-none opacity-60 transition-[background-color,border-color,opacity] duration-(--dur-fast) ease-out",
              "hover:border-charcoal-800 hover:opacity-100 data-checked:border-2 data-checked:border-charcoal-800 data-checked:bg-lime-500 data-checked:opacity-100",
              "focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-transparent dark:data-checked:bg-lime-500",
            )}
          >
            <span aria-hidden="true">{emoji}</span>
          </BaseRadio.Root>
        ))}
      </BaseRadioGroup>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-fg-body">
        {value === null ? "" : RATING_LABEL[value - 1]}
      </p>
    </div>
  );
}
