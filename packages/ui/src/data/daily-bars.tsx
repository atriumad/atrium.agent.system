"use client";

import { cx } from "../lib/cx";

export type DailyBarsProps = {
  days: { date: string; count: number }[];
  label: string;
  className?: string;
};

const SLOT = 10;
const BAR = 7;
const H = 56;

/** One bar per day, scaled to the width it is given, so 7, 30 or 90 days all fit. The values are in the label. */
export function DailyBars({ days, label, className }: DailyBarsProps) {
  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((a, d) => a + d.count, 0);
  const text = `${label}, ${total} in ${days.length} days: ${days.map((d) => `${d.date} ${d.count}`).join(", ")}`;
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${Math.max(days.length, 1) * SLOT} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={text}
      className={cx("text-fg-strong", className)}
    >
      {days.map((d, i) => {
        const h = d.count > 0 ? Math.max(2, (d.count / max) * (H - 2)) : 1;
        return (
          <rect
            key={d.date}
            data-day={d.date}
            x={i * SLOT + (SLOT - BAR) / 2}
            y={H - h}
            width={BAR}
            height={h}
            fill="currentColor"
            opacity={d.count > 0 ? 1 : 0.25}
          />
        );
      })}
    </svg>
  );
}
