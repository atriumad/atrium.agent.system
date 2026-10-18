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
  className?: string;
};

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
  className,
}: KpiTileProps) {
  const ok = state === "ok";
  const cls = cx(
    "flex flex-col gap-2 rounded-card border border-frame bg-surface-card p-5",
    href && "no-underline transition-colors hover:border-line focus-visible:outline-2",
    className,
  );
  const body = (
    <>
      <span className="label-caps text-fg-muted">{label}</span>
      <span className="flex items-baseline gap-2.5 font-serif text-5xl leading-[0.9] font-normal tracking-tight text-fg-strong tabular-nums dark:text-lime-500">
        {value}
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
