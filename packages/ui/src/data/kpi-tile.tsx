import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { Sparkline } from "./charts";
import { Delta } from "./delta";

export type KpiState = "ok" | { tooFew: number } | "none";

export type KpiTileProps = {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number;
  deltaUnit?: "%" | "pts";
  goodWhen?: "up" | "down";
  note?: string;
  spark?: number[];
  sparkLabel?: string;
  href?: string;
  state: KpiState;
  /** `lime` washes the tile; use it on one tile per view. */
  tone?: "default" | "lime";
  /** `sans` is for durations such as `11h 43m`, where the serif 1 reads as an l. */
  figureFont?: "serif" | "sans";
  className?: string;
};

/** `11h 43m` as medium sans digits with small muted units. Anything else is left as it is. */
function Duration({ text }: { text: string }) {
  const parts = text.split(/(\d+)([hm])/).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part === "h" || part === "m" ? (
          <span key={i} className="text-lg text-fg-muted">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A figure tile: caps label, serif figure, and either its change and trend or the reason there is none. */
export function KpiTile({
  label,
  value,
  unit,
  delta,
  deltaUnit,
  goodWhen,
  note,
  spark,
  sparkLabel,
  href,
  state,
  tone = "default",
  figureFont = "serif",
  className,
}: KpiTileProps) {
  const ok = state === "ok";
  const cls = cx(
    "flex flex-col gap-2 rounded-card border border-frame p-5",
    tone === "lime" ? "bg-lime-300 dark:bg-charcoal-700" : "bg-surface-card",
    href && "no-underline transition-colors hover:border-line focus-visible:outline-2",
    className,
  );
  const body = (
    <>
      <span className="label-caps text-fg-muted">{label}</span>
      <div className="flex flex-1 flex-col justify-center gap-2">
        <span
          className={cx(
            "flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 text-4xl leading-[0.9] tracking-tight text-fg-strong tabular-nums 2xl:text-5xl dark:text-lime-500",
            figureFont === "sans" ? "font-sans font-medium" : "font-serif font-normal",
          )}
        >
          {figureFont === "sans" && typeof value === "string" ? <Duration text={value} /> : value}
          {unit ? (
            <span className="font-sans text-sm tracking-normal text-fg-muted">{unit}</span>
          ) : null}
          {ok && delta !== undefined ? (
            <Delta value={delta} goodWhen={goodWhen} unit={deltaUnit} />
          ) : null}
        </span>
        {ok && spark ? <Sparkline values={spark} label={sparkLabel ?? `${label} trend`} /> : null}
        {typeof state === "object" ? (
          <span className="text-xs text-fg-muted">Too few answers ({state.tooFew})</span>
        ) : state === "none" ? (
          <span className="text-xs text-fg-muted">No data yet</span>
        ) : null}
      </div>
      {note ? <span className="text-xs text-fg-muted">{note}</span> : null}
    </>
  );
  return href ? (
    <a href={href} className={cx(cls, "text-inherit")}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
