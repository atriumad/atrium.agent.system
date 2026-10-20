import { Check } from "lucide-react";
import { cx } from "../lib/cx";
import { ACCENT_STYLE, type LoyaltyAccent } from "./accent";

/** Up to 5 across; more than 5 stamps split into two near-even rows (20 stamps: 4 rows of 5). */
export function gridColumns(required: number): number {
  return required <= 5 ? required : Math.min(5, Math.ceil(required / 2));
}

const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export type StampGridProps = {
  required: number;
  filled: number;
  accent: LoyaltyAccent;
  animateIndex?: number | null | undefined;
  label: string;
};

/** The stamps of one card: a CSS circle each, filled in the accent with an ink tick, or dashed. */
export function StampGrid({ required, filled, accent, animateIndex, label }: StampGridProps) {
  const style = ACCENT_STYLE[accent];
  const columns = Math.max(1, gridColumns(required));
  return (
    <div
      role="img"
      aria-label={label}
      className={cx("grid gap-3", COLUMNS[columns] ?? "grid-cols-5")}
    >
      {Array.from({ length: required }, (_, index) => {
        const isFilled = index < filled;
        return (
          <span
            key={index}
            data-stamp={isFilled ? "filled" : "empty"}
            className={cx(
              "grid aspect-square place-content-center rounded-full border",
              isFilled
                ? cx("border-charcoal-900 text-charcoal-900", style.fill)
                : "border-dashed border-charcoal-800/50 dark:border-cream-300/50",
              index === animateIndex && "motion-safe:animate-stamp-in",
            )}
          >
            {isFilled ? <Check size={20} strokeWidth={2} aria-hidden="true" /> : null}
          </span>
        );
      })}
    </div>
  );
}
