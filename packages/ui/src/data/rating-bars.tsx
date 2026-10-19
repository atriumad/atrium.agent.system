"use client";

import { cx } from "../lib/cx";

export type RatingBarsProps = {
  /** Answers at 1, 2, 3, 4 and 5 stars, in that order. */
  counts: readonly [number, number, number, number, number];
  label: string;
  className?: string;
};

/** Five horizontal bars, five stars first, scaled to the largest. The values are in the label. */
export function RatingBars({ counts, label, className }: RatingBarsProps) {
  const max = Math.max(...counts, 1);
  const rows = [5, 4, 3, 2, 1].map((stars) => ({ stars, n: counts[stars - 1] ?? 0 }));
  const total = counts.reduce((a, n) => a + n, 0);
  const text = `${label}, ${total} answers: ${rows
    .map((r) => `${r.stars} ${r.stars === 1 ? "star" : "stars"} ${r.n}`)
    .join(", ")}`;
  return (
    <div role="img" aria-label={text} className={cx("flex flex-col gap-1.5", className)}>
      {rows.map(({ stars, n }) => (
        <div key={stars} className="flex items-center gap-2 text-sm">
          <span className="w-8 shrink-0 tabular-nums text-fg-muted">{stars} ★</span>
          <span className="h-2 min-w-0 flex-1 rounded-sm border border-frame">
            <span
              data-bar={stars}
              className="block h-full bg-charcoal-800 dark:bg-cream-300"
              style={{ width: `${(n / max) * 100}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right tabular-nums text-fg-strong">{n}</span>
        </div>
      ))}
    </div>
  );
}
